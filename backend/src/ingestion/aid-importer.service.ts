import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'

/**
 * AID + AIMC importer.
 *
 * Translates an AAS Asset Interfaces Description (IDTA 02017) + optional
 * Asset Interfaces Mapping Configuration (IDTA 02045) submodel into
 * `DataSource` + `InputBinding` rows.
 *
 * Accepts the parsed JSON form of AID/AIMC (a simplified shape that BaSyx /
 * AAS4J produces after submodel-to-JSON serialisation). A full JSON-LD
 * unmarshaller (via the AAS Server client) is not yet implemented; for now
 * the importer reads the compact `interactions` array a typical AID carries.
 */
@Injectable()
export class AidImporterService {
  private readonly logger = new Logger(AidImporterService.name)
  constructor(private prisma: PrismaService) {}

  /**
   * Import an AID submodel. `aid.interactions[]` yields `DataSource`s; if
   * `aimc` is provided, its `mappings[]` yield `InputBinding`s against a
   * supplied `targetStateMachineId`.
   */
  async import(input: {
    aid: any
    aimc?: any
    targetStateMachineId?: string
    ownerPartnerId?: string
  }): Promise<{ dataSourceIds: string[]; bindingIds: string[] }> {
    if (!input.aid || !Array.isArray(input.aid.interactions)) {
      throw new BadRequestException('aid.interactions[] is required')
    }
    const dsIds: string[] = []
    for (const inter of input.aid.interactions) {
      const protocol = this.mapProtocol(inter.protocol ?? inter.form?.href ?? '')
      const endpoint = inter.form?.href ?? inter.href ?? inter.endpoint ?? ''
      const authConfig = inter.security ? JSON.stringify(inter.security) : null
      const protocolConfig = this.derivedProtocolConfig(inter)
      const ds = await this.prisma.dataSource.create({
        data: {
          name: inter.title ?? inter.name ?? `AID ${inter.type ?? 'interface'}`,
          type: this.mapType(inter.type),
          protocol,
          endpoint,
          description: inter.description ?? `Imported from AID submodel ${input.aid.idShort ?? '<unknown>'}`,
          authConfigJson: authConfig,
          protocolConfigJson: protocolConfig ? JSON.stringify(protocolConfig) : null,
          accessMode: inter.observable ? 'PUSH' : 'PULL',
          ownerPartnerId: input.ownerPartnerId,
        },
      })
      dsIds.push(ds.id)
    }

    const bindingIds: string[] = []
    if (input.aimc && input.targetStateMachineId && Array.isArray(input.aimc.mappings)) {
      for (const mapping of input.aimc.mappings) {
        if (!mapping.nodeId || !mapping.inputId || !mapping.dataSourceRef) continue
        // Resolve dataSourceRef against the newly-imported set by index or name.
        const resolvedDs = mapping.dataSourceRef.startsWith('#')
          ? dsIds[Number(mapping.dataSourceRef.slice(1))]
          : (await this.prisma.dataSource.findFirst({ where: { name: mapping.dataSourceRef } }))?.id
        if (!resolvedDs) continue
        const bindingType = this.mapBindingType(mapping.kind)
        const created = await this.prisma.inputBinding.upsert({
          where: {
            stateMachineId_nodeId_inputId: {
              stateMachineId: input.targetStateMachineId,
              nodeId: mapping.nodeId,
              inputId: mapping.inputId,
            },
          },
          create: {
            stateMachineId: input.targetStateMachineId,
            nodeId: mapping.nodeId,
            inputId: mapping.inputId,
            bindingType,
            dataSourceId: resolvedDs,
            configJson: JSON.stringify(mapping.config ?? {}),
          },
          update: {
            bindingType,
            dataSourceId: resolvedDs,
            configJson: JSON.stringify(mapping.config ?? {}),
          },
        })
        bindingIds.push(created.id)
      }
    }

    this.logger.log(`AID imported ${dsIds.length} DataSource(s), ${bindingIds.length} InputBinding(s)`)
    return { dataSourceIds: dsIds, bindingIds }
  }

  private mapProtocol(raw: string): string {
    const s = String(raw).toLowerCase()
    if (s.startsWith('mqtt')) return 'MQTT'
    if (s.startsWith('opc')) return 'OPC_UA'
    if (s.startsWith('modbus')) return 'MODBUS'
    if (s.startsWith('sql')) return 'SQL'
    return 'HTTP'
  }

  private mapType(aasType?: string): string {
    switch ((aasType ?? '').toLowerCase()) {
      case 'property':
      case 'action':
        return 'API'
      case 'event':
        return 'SENSOR'
      case 'database':
        return 'DATABASE'
      default:
        return 'API'
    }
  }

  private mapBindingType(kind?: string): string {
    switch ((kind ?? 'query').toLowerCase()) {
      case 'event':    return 'FROM_DATASOURCE_EVENT'
      case 'submodel': return 'FROM_AAS_SUBMODEL'
      case 'metadata': return 'FROM_METADATA'
      case 'node':     return 'FROM_NODE'
      default:         return 'FROM_DATASOURCE_QUERY'
    }
  }

  private derivedProtocolConfig(inter: any): object | null {
    const cfg: any = {}
    if (inter.topic) cfg.topics = [inter.topic]
    if (inter.nodeIds) cfg.nodeIds = inter.nodeIds
    if (inter.query) cfg.query = inter.query
    if (inter.contentType) cfg.contentType = inter.contentType
    return Object.keys(cfg).length ? cfg : null
  }
}
