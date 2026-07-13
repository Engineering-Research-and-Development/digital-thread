import { Injectable } from '@nestjs/common'
import { BaseNodeHandler, ExecutionContext } from './base.handler'
import { WorkflowEngineService } from '@/iterations/workflow-engine.service'
import { PrismaService } from '@/database/prisma.service'

@Injectable()
export class AiDefectDetectionHandler extends BaseNodeHandler {
  readonly handlerVersion = '1.0.0-stub'
  constructor(engine: WorkflowEngineService, prisma?: PrismaService) { super(engine, prisma) }

  protected async run(ctx: ExecutionContext): Promise<string> {
    await this.engine.appendLog(ctx.iterationId, ctx.nodeId, 'Loading NDI scan data...')
    await this.engine.updateNodeStatus(ctx.iterationId, ctx.nodeId, 'RUNNING', { progress: 0.2 })
    await delay(600)

    await this.engine.appendLog(ctx.iterationId, ctx.nodeId, 'Running AI defect detection model (CNN)...')
    await this.engine.updateNodeStatus(ctx.iterationId, ctx.nodeId, 'RUNNING', { progress: 0.7 })
    await delay(800)

    await this.engine.appendLog(ctx.iterationId, ctx.nodeId, 'Generating defect_map.json...')
    return `storage/ai-results/${ctx.iterationId}/${ctx.nodeId}/defect_map.json`
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))
