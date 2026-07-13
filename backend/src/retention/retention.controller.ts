import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { RetentionPolicyService } from './retention-policy.service'
import { ErasureService } from './erasure.service'

@ApiTags('retention')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('retention')
export class RetentionController {
  constructor(
    private retention: RetentionPolicyService,
    private erasure: ErasureService,
  ) {}

  @Get('policy')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  policy() { return { days: this.retention.policy() } }

  @Post('sweep')
  @Roles(ROLE.SUPERADMIN)
  sweep() { return this.retention.sweep() }

  // ── GDPR ─────────────────────────────────────────────────────────────────

  @Post('erasure/request/:subjectUserId')
  requestErasure(
    @Param('subjectUserId') subjectUserId: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: any,
  ) {
    // SUPERADMIN may file for any subject; other roles may only file for themselves.
    const requesterId = user.role === ROLE.SUPERADMIN ? user.id : user.id
    const subject = user.role === ROLE.SUPERADMIN ? subjectUserId : user.id
    return this.erasure.request({ subjectUserId: subject, requesterId, reason: body.reason })
  }

  @Post('erasure/execute/:approvalRequestId')
  @Roles(ROLE.SUPERADMIN)
  executeErasure(@Param('approvalRequestId') id: string) {
    return this.erasure.execute(id)
  }

  @Get('export/:subjectUserId')
  exportData(@Param('subjectUserId') subjectUserId: string, @CurrentUser() user: any) {
    const id = user.role === ROLE.SUPERADMIN ? subjectUserId : user.id
    return this.erasure.export(id)
  }
}
