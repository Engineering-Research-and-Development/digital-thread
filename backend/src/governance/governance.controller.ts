import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { ApprovalsService, type ApprovalAction } from './approvals.service'
import { SignedManifestService } from './signed-manifest.service'
import { FileAccessRequestsService } from '@/files/file-access-requests.service'
import { PrismaService } from '@/database/prisma.service'

@ApiTags('governance')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('governance')
export class GovernanceController {
  constructor(
    private approvals: ApprovalsService,
    private signed: SignedManifestService,
    private fileAccess: FileAccessRequestsService,
    private prisma: PrismaService,
  ) {}

  // ── ApprovalRequest ──────────────────────────────────────────────────────

  @Get('approvals')
  listApprovals(@Query('status') status?: string) {
    return this.approvals.list({ status })
  }

  @Post('approvals')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  request(
    @Body() body: { action: ApprovalAction; targetType: string; targetId: string; reason?: string },
    @CurrentUser() user: any,
  ) {
    return this.approvals.request({ requesterId: user.id, ...body })
  }

  @Patch('approvals/:id/decide')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  decide(
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVE' | 'REJECT'; comment?: string },
    @CurrentUser() user: any,
  ) {
    return this.approvals.decide(id, user, body.decision, body.comment)
  }

  @Patch('approvals/:id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: any) {
    return this.approvals.cancel(id, user.id)
  }

  // ── File access requests (per-file read approvals) ───────────────────────

  @Get('file-access-requests')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  listFileAccessRequests(
    @CurrentUser() user: { id: string; role: any; partnerId?: string | null },
    @Query('status') status?: string,
  ) {
    // SUPERADMIN → all; OWNER → requests for files in their products' iterations (scoped in the service).
    return this.fileAccess.list({ status, requester: user })
  }

  @Patch('file-access-requests/:id/decide')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  decideFileAccessRequest(
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVE' | 'REJECT'; note?: string; grantHours?: number },
    @CurrentUser() user: { id: string; role: any; partnerId?: string | null },
  ) {
    return this.fileAccess.decide(id, user, body.decision, { note: body.note, grantHours: body.grantHours })
  }

  // ── Signed manifest ──────────────────────────────────────────────────────

  @Post('manifests/iteration/:id/sign')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  sign(@Param('id') iterationId: string, @Body() body: { partnerId: string }) {
    return this.signed.exportSigned(iterationId, body.partnerId)
  }

  @Get('manifests/:id/verify')
  verify(@Param('id') manifestId: string) {
    return this.signed.verify(manifestId)
  }

  @Get('manifests/iteration/:id')
  listManifests(@Param('id') iterationId: string) {
    return this.prisma.iterationManifest.findMany({
      where: { iterationId },
      orderBy: { createdAt: 'desc' },
    })
  }

  // ── Access log read (read-audit viewer for SUPERADMIN) ───────────────────

  @Get('access-log')
  @Roles(ROLE.SUPERADMIN)
  accessLog(@Query('resourceType') resourceType?: string, @Query('userId') userId?: string) {
    return this.prisma.accessLog.findMany({
      where: { resourceType, userId },
      orderBy: { timestamp: 'desc' },
      take: 500,
    })
  }

  @Get('admin-audit')
  @Roles(ROLE.SUPERADMIN)
  adminAudit(@Query('actorUserId') actorUserId?: string) {
    return this.prisma.adminAuditLog.findMany({
      where: { actorUserId },
      orderBy: { timestamp: 'desc' },
      take: 500,
    })
  }

  @Get('login-audit')
  @Roles(ROLE.SUPERADMIN)
  loginAudit(@Query('email') email?: string) {
    return this.prisma.loginAuditLog.findMany({
      where: { email },
      orderBy: { timestamp: 'desc' },
      take: 500,
    })
  }

  // ── Governance dashboard metrics ─────────────────────────────────────────

  @Get('dashboard')
  @Roles(ROLE.SUPERADMIN)
  async dashboard() {
    // "Signed manifests" and "Locked users" metrics were removed —
    // those features are not surfaced in the UI.
    const [pendingFileAccess, recentDownloads] = await Promise.all([
      this.prisma.fileAccessRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.accessLog.count({ where: { action: 'DOWNLOAD', timestamp: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    ])
    const classificationBreakdown = await this.prisma.fileRecord.groupBy({
      by: ['classification'],
      _count: { _all: true },
    })
    return {
      pendingFileAccessRequests: pendingFileAccess,
      recentDownloads24h: recentDownloads,
      filesByClassification: classificationBreakdown.map((g) => ({ classification: g.classification, count: g._count._all })),
    }
  }
}
