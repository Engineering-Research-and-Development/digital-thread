import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { ROLE, type Role } from '@/auth/roles'
import { EventBrokerService } from '@/events/event-broker.service'

/**
 * File-grade access request workflow.
 *
 * A PARTNER who is denied read on a file (because of classification ceiling
 * or partner-scope failure) can raise a `FileAccessRequest`. A single
 * SUPERADMIN/OWNER decision flips the request to APPROVED (granting
 * time-bounded read via FilesService.hasActiveGrant) or REJECTED. Distinct
 * from ApprovalsService, which models destructive mutations and requires
 * two approvers.
 */
@Injectable()
export class FileAccessRequestsService {
  /** Default grant lifetime when the approver doesn't supply an explicit one. */
  private static readonly DEFAULT_GRANT_HOURS = 24 * 7

  constructor(
    private prisma: PrismaService,
    private broker: EventBrokerService,
  ) {}

  /**
   * Create (or return) a PENDING access request from the given partner for the
   * given file. Idempotent on (fileId, requesterId, PENDING): re-raising the
   * same request reuses the row rather than spamming the governance queue.
   */
  async request(input: {
    fileId: string
    requesterId: string
    requesterPartnerId?: string
    reason?: string
    /**
     * The iteration the requester was viewing when they raised the request.
     * Recorded so governance can link back to where access was actually
     * requested — a file linked from another iteration keeps its ORIGIN
     * iterationId, which is NOT where the partner asked for it. Also makes the
     * PENDING dedup iteration-aware (see below).
     */
    iterationId?: string
  }) {
    const file = await this.prisma.fileRecord.findUnique({ where: { id: input.fileId } })
    if (!file) throw new NotFoundException(`File ${input.fileId} not found`)
    const contextIterationId = input.iterationId ?? null

    // Reuse a still-active APPROVED grant FIRST — the grant is file-level (covers
    // every iteration the file is used in), so once granted there is nothing to
    // request again regardless of which iteration the partner is viewing.
    const now = new Date()
    const activeApproved = await this.prisma.fileAccessRequest.findFirst({
      where: {
        fileId: input.fileId,
        requesterId: input.requesterId,
        status: 'APPROVED',
        OR: [{ grantExpiresAt: null }, { grantExpiresAt: { gt: now } }],
      },
    })
    if (activeApproved) return activeApproved

    // Reuse an existing PENDING only for the SAME context iteration. This is the
    // fix for "the second request isn't shown": a request raised from a DIFFERENT
    // iteration (e.g. the same linked file consumed elsewhere) is no longer
    // silently merged into the first — it becomes its own governance row with the
    // correct "open iteration" target. Re-asking from the same iteration is still
    // idempotent (no duplicate queue spam).
    const existingPending = await this.prisma.fileAccessRequest.findFirst({
      where: {
        fileId: input.fileId,
        requesterId: input.requesterId,
        status: 'PENDING',
        iterationId: contextIterationId,
      },
    })
    if (existingPending) return existingPending

    const created = await this.prisma.fileAccessRequest.create({
      data: {
        fileId: input.fileId,
        iterationId: contextIterationId,
        requesterId: input.requesterId,
        requesterPartnerId: input.requesterPartnerId,
        reason: input.reason?.slice(0, 1000),
        status: 'PENDING',
      },
    })

    this.broker.emit({
      type: 'file_access_requested',
      iterationId: contextIterationId ?? file.iterationId ?? 'raw',
      payload: {
        requestId: created.id,
        fileId: file.id,
        iterationId: contextIterationId ?? file.iterationId ?? null,
        requesterId: input.requesterId,
        classification: file.classification,
      },
    })

    return created
  }

