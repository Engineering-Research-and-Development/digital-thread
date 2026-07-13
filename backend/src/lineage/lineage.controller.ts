import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { LineageService, RelationType } from './lineage.service'

@ApiTags('lineage')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('lineage')
export class LineageController {
  constructor(private svc: LineageService) {}

  @Get('files/:id/upstream')
  upstream(@Param('id') id: string, @Query('depth') depth?: string) {
    return this.svc.getUpstream(id, depth ? +depth : 5)
  }

  @Get('files/:id/downstream')
  downstream(@Param('id') id: string, @Query('depth') depth?: string) {
    return this.svc.getDownstream(id, depth ? +depth : 5)
  }

  @Get('files/:id/full')
  full(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: any; partnerId?: string | null },
    @Query('depth') depth?: string,
  ) {
    // OWNER sees only nodes/usages within their products' iterations.
    return this.svc.getFullGraph(id, depth ? +depth : 5, user)
  }

  @Post('edges')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  createEdge(@Body() body: {
    upstreamFileId: string
    downstreamFileId: string
    relationType?: RelationType
    transformInfo?: object
  }) {
    return this.svc.createEdge(body)
  }

  /**
   * Recompute lineage edges for an entire iteration — backfills any edges
   * that were missed when the lineage recorder was reading the legacy
   * `filePath` only and ignoring the `fileIds[]` shape.
   * Idempotent; the unique constraint dedupes existing edges.
   */
  @Post('iterations/:id/rebuild')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  rebuildForIteration(@Param('id') id: string) {
    return this.svc.rebuildForIteration(id)
  }
}
