import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { ROLE } from '@/auth/roles'

export type ApprovalAction =
  | 'DELETE_FILE'
  | 'DECLASSIFY'
  | 'BULK_EXPORT'
  | 'REVOKE_USER'
  | 'PROMOTE_USER'
  | 'PURGE_ITERATION'

/**
 * ApprovalsService — two-approver workflow for sensitive mutations
 * (deleting a file, declassifying data, bulk export, revoking/promoting a
 * user, purging an iteration).
 *
 * Lifecycle: PENDING → APPROVED (2 APPROVE from distinct SUPERADMIN/OWNER) or REJECTED.
 * The requester cannot approve their own request.
 */
@Injectable()
export class ApprovalsService {
  private static readonly APPROVALS_NEEDED = 2

  constructor(private prisma: PrismaService) {}

  async request(input: {
    requesterId: string
    action: ApprovalAction
    targetType: string
    targetId: string
    reason?: string
  }) {
    return this.prisma.approvalRequest.create({
      data: {
        requesterId: input.requesterId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        status: 'PENDING',
      },
    })
  }

  async list(filter?: { status?: string; targetType?: string; targetId?: string }) {
    return this.prisma.approvalRequest.findMany({
      where: { status: filter?.status, targetType: filter?.targetType, targetId: filter?.targetId },
      include: { decisions: true },
      orderBy: { createdAt: 'desc' },
    })
  }

  async decide(
    requestId: string,
    approver: { id: string; role: string },
    decision: 'APPROVE' | 'REJECT',
    comment?: string,
  ) {
    if (approver.role !== ROLE.SUPERADMIN && approver.role !== ROLE.OWNER) {
      throw new ForbiddenException('Only SUPERADMIN or OWNER can approve')
    }
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId }, include: { decisions: true },
    })
    if (!req) throw new NotFoundException('Approval request not found')
    if (req.status !== 'PENDING') throw new BadRequestException(`Request already ${req.status}`)
    if (req.requesterId === approver.id) throw new ForbiddenException('Cannot approve own request')

    await this.prisma.approvalDecision.create({
      data: { requestId, approverId: approver.id, decision, comment },
    })

    const decisions = [...req.decisions.filter((d) => d.approverId !== approver.id), { decision, approverId: approver.id }]
    if (decision === 'REJECT') {
      return this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: 'REJECTED', resolvedAt: new Date() },
      })
    }
    const approveCount = decisions.filter((d) => d.decision === 'APPROVE').length
    if (approveCount >= ApprovalsService.APPROVALS_NEEDED) {
      return this.prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: 'APPROVED', resolvedAt: new Date() },
      })
    }
    return this.prisma.approvalRequest.findUnique({ where: { id: requestId }, include: { decisions: true } })
  }

  async cancel(requestId: string, requesterId: string) {
    const req = await this.prisma.approvalRequest.findUnique({ where: { id: requestId } })
    if (!req) throw new NotFoundException('Approval request not found')
    if (req.requesterId !== requesterId) throw new ForbiddenException('Only the requester may cancel')
    if (req.status !== 'PENDING') throw new BadRequestException(`Already ${req.status}`)
    return this.prisma.approvalRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED', resolvedAt: new Date() },
    })
  }
}
