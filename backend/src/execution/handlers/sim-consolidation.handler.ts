import { Injectable } from '@nestjs/common'
import { BaseNodeHandler, ExecutionContext } from './base.handler'
import { WorkflowEngineService } from '@/iterations/workflow-engine.service'
import { PrismaService } from '@/database/prisma.service'

@Injectable()
export class SimConsolidationHandler extends BaseNodeHandler {
  readonly handlerVersion = '1.0.0-stub'
  constructor(engine: WorkflowEngineService, prisma?: PrismaService) { super(engine, prisma) }

  protected async run(ctx: ExecutionContext): Promise<string> {
    await this.engine.appendLog(ctx.iterationId, ctx.nodeId, 'Initialising consolidation simulation...')
    await this.engine.updateNodeStatus(ctx.iterationId, ctx.nodeId, 'RUNNING', { progress: 0.1 })

    // Stub: simulate async processing
    await delay(500)
    await this.engine.appendLog(ctx.iterationId, ctx.nodeId, 'Running FEM mesh generation...')
    await this.engine.updateNodeStatus(ctx.iterationId, ctx.nodeId, 'RUNNING', { progress: 0.4 })

    await delay(500)
    await this.engine.appendLog(ctx.iterationId, ctx.nodeId, 'Computing thermal consolidation...')
    await this.engine.updateNodeStatus(ctx.iterationId, ctx.nodeId, 'RUNNING', { progress: 0.8 })

    await delay(300)
    await this.engine.appendLog(ctx.iterationId, ctx.nodeId, 'Generating consolidation_report.pdf...')

    return `storage/sim-results/${ctx.iterationId}/${ctx.nodeId}/consolidation_report.pdf`
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
