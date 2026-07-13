import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { AuditService } from './audit.service'

const parseDate = (s?: string): Date | undefined => {
  if (!s) return undefined
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? undefined : d
}

const parseInt0 = (s?: string): number | undefined => {
  if (s == null || s === '') return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}

/**
 * System-wide audit endpoints — SUPERADMIN only. Read-only projections over
 * the append-only audit tables (AdminAuditLog / AccessLog / LoginAuditLog)
 * and the in-process Prometheus metrics registry.
 */
@ApiTags('audit')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(ROLE.SUPERADMIN)
@Controller('audit')
export class AuditController {
  constructor(private svc: AuditService) {}

  @Get('summary')
  summary() {
    return this.svc.summary()
  }

  @Get('admin')
  listAdmin(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('actorUserId') actorUserId?: string,
    @Query('actorRole') actorRole?: string,
    @Query('targetType') targetType?: string,
    @Query('action') action?: string,
    @Query('search') search?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.listAdminAudit({
      limit: parseInt0(limit),
      offset: parseInt0(offset),
      actorUserId,
      actorRole,
      targetType,
      action,
      search,
      from: parseDate(from),
      to: parseDate(to),
    })
  }

  @Get('access')
  listAccess(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('userId') userId?: string,
    @Query('resourceType') resourceType?: string,
    @Query('classification') classification?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.listAccessLog({
      limit: parseInt0(limit),
      offset: parseInt0(offset),
      userId,
      resourceType,
      classification,
      action,
      from: parseDate(from),
      to: parseDate(to),
    })
  }

  @Get('logins')
  listLogins(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('email') email?: string,
    @Query('success') success?: string,
    @Query('reason') reason?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.svc.listLoginAudit({
      limit: parseInt0(limit),
      offset: parseInt0(offset),
      email,
      success: success == null ? undefined : success === 'true',
      reason,
      from: parseDate(from),
      to: parseDate(to),
    })
  }

  @Get('metrics')
  metrics() {
    return this.svc.parsedMetrics()
  }
}
