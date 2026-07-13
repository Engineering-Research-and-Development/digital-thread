import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { TemplateResolverService } from './template-resolver.service'
import { DataSourcesService } from '@/datasources/datasources.service'
import { createAdapter } from '@/datasources/connectivity/adapter.factory'
import type {
  BindingType,
  FromDataSourceEventConfig,
  FromDataSourceQueryConfig,
  FromMetadataConfig,
  FromNodeBindingConfig,
  ResolvedBinding,
} from './binding.types'
import * as crypto from 'crypto'

/**
 * BindingRuntimeService — resolves a node's declared input bindings against the
 * iteration context + template parameters, producing either a concrete value,
 * a subscription record, or a deferred/waiting state.
 *
 * Execution modes:
 *   MANUAL              — no resolution; user uploads directly.
 *   FROM_NODE           — use the predecessor's outputFilePath.
 *   FROM_DATASOURCE_QUERY — templated fetch; on `onMissing=WAIT_FOR_EVENT` turns
 *                          into a subscription entry so a subsequent event can fulfil.
 *   FROM_DATASOURCE_EVENT — register a subscription; correlation key extracted
 *                          from iteration metadata.
 *   FROM_AAS_SUBMODEL   — resolved via HTTP adapter (AAS Part 2 API) — stubbed.
 *   FROM_METADATA       — direct lookup in iteration metadata.
 */
@Injectable()
export class BindingRuntimeService {
  private readonly logger = new Logger(BindingRuntimeService.name)

  constructor(
    private prisma: PrismaService,
    private templates: TemplateResolverService,
    private datasources: DataSourcesService,
  ) {}

  async resolveNode(opts: { iterationId: string; nodeId: string }): Promise<ResolvedBinding[]> {
    const iter = await this.prisma.iteration.findUnique({
      where: { id: opts.iterationId },
      include: { machine: true },
    })
    if (!iter) return []
    const bindings = await this.prisma.inputBinding.findMany({
      where: { stateMachineId: iter.machineId, nodeId: opts.nodeId },
    })
    const metadata = JSON.parse(iter.metadataJson || '{}') as Record<string, any>
    const context = {
      iteration: { id: iter.id, displayId: iter.displayId, metadata, classification: iter.classification },
      now: { iso8601: new Date().toISOString(), unix: Date.now() },
    }

    const results: ResolvedBinding[] = []
    for (const b of bindings) {
      const config = JSON.parse(b.configJson || '{}')
      try {
        results.push(await this.resolveOne(iter, opts.nodeId, b.inputId, b.bindingType as BindingType, b.dataSourceId, config, context))
      } catch (err: any) {
        results.push({ inputId: b.inputId, bindingType: b.bindingType as BindingType, status: 'FAILED', error: err?.message ?? String(err) })
      }
    }
    return results
  }

