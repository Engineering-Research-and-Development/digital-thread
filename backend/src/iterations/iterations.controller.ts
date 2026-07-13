import {
  Controller, Get, Post, Delete, Param, Body, Query,
  Patch, HttpCode, UseGuards, ForbiddenException,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { IterationsService } from './iterations.service'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { PartnerScopeGuard } from '@/auth/guards/partner-scope.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE, type Role } from '@/auth/roles'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'

@ApiTags('iterations')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('iterations')
export class IterationsController {
  constructor(private svc: IterationsService) {}

  @Get()
  findAll(
    @CurrentUser() user: { id: string; role: Role; partnerId?: string },
    @Query('machineId') machineId?: string,
    @Query('productId') productId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.findAll({
      machineId,
      productId,
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
      requester: user,
    })
  }

  @Get(':id')
  @UseGuards(PartnerScopeGuard)
  findOne(@Param('id') id: string) { return this.svc.findOne(id) }

  @Post()
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  create(
    @Body()
    body: {
      machineId: string
      metadata?: Record<string, string>
      classification?: string
      ownerPartnerId?: string
      productId?: string
    },
    @CurrentUser() user: { id: string; role: Role; partnerId?: string },
  ) {
    return this.svc.create(body, user)
  }

  @Delete(':id')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  @UseGuards(PartnerScopeGuard) // Row-scope: an OWNER may only delete iterations its partner owns/is involved in.
  @HttpCode(204)
  remove(@Param('id') id: string) { return this.svc.remove(id) }

  @Post(':id/restart')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  @UseGuards(PartnerScopeGuard)
  restart(@Param('id') id: string, @Body() body: { fromNodeId: string }) {
    return this.svc.restart(id, body.fromNodeId)
  }

  /** Recover an iteration whose workflow advancement failed mid-way. */
  @Post(':id/repair')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  @UseGuards(PartnerScopeGuard)
  repair(@Param('id') id: string) {
    return this.svc.repair(id)
  }

  @Get(':id/nodes')
  @UseGuards(PartnerScopeGuard)
  getNodeStates(@Param('id') id: string) { return this.svc.getNodeStates(id) }

  @Patch(':id/nodes/:nodeId/claim')
  @UseGuards(PartnerScopeGuard)
  claimNode(
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @CurrentUser() user: any,
  ) {
    return this.svc.claimNode(id, nodeId, user.email ?? user.id)
  }

  @Post(':id/nodes/:nodeId/complete')
  @UseGuards(PartnerScopeGuard)
  completeNode(
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() body?: { outputFilePath?: string },
  ) {
    return this.svc.completeNode(id, nodeId, body?.outputFilePath)
  }

  @Post(':id/nodes/:nodeId/input-file')
  @UseGuards(PartnerScopeGuard)
  setInputFile(
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() body: { inputId: string; filePath?: string; fileIds?: string[] },
  ) {
    // Accept either a single legacy filePath or a list of FileRecord ids.
    const value = Array.isArray(body.fileIds) && body.fileIds.length > 0 ? body.fileIds : body.filePath ?? ''
    return this.svc.setInputFile(id, nodeId, body.inputId, value)
  }

  /**
   * List predecessor outputs for a node, ready for download by the partner
   * currently responsible. Returns one entry per declared input of source
   * kind PREDECESSOR with the resolved file metadata.
   */
  @Get(':id/nodes/:nodeId/predecessor-outputs')
  @UseGuards(PartnerScopeGuard)
  listPredecessorOutputs(@Param('id') id: string, @Param('nodeId') nodeId: string) {
    return this.svc.listPredecessorOutputs(id, nodeId)
  }

  /**
   * Files bound to a node's OWN output slots, resolved from the node's
   * `outputsJson` by id (so cross-iteration "linked" files and locked files are
   * surfaced for the iteration panel's Outputs section). Partner-scoped: the
   * viewer's partner must be involved in the iteration.
   */
  @Get(':id/nodes/:nodeId/outputs')
  listNodeOutputs(
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @CurrentUser() user: { id: string; role: Role; partnerId?: string },
  ) {
    // Iteration-level scope is enforced in the service (a partner involved in
    // the iteration may view ANY node's outputs — incl. other partners' — to
    // request access). PartnerScopeGuard's node-ownership check is too strict.
    return this.svc.listNodeOutputs(id, nodeId, user)
  }

  /** Attach an EXISTING file (raw or from another iteration) as a node output. */
  @Post(':id/nodes/:nodeId/attach-output')
  @UseGuards(PartnerScopeGuard)
  attachExistingOutput(
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() body: { outputId: string; fileId: string },
    @CurrentUser() user: { email?: string },
  ) {
    return this.svc.attachExistingOutput(id, nodeId, body.outputId, body.fileId, user?.email)
  }

  @Get(':id/timeline')
  @UseGuards(PartnerScopeGuard)
  getTimeline(@Param('id') id: string) { return this.svc.getTimeline(id) }
}