  /**
   * List access requests for a decider:
   *   - SUPERADMIN sees ALL requests (every status, every decider).
   *   - OWNER sees only requests for files used in iterations of the products
   *     THEIR partner owns — both the actionable PENDING queue and the decision
   *     history for those files (approve/reject scope == visibility scope).
   * Returns every status (PENDING + APPROVED/REJECTED/CANCELLED/EXPIRED) so the
   * UI can render both the actionable queue and the decision history.
   */
  async list(opts: { status?: string; requester?: { id: string; role: Role; partnerId?: string | null } } = {}) {
    const where: any = {}
    if (opts.status) where.status = opts.status
    if (opts.requester && opts.requester.role === ROLE.OWNER) {
      // Scope to requests whose file is produced/consumed in one of this
      // owner's product iterations. Sentinel '__none__' yields an empty list
      // for an owner with no products rather than leaking the whole queue.
      const iterationIds = await this.ownerProductIterationIds(opts.requester.partnerId)
      where.file = { iterationId: { in: iterationIds.length ? iterationIds : ['__none__'] } }
    }
    return this.prisma.fileAccessRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        file: { select: { id: true, filename: true, classification: true, iterationId: true, nodeSourceLabel: true } },
        requester: { select: { id: true, email: true, fullName: true, partnerId: true } },
        decidedBy: { select: { id: true, email: true, fullName: true } },
      },
    })
  }

  /**
   * Iterations belonging to products owned by `partnerId` — the OWNER product
   * scope used to gate governance visibility. Mirrors
   * FilesService.ownerProductScope but only needs the iteration ids here.
   */
  private async ownerProductIterationIds(partnerId?: string | null): Promise<string[]> {
    if (!partnerId) return []
    const products = await this.prisma.product.findMany({
      where: { ownerPartnerId: partnerId },
      select: { id: true },
    })
    if (products.length === 0) return []
    const iterations = await this.prisma.iteration.findMany({
      where: { productId: { in: products.map((p) => p.id) } },
      select: { id: true },
    })
    return iterations.map((i) => i.id)
  }

  async listForRequester(requesterId: string) {
    return this.prisma.fileAccessRequest.findMany({
      where: { requesterId },
      orderBy: { createdAt: 'desc' },
      include: {
        file: { select: { id: true, filename: true, classification: true, iterationId: true, nodeSourceLabel: true } },
        decidedBy: { select: { id: true, email: true, fullName: true } },
      },
      take: 100,
    })
  }

  async decide(
    requestId: string,
    approver: { id: string; role: Role; partnerId?: string | null },
    decision: 'APPROVE' | 'REJECT',
    opts: { note?: string; grantHours?: number } = {},
  ) {
    if (approver.role !== ROLE.SUPERADMIN && approver.role !== ROLE.OWNER) {
      throw new ForbiddenException('Only SUPERADMIN or OWNER can decide file-access requests')
    }
    const req = await this.prisma.fileAccessRequest.findUnique({
      where: { id: requestId },
      include: { file: { select: { iterationId: true } } },
    })
    if (!req) throw new NotFoundException('Access request not found')
    if (req.status !== 'PENDING') throw new BadRequestException(`Request already ${req.status}`)
    if (req.requesterId === approver.id) throw new ForbiddenException('Cannot decide your own request')

    // An OWNER may only decide requests for files in iterations of
    // their own products (matches the governance-list visibility scope).
    if (approver.role === ROLE.OWNER) {
      const iterationIds = await this.ownerProductIterationIds(approver.partnerId)
      if (!req.file?.iterationId || !iterationIds.includes(req.file.iterationId)) {
        throw new ForbiddenException('This request is outside your products’ scope')
      }
    }

    const grantExpiresAt =
      decision === 'APPROVE'
        ? new Date(Date.now() + (opts.grantHours ?? FileAccessRequestsService.DEFAULT_GRANT_HOURS) * 3600 * 1000)
        : null

    const updated = await this.prisma.fileAccessRequest.update({
      where: { id: requestId },
      data: {
        status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        decidedById: approver.id,
        decidedAt: new Date(),
        decisionNote: opts.note?.slice(0, 1000),
        grantExpiresAt,
      },
    })

    this.broker.emit({
      type: 'file_access_decided',
      iterationId: req.fileId,
      payload: {
        requestId: req.id,
        fileId: req.fileId,
        requesterId: req.requesterId,
        decision,
        grantExpiresAt,
      },
    })

    return updated
  }

  async cancel(requestId: string, requesterId: string) {
    const req = await this.prisma.fileAccessRequest.findUnique({ where: { id: requestId } })
    if (!req) throw new NotFoundException('Access request not found')
    if (req.requesterId !== requesterId) throw new ForbiddenException('Only the requester may cancel')
    if (req.status !== 'PENDING') throw new BadRequestException(`Already ${req.status}`)
    return this.prisma.fileAccessRequest.update({
      where: { id: requestId },
      data: { status: 'CANCELLED', decidedAt: new Date() },
    })
  }
}
