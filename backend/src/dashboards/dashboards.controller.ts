import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { DashboardsService } from './dashboards.service'

@ApiTags('dashboards')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboards')
export class DashboardsController {
  constructor(private svc: DashboardsService) {}

  @Get('me')
  me(@CurrentUser() user: any) { return this.svc.forRole(user) }

  @Get('kpis')
  kpis() { return this.svc.crossPhaseKpis() }

  @Get('trend')
  trend(@Query('bucket') bucket?: 'day' | 'week', @Query('last') last?: string) {
    return this.svc.historicalTrend(bucket ?? 'day', last ? +last : 30)
  }
}
