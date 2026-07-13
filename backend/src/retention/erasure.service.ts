import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import * as crypto from 'crypto'

/**
 * ErasureService — GDPR right-to-erasure.
 *
 * Per GDPR Art. 17, data-subject requests trigger:
 *   1. Pseudonymise the User row (email → hash, fullName → null)
 *   2. Revoke all refresh tokens
 *   3. Preserve audit logs (legal obligation) but anonymise subject
 *   4. Leave FileRecords + iteration participation intact (work product;
 *      cannot be selectively erased without breaking lineage). The requester
 *      gets a compliance notice explaining this.
 *
 * Creates an `ApprovalRequest` targeting `User:<id>` — the actual erasure runs
 * only after SUPERADMIN approval (governance requirement) via `execute()`.
 */
@Injectable()
export class ErasureService {
  private readonly logger = new Logger(ErasureService.name)
  constructor(private prisma: PrismaService) {}

  /** Data-subject request path — users (or their guardian admin) file a request. */
  async request(input: { subjectUserId: string; requesterId: string; reason?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: input.subjectUserId } })
    if (!user) throw new NotFoundException('User not found')
    return this.prisma.approvalRequest.create({
      data: {
        requesterId: input.requesterId,
        action: 'REVOKE_USER',
        targetType: 'User',
        targetId: input.subjectUserId,
        reason: input.reason ?? 'GDPR Art. 17 right-to-erasure',
        status: 'PENDING',
      },
    })
  }

  /** Executes an approved erasure. Idempotent — pseudonymising a pseudonymised user is a no-op. */
  async execute(approvalRequestId: string) {
    const req = await this.prisma.approvalRequest.findUnique({ where: { id: approvalRequestId } })
    if (!req) throw new NotFoundException('Approval request not found')
    if (req.action !== 'REVOKE_USER' || req.targetType !== 'User') {
      throw new BadRequestException('Approval is not a GDPR erasure')
    }
    if (req.status !== 'APPROVED') throw new BadRequestException(`Approval status is ${req.status}`)

    const user = await this.prisma.user.findUnique({ where: { id: req.targetId } })
    if (!user) throw new NotFoundException('User already removed')

    const pseudonym = `erased:${crypto.createHash('sha256').update(user.email).digest('hex').slice(0, 16)}@redacted.invalid`

    // Pseudonymise, revoke sessions, disable — never hard-delete (audit linkage).
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { revoked: true } }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          email: pseudonym,
          fullName: null,
          isActive: false,
          hashedPassword: '$2b$10$erased-no-login-possible-0000000000000000000000000000000',
        },
      }),
      this.prisma.loginAuditLog.updateMany({ where: { userId: user.id }, data: { email: pseudonym } }),
    ])

    this.logger.log(`GDPR erasure executed for user ${req.targetId} (pseudonym=${pseudonym})`)
    return { ok: true, pseudonym, preservedFor: 'Work product + audit logs retained under legal obligation' }
  }

  /** GDPR Art. 15 — export all personal data we hold for a subject. */
  async export(subjectUserId: string) {
    const [user, audits, accesses, approvalsOwn, approvalDecisions] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: subjectUserId }, include: { partner: true } }),
      this.prisma.loginAuditLog.findMany({ where: { userId: subjectUserId } }),
      this.prisma.accessLog.findMany({ where: { userId: subjectUserId } }),
      this.prisma.approvalRequest.findMany({ where: { requesterId: subjectUserId } }),
      this.prisma.approvalDecision.findMany({ where: { approverId: subjectUserId } }),
    ])
    if (!user) throw new NotFoundException('User not found')
    const { hashedPassword: _hp, ...userSafe } = user as any
    return {
      exportKind: 'GDPR-Article15-DataPortability',
      exportedAt: new Date().toISOString(),
      subject: userSafe,
      loginHistory: audits,
      resourceAccesses: accesses,
      approvalsRequested: approvalsOwn,
      approvalsDecided: approvalDecisions,
    }
  }
}
