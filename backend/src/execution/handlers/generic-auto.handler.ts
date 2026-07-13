/**
 * Generic stub handler for all AUTOMATIC node types that don't have a dedicated handler.
 * Returns a simulated output path after a short delay.
 */
import { Injectable } from '@nestjs/common'
import { BaseNodeHandler, ExecutionContext } from './base.handler'
import { WorkflowEngineService } from '@/iterations/workflow-engine.service'
import { PrismaService } from '@/database/prisma.service'

@Injectable()
export class GenericAutoHandler extends BaseNodeHandler {
  readonly handlerVersion = '1.0.0-stub'
  constructor(engine: WorkflowEngineService, prisma?: PrismaService) { super(engine, prisma) }

  protected async run(ctx: ExecutionContext): Promise<string> {
    const steps = ['Initialising...', 'Processing inputs...', 'Computing results...', 'Writing output...']
    for (let i = 0; i < steps.length; i++) {
      await this.engine.appendLog(ctx.iterationId, ctx.nodeId, steps[i])
      await this.engine.updateNodeStatus(ctx.iterationId, ctx.nodeId, 'RUNNING', {
        progress: (i + 1) / steps.length,
      })
      await delay(200)
    }
    const expectedOutput = ctx.config?.expectedOutput ?? 'output.json'
    return `storage/auto-results/${ctx.iterationId}/${ctx.nodeId}/${expectedOutput}`
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
