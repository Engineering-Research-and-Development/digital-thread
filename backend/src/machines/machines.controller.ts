import { Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, UseGuards, ParseIntPipe } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { MachinesService } from './machines.service'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'

@ApiTags('machines')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('machines')
export class MachinesController {
  constructor(private svc: MachinesService) {}

  // All roles may list & view templates.
  @Get()
  findAll(@Query('page') page?: string, @Query('limit') limit?: string) {
    return this.svc.findAll(page ? +page : 1, limit ? +limit : 50)
  }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.svc.findOne(id) }

  @Post()
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  create(@Body() body: any, @CurrentUser() user: any) {
    return this.svc.create({ ...body, createdById: user?.id })
  }

  @Put(':id')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.svc.update(id, { ...body, createdById: user?.id })
  }

  @Put(':id/graph')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  updateGraph(
    @Param('id') id: string,
    @Body() body: { nodes: any[]; edges: any[]; groups?: any[] },
    @CurrentUser() user: any,
  ) {
    // Groups are optional and frozen alongside nodes/edges.
    return this.svc.updateGraph(id, body.nodes, body.edges, body.groups, user?.id)
  }

  @Delete(':id')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  @HttpCode(204)
  remove(@Param('id') id: string) { return this.svc.remove(id) }

  @Get(':id/iterations')
  findIterations(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.findIterations(id, page ? +page : 1, limit ? +limit : 50)
  }

  /** Immutable version history of a state machine. */
  @Get(':id/versions')
  listVersions(@Param('id') id: string) {
    return this.svc.listVersions(id)
  }

  /** Full snapshot of a specific version (nodes + edges). */
  @Get(':id/versions/:n')
  getVersion(@Param('id') id: string, @Param('n', ParseIntPipe) n: number) {
    return this.svc.getVersion(id, n)
  }
}
