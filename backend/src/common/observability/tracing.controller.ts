import { Controller, Get, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { tracingStatus } from './tracing'

@ApiTags('observability')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('observability')
export class TracingController {
  @Get('tracing')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  status() { return tracingStatus() }
}
