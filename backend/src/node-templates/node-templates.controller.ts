import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { NodeTemplatesService, type NodeTemplateDto } from './node-templates.service'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'

@ApiTags('node-templates')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('node-templates')
export class NodeTemplatesController {
  constructor(private svc: NodeTemplatesService) {}

  /** Read-open to all authenticated roles — the palette needs them. */
  @Get()
  findAll(@Query('enabledOnly') enabledOnly?: string) {
    return this.svc.findAll({ enabledOnly: enabledOnly === 'true' })
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  /** Mutations are reserved to SUPERADMIN/OWNER (configuration scope). */
  @Post()
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  create(@Body() body: Partial<NodeTemplateDto>) {
    return this.svc.create(body)
  }

  @Patch(':id')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  update(@Param('id') id: string, @Body() body: Partial<NodeTemplateDto>) {
    return this.svc.update(id, body)
  }

  @Delete(':id')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }
}
