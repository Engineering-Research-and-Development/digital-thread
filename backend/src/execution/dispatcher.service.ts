import { Injectable } from '@nestjs/common'
import { WorkflowEngineService } from '@/iterations/workflow-engine.service'
import { PrismaService } from '@/database/prisma.service'
import { GenericAutoHandler } from './handlers/generic-auto.handler'
import type { ExecutionContext } from './handlers/base.handler'

/**
 * The dispatcher is a single-handler router. The previous domain-specific
 * handlers (SimConsolidationHandler, AiDefectDetectionHandler) have been
 * retired together with the domain-specific node catalog: a node is now
 * described by its inputs/outputs contract, not by a nodeTypeId.
 *
 * Iterations created before the generic node model keep working: the
 * GenericAutoHandler ignores nodeTypeId and produces a synthetic "completed"
 * tick for any AUTOMATIC node so legacy state machines can still advance.
 */
@Injectable()
export class DispatcherService {
  private genericHandler: GenericAutoHandler

  constructor(private engine: WorkflowEngineService, private prisma: PrismaService) {
    this.genericHandler = new GenericAutoHandler(engine, prisma)
  }

  /** Dispatch execution to the generic handler regardless of nodeTypeId. */
  async dispatch(nodeTypeId: string, ctx: ExecutionContext): Promise<void> {
    // Run async — don't await in the HTTP request cycle
    this.genericHandler.execute(ctx).catch((e) =>
      console.error(`[Dispatcher] Unhandled error in ${nodeTypeId}:`, e),
    )
  }
}
