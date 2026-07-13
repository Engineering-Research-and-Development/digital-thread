import { WorkflowEngineService } from '@/iterations/workflow-engine.service'
import { PrismaService } from '@/database/prisma.service'

export interface ExecutionContext {
  iterationId: string
  nodeId: string
  nodeLabel: string
  partner: string
  config: Record<string, any>
  inputs: Record<string, unknown> // values fetched from datasources / predecessor outputs
}

export abstract class BaseNodeHandler {
  /** Override in subclass when you need a stable handler version for provenance. */
  readonly handlerVersion: string = '1.0.0'

  constructor(protected engine: WorkflowEngineService, protected prisma?: PrismaService) {}

  async execute(ctx: ExecutionContext): Promise<void> {
    try {
      // Record the provenance agent + execution params + a human-readable
      // transformationLabel before the work runs.
      const agentId = this.prisma ? await this.recordAgent() : undefined
      if (this.prisma) {
        await this.prisma.nodeRuntimeState.update({
          where: { iterationId_nodeId: { iterationId: ctx.iterationId, nodeId: ctx.nodeId } },
          data: {
            handlerName: this.constructor.name,
            handlerVersion: this.handlerVersion,
            executionParamsJson: JSON.stringify({ config: ctx.config, inputs: ctx.inputs }).slice(0, 8000),
            provenanceAgentId: agentId,
            transformationLabel: `Ran ${this.constructor.name} v${this.handlerVersion}`,
          },
        }).catch(() => {})
      }

      await this.engine.updateNodeStatus(ctx.iterationId, ctx.nodeId, 'RUNNING', {
        startedAt: new Date(),
        log: `[${this.constructor.name}@${this.handlerVersion}] Starting execution`,
      })

      const outputPath = await this.run(ctx)

      await this.engine.updateNodeStatus(ctx.iterationId, ctx.nodeId, 'COMPLETED', {
        completedAt: new Date(),
        progress: 1.0,
        outputFilePath: outputPath,
        log: `[${this.constructor.name}@${this.handlerVersion}] Completed successfully`,
      })

      await this.engine.addTimelineEvent({
        iterationId: ctx.iterationId,
        nodeId: ctx.nodeId,
        nodeLabel: ctx.nodeLabel,
        partner: ctx.partner,
        action: 'NODE_COMPLETED',
        detail: `Output: ${outputPath ?? 'none'}`,
      })
    } catch (err: any) {
      await this.engine.updateNodeStatus(ctx.iterationId, ctx.nodeId, 'ERROR', {
        completedAt: new Date(),
        errorMessage: err.message,
        log: `[${this.constructor.name}@${this.handlerVersion}] Error: ${err.message}`,
      })
      await this.engine.addTimelineEvent({
        iterationId: ctx.iterationId,
        nodeId: ctx.nodeId,
        nodeLabel: ctx.nodeLabel,
        partner: ctx.partner,
        action: 'NODE_ERROR',
        detail: err.message,
      })
    }
  }

  /** Subclasses implement the actual logic; return output file path if any */
  protected abstract run(ctx: ExecutionContext): Promise<string | undefined>

  private async recordAgent(): Promise<string | undefined> {
    if (!this.prisma) return undefined
    try {
      const existing = await this.prisma.provenanceAgent.findUnique({
        where: { name_version: { name: this.constructor.name, version: this.handlerVersion } },
      })
      if (existing) return existing.id
      const created = await this.prisma.provenanceAgent.create({
        data: { agentType: 'HANDLER', name: this.constructor.name, version: this.handlerVersion },
      })
      return created.id
    } catch {
      return undefined
    }
  }
}