  private async resolveOne(
    iter: any,
    nodeId: string,
    inputId: string,
    type: BindingType,
    dataSourceId: string | null,
    config: any,
    context: any,
  ): Promise<ResolvedBinding> {
    switch (type) {
      case 'MANUAL':
        return { inputId, bindingType: type, status: 'DEFERRED' }

      case 'FROM_NODE': {
        const cfg = config as FromNodeBindingConfig
        const pred = await this.prisma.nodeRuntimeState.findUnique({
          where: { iterationId_nodeId: { iterationId: iter.id, nodeId: cfg.sourceNodeId } },
        })
        if (!pred?.outputFilePath) return { inputId, bindingType: type, status: 'DEFERRED' }
        await this.recordSetInput(iter.id, nodeId, inputId, pred.outputFilePath)
        return { inputId, bindingType: type, status: 'RESOLVED', value: pred.outputFilePath }
      }

      case 'FROM_METADATA': {
        const cfg = config as FromMetadataConfig
        const v = this.templates.resolve(`{{ ${cfg.metadataPath} }}`, context)
        const final = v || cfg.default || ''
        if (!final) return { inputId, bindingType: type, status: 'FAILED', error: `Missing metadata ${cfg.metadataPath}` }
        return { inputId, bindingType: type, status: 'RESOLVED', value: final }
      }

      case 'FROM_DATASOURCE_QUERY': {
        const cfg = config as FromDataSourceQueryConfig
        if (!dataSourceId) throw new Error('FROM_DATASOURCE_QUERY requires dataSourceId')
        const resolvedQuery = this.templates.resolve(cfg.queryTemplate, context)
        const resolvedParams = cfg.parameters
          ? this.templates.resolveObject(cfg.parameters as Record<string, string>, context)
          : undefined
        // Execute via adapter. Persist an IngestRecord.
        const ds = await this.datasources.findOneInternal(dataSourceId)
        const authConfig = ds.authConfigJson ? JSON.parse(ds.authConfigJson) : null
        const protocolConfig = ds.protocolConfigJson
          ? { ...JSON.parse(ds.protocolConfigJson), query: resolvedQuery, parameters: resolvedParams }
          : { query: resolvedQuery, parameters: resolvedParams }
        const adapter = createAdapter(ds.protocol, ds.endpoint, authConfig, protocolConfig)
        try {
          const data = await adapter.fetchLatest(ds.tagMappingJson ? JSON.parse(ds.tagMappingJson) : [])
          const payload = typeof data === 'string' ? data : JSON.stringify(data)
          const hash = crypto.createHash('sha256').update(payload).digest('hex')
          await this.prisma.ingestRecord.create({
            data: {
              dataSourceId,
              iterationId: iter.id,
              nodeId,
              inputId,
              status: 'OK',
              payloadHash: hash,
              bytesIngested: Buffer.byteLength(payload),
              resolvedQuery,
              payloadPreview: payload.slice(0, 512),
            },
          })
          return { inputId, bindingType: type, status: 'RESOLVED', value: payload, resolvedTarget: resolvedQuery }
        } catch (err: any) {
          if (cfg.onMissing === 'WAIT_FOR_EVENT') {
            await this.prisma.ingestRecord.create({
              data: {
                dataSourceId, iterationId: iter.id, nodeId, inputId,
                status: 'UNASSIGNED', resolvedQuery,
                errorMsg: err?.message ?? 'fetch failed; waiting for event',
              },
            })
            return { inputId, bindingType: type, status: 'WAITING_FOR_EVENT', resolvedTarget: resolvedQuery }
          }
          if (cfg.onMissing === 'USE_DEFAULT' && cfg.default) {
            return { inputId, bindingType: type, status: 'RESOLVED', value: cfg.default }
          }
          throw err
        }
      }

      case 'FROM_DATASOURCE_EVENT': {
        const cfg = config as FromDataSourceEventConfig
        if (!dataSourceId) throw new Error('FROM_DATASOURCE_EVENT requires dataSourceId')
        const resolvedTopic = this.templates.resolve(cfg.topicTemplate, context)
        await this.prisma.ingestRecord.create({
          data: {
            dataSourceId, iterationId: iter.id, nodeId, inputId,
            status: 'UNASSIGNED', resolvedQuery: resolvedTopic,
            errorMsg: 'Subscription opened; awaiting matching event',
          },
        })
        return { inputId, bindingType: type, status: 'WAITING_FOR_EVENT', resolvedTarget: resolvedTopic }
      }

      case 'FROM_AAS_SUBMODEL': {
        // Stub — resolving a value directly from a live AAS submodel via the
        // AAS Server client is not yet implemented.
        return {
          inputId,
          bindingType: type,
          status: 'DEFERRED',
          error: 'FROM_AAS_SUBMODEL resolver not yet wired',
        }
      }
    }
  }

  private async recordSetInput(iterationId: string, nodeId: string, inputId: string, filePath: string) {
    const state = await this.prisma.nodeRuntimeState.findUnique({
      where: { iterationId_nodeId: { iterationId, nodeId } },
    })
    if (!state) return
    const inputStatuses = state.inputFileStatusesJson ? JSON.parse(state.inputFileStatusesJson) : {}
    inputStatuses[inputId] = { provided: true, filePath }
    await this.prisma.nodeRuntimeState.update({
      where: { iterationId_nodeId: { iterationId, nodeId } },
      data: { inputFileStatusesJson: JSON.stringify(inputStatuses) },
    })
  }
}
