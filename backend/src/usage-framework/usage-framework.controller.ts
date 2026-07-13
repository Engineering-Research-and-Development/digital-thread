import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { UsageFrameworkService } from './usage-framework.service'

@ApiTags('usage-framework')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('usage')
export class UsageFrameworkController {
  constructor(private svc: UsageFrameworkService) {}

  @Post('policy/validate')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  validate(@Body() body: any) { return this.svc.validatePolicy(body) }

  // ── Exports ──────────────────────────────────────────────────────────────

  @Get('exports')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  listExports() { return this.svc.listExports() }

  @Post('exports')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  createExport(
    @Body() body: { iterationId: string; targetPartnerId?: string; policy?: any },
    @CurrentUser() user: any,
  ) {
    return this.svc.createExport({ ...body, createdById: user.id })
  }

  @Post('exports/:id/sign')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  sign(@Param('id') id: string, @Body() body: { signerPartnerId: string }) {
    return this.svc.signAndAttach(id, body.signerPartnerId)
  }

  @Patch('exports/:id/transmitted')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  transmitted(@Param('id') id: string) { return this.svc.markTransmitted(id) }

  // ── Imports ──────────────────────────────────────────────────────────────

  @Get('imports')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  listImports() { return this.svc.listImports() }

  @Post('imports')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  receiveImport(@Body() body: { sourcePartner: string; manifestJson: any; signature?: string; policy?: any }) {
    return this.svc.receiveImport(body)
  }

  @Post('imports/:id/verify')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  verify(@Param('id') id: string) { return this.svc.verifyImport(id) }

  @Post('imports/:id/accept')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  accept(@Param('id') id: string, @CurrentUser() user: any) { return this.svc.acceptImport(id, user.id) }

  @Post('imports/:id/check')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  check(@Param('id') id: string, @Body() body: { action: string; ctx?: Record<string, any> }) {
    return this.svc.checkAllowed(id, body.action, body.ctx)
  }
}
