import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { DataSourcesService } from './datasources.service'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'

@ApiTags('datasources')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('datasources')
export class DataSourcesController {
  constructor(private svc: DataSourcesService) {}

  @Get() findAll() { return this.svc.findAll() }
  @Get(':id') findOne(@Param('id') id: string) { return this.svc.findOne(id) }

  @Post() @Roles(ROLE.SUPERADMIN) create(@Body() body: any) { return this.svc.create(body) }
  @Put(':id') @Roles(ROLE.SUPERADMIN) update(@Param('id') id: string, @Body() body: any) { return this.svc.update(id, body) }
  @Delete(':id') @Roles(ROLE.SUPERADMIN) @HttpCode(204) remove(@Param('id') id: string) { return this.svc.remove(id) }

  @Post(':id/test-connection')
  @HttpCode(200)
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  testConnection(@Param('id') id: string) { return this.svc.testConnection(id) }

  @Get(':id/status')
  getStatus(@Param('id') id: string) { return this.svc.getStatus(id) }

  @Post(':id/fetch-sample')
  @HttpCode(200)
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  fetchSample(@Param('id') id: string) { return this.svc.fetchSample(id) }
}
