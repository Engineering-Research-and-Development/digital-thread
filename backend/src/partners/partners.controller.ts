import { Controller, Get, Post, Put, Delete, Param, Body, HttpCode, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { PartnersService } from './partners.service'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto'

@ApiTags('partners')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('partners')
export class PartnersController {
  constructor(private svc: PartnersService) {}

  // All authenticated users may LIST and READ partners (needed for UI display).
  @Get()
  findAll() { return this.svc.findAll() }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.svc.findOne(id) }

  @Post()
  @Roles(ROLE.SUPERADMIN)
  create(@Body() body: CreatePartnerDto) {
    return this.svc.create(body)
  }

  @Put(':id')
  @Roles(ROLE.SUPERADMIN)
  update(@Param('id') id: string, @Body() body: UpdatePartnerDto) { return this.svc.update(id, body) }

  @Delete(':id')
  @Roles(ROLE.SUPERADMIN)
  @HttpCode(204)
  remove(@Param('id') id: string) { return this.svc.remove(id) }
}
