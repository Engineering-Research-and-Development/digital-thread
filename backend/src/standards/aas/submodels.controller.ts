import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { AasSubmodelsService } from './submodels.service'
import { AasServerClient } from './aas-server.client'

@ApiTags('aas-submodels')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('aas')
export class AasSubmodelsController {
  constructor(
    private svc: AasSubmodelsService,
    private server: AasServerClient,
  ) {}

  /** Full Instance shell of an iteration (asset + submodels inline). */
  @Get('iteration/:id/shell')
  shell(@Param('id') id: string) { return this.svc.iterationShell(id) }

  @Get('iteration/:id/technical-data')
  technical(@Param('id') id: string) { return this.svc.technicalData(id) }

  @Get('iteration/:id/handover-documentation')
  handover(@Param('id') id: string) { return this.svc.handoverDocumentation(id) }

  @Get('iteration/:id/provenance-log')
  provenanceLog(@Param('id') id: string) { return this.svc.provenanceLog(id) }

  @Get('iteration/:id/nodes/:nodeId/time-series')
  timeSeries(@Param('id') id: string, @Param('nodeId') nodeId: string) {
    return this.svc.timeSeriesData(id, nodeId)
  }

  @Post('server/publish/shell')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  publishShell(@Body() body: { shell: any }) { return this.server.publishShell(body.shell) }

  @Post('server/publish/submodel')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  publishSubmodel(@Body() body: { shellId: string; submodel: any }) {
    return this.server.publishSubmodel(body.shellId, body.submodel)
  }

  @Post('registry/register')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  register(@Body() body: { descriptor: object }) { return this.server.registerInRegistry(body.descriptor) }

  @Get('registry/lookup/:shellId')
  lookup(@Param('shellId') shellId: string) { return this.server.lookupShell(decodeURIComponent(shellId)) }
}
