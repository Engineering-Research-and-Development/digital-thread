import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { LineageService } from '@/lineage/lineage.service'

export type ChangeStatus = 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED' | 'CLOSED'

/**
 * Engineering change requests against Digital Thread entities.
 *
 * A CR targets any DT entity (StateMachine, Iteration, FileRecord, Partner, ...).
 * Computing the impact set leverages `LineageService` when the target is a
 * FileRecord (all downstream derivatives are flagged) and scans iterations /
 * node states when the target is a StateMachine.
 */
@Injectable()
export class ChangeRequestService {
  constructor(
    private prisma: PrismaService,
    private lineage: LineageService,
  ) {}

  async list(filter?: { status?: ChangeStatus; targetType?: string; targetId?: string }) {
    return this.prisma.changeRequest.findMany({
      where: { status: filter?.status, targetType: filter?.targetType, targetId: filter?.targetId },
      orderBy: { updatedAt: 'desc' },
    })
  }

  async create(input: { title: string; description?: string; targetType: string; targetId: string; raisedBy: string }) {
    const impact = await this.computeImpact(input.targetType, input.targetId)
    return this.prisma.changeRequest.create({
      data: {
        title: input.title,
        description: input.description,
        targetType: input.targetType,
        targetId: input.targetId,
        raisedBy: input.raisedBy,
        status: 'OPEN',
        impactJson: JSON.stringify(impact),
      },
    })
  }

  async updateStatus(id: string, status: ChangeStatus) {
    const cr = await this.prisma.changeRequest.findUnique({ where: { id } })
    if (!cr) throw new NotFoundException(`ChangeRequest ${id} not found`)
    return this.prisma.changeRequest.update({ where: { id }, data: { status } })
  }

  async recomputeImpact(id: string) {
    const cr = await this.prisma.changeRequest.findUnique({ where: { id } })
    if (!cr) throw new NotFoundException(`ChangeRequest ${id} not found`)
    const impact = await this.computeImpact(cr.targetType, cr.targetId)
    return this.prisma.changeRequest.update({ where: { id }, data: { impactJson: JSON.stringify(impact) } })
  }

  /**
   * Compute a shallow-but-meaningful impact list for a target:
   *   FileRecord → downstream lineage graph + iterations + nodes referencing it.
   *   StateMachine → iterations + whether any are RUNNING.
   *   Iteration → files produced + manifests.
   */
  async computeImpact(targetType: string, targetId: string): Promise<object> {
    switch (targetType) {
      case 'FileRecord': {
        const graph = await this.lineage.getFullGraph(targetId, 5).catch(() => null)
        return {
          downstreamFiles: graph?.nodes.map((n: any) => ({ id: n.id, filename: n.filename })) ?? [],
          downstreamCount: graph?.nodes.length ?? 0,
        }
      }
      case 'StateMachine': {
        const iters = await this.prisma.iteration.findMany({
          where: { machineId: targetId },
          select: { id: true, displayId: true, status: true },
        })
        return {
          iterations: iters,
          running: iters.filter((i) => i.status === 'RUNNING').length,
          total: iters.length,
        }
      }
      case 'Iteration': {
        const [files, manifests] = await Promise.all([
          this.prisma.fileRecord.findMany({ where: { iterationId: targetId }, select: { id: true, filename: true } }),
          this.prisma.iterationManifest.findMany({ where: { iterationId: targetId } }),
        ])
        return { fileCount: files.length, manifestCount: manifests.length }
      }
      default:
        return { note: `impact analysis not implemented for ${targetType}` }
    }
  }
}
