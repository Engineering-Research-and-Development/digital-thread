import { Body, Controller, Get, NotFoundException, Param, Post, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { PartnerScopeGuard } from '@/auth/guards/partner-scope.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { AasSubmodelsService } from './submodels.service'
import { AasServerClient } from './aas-server.client'
import { sendAasx } from './aasx-packager'

@ApiTags('aas-submodels')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('aas')
export class AasSubmodelsController {
  constructor(
    private svc: AasSubmodelsService,
    private server: AasServerClient,
  ) {}

  /** Full Instance shell of an iteration (AAS 3.0 Environment: asset + submodels). */
  @Get('iteration/:id/shell')
  shell(@Param('id') id: string) { return this.svc.iterationShell(id) }

  @Get('iteration/:id/aasx')
  @UseGuards(PartnerScopeGuard)
  @ApiOperation({ summary: 'Instance-level Environment of an iteration (incl. one IDTA 02100 MWD per task of the frozen version) as an AASX package' })
  async shellAasx(@Param('id') id: string, @Res() reply: FastifyReply) {
    const env = await this.svc.iterationShell(id)
    if (!env) throw new NotFoundException(`Iteration ${id} not found`)
    sendAasx(reply, env, env.assetAdministrationShells[0].idShort)
  }

  @Get('iteration/:id/nodes/:nodeId/mwd')
  @UseGuards(PartnerScopeGuard)
  @ApiOperation({ summary: 'IDTA 02100 Manufacturing Work Description (instance) of one task node of the iteration, read from the frozen version' })
  nodeMwd(@Param('id') id: string, @Param('nodeId') nodeId: string) {
    return this.svc.iterationNodeMwd(id, nodeId)
  }

  @Get('iteration/:id/nodes/:nodeId/mwd/aasx')
  @UseGuards(PartnerScopeGuard)
  @ApiOperation({ summary: 'The Manufacturing Work Description (instance) of one task node as an AASX package' })
  async nodeMwdAasx(@Param('id') id: string, @Param('nodeId') nodeId: string, @Res() reply: FastifyReply) {
    const env = await this.svc.iterationNodeMwd(id, nodeId)
    sendAasx(reply, env, env.submodels[0].idShort)
  }

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
