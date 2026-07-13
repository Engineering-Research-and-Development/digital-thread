import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { ChangeRequestService, type ChangeStatus } from './change-request.service'
import { NonConformanceService, type NcSeverity, type RootCauseCategory } from './non-conformance.service'
import { FieldIssueService } from './field-issue.service'

@ApiTags('change-mgmt')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ChangeMgmtController {
  constructor(
    private cr: ChangeRequestService,
    private nc: NonConformanceService,
    private fi: FieldIssueService,
  ) {}

  // ── ChangeRequest ────────────────────────────────────────────────────────

  @Get('change-requests')
  listCRs(@Query('status') status?: ChangeStatus, @Query('targetType') targetType?: string) {
    return this.cr.list({ status, targetType })
  }

  @Post('change-requests')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  createCR(
    @Body() body: { title: string; description?: string; targetType: string; targetId: string },
    @CurrentUser() user: any,
  ) {
    return this.cr.create({ ...body, raisedBy: user.id })
  }

  @Patch('change-requests/:id/status')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  updateCRStatus(@Param('id') id: string, @Body() body: { status: ChangeStatus }) {
    return this.cr.updateStatus(id, body.status)
  }

  @Post('change-requests/:id/recompute-impact')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  recomputeImpact(@Param('id') id: string) { return this.cr.recomputeImpact(id) }

  // ── NonConformance ───────────────────────────────────────────────────────

  @Get('non-conformances')
  listNCs(@Query('status') status?: string, @Query('severity') severity?: NcSeverity) {
    return this.nc.list({ status, severity })
  }

  @Get('non-conformances/:id')
  findNC(@Param('id') id: string) { return this.nc.findOne(id) }

  @Get('non-conformances/:id/affected')
  affected(@Param('id') id: string) { return this.nc.affectedArtifacts(id) }

  @Post('non-conformances')
  createNC(@Body() body: {
    title: string; description: string
    iterationId?: string; nodeId?: string; fileRecordId?: string
    rootCauseCategory?: RootCauseCategory; rootCauseDetail?: string
    severity?: NcSeverity
  }, @CurrentUser() user: any) {
    return this.nc.create({ ...body, reportedBy: user.id })
  }

  @Patch('non-conformances/:id')
  updateNC(@Param('id') id: string, @Body() body: any) { return this.nc.update(id, body) }

  // ── FieldIssue ───────────────────────────────────────────────────────────

  @Get('field-issues')
  listFi(@Query('componentRef') componentRef?: string, @Query('status') status?: string) {
    return this.fi.list({ componentRef, status })
  }

  @Post('field-issues')
  createFi(@Body() body: { componentRef: string; description: string; severity?: string; capturedAt?: string }, @CurrentUser() user: any) {
    return this.fi.create({
      componentRef: body.componentRef,
      description: body.description,
      severity: body.severity,
      capturedAt: body.capturedAt ? new Date(body.capturedAt) : undefined,
      reporterId: user.id,
    })
  }

  @Patch('field-issues/:id/link')
  linkFi(@Param('id') id: string, @Body() body: { iterationId?: string; fileRecordId?: string }) {
    return this.fi.link(id, body)
  }

  @Patch('field-issues/:id/close')
  closeFi(@Param('id') id: string) { return this.fi.close(id) }
}
