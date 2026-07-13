import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { AasRegistrySyncService } from './registry-sync.service'

@ApiTags('aas-registry')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('aas/registry')
export class AasRegistrySyncController {
  constructor(private svc: AasRegistrySyncService) {}

  @Get('peers')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  listPeers() { return this.svc.listPeers() }

  @Post('peers')
  @Roles(ROLE.SUPERADMIN)
  addPeer(@Body() body: { name: string; registryUrl: string }) { return this.svc.addPeer(body) }

  @Patch('peers/:id')
  @Roles(ROLE.SUPERADMIN)
  updatePeer(@Param('id') id: string, @Body() body: any) { return this.svc.updatePeer(id, body) }

  @Delete('peers/:id')
  @Roles(ROLE.SUPERADMIN)
  removePeer(@Param('id') id: string) { return this.svc.removePeer(id) }

  @Post('peers/:id/sync')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  syncPeer(@Param('id') id: string) { return this.svc.syncPeer(id) }

  @Post('sync-all')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  syncAll() { return this.svc.syncAllPeers() }

  @Get('catalog')
  catalog(@Query('peerId') peerId?: string, @Query('q') q?: string) {
    return this.svc.federatedCatalog({ peerId, q })
  }
}
