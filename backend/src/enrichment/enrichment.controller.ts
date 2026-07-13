import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { EnrichmentService } from './enrichment.service'

@ApiTags('enrichment')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('enrichment')
export class EnrichmentController {
  constructor(private svc: EnrichmentService) {}

  @Get('files/:id')
  list(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: any; partnerId?: string | null },
  ) {
    // OWNER only sees enrichment for their products' files.
    return this.svc.listForFile(id, user)
  }

  @Post('files/:id/run')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  run(@Param('id') id: string) { return this.svc.runAll(id) }
}
