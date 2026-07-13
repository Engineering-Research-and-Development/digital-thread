import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE, type Role } from '@/auth/roles'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { ProductsService } from './products.service'
import { CreateProductDto, UpdateProductDto } from './dto/product.dto'

type Actor = { id: string; role: Role; partnerId?: string }

@ApiTags('products')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(private svc: ProductsService) {}

  // All authenticated users may list/read (service scopes to own partner for
  // non-SUPERADMIN). Mutations are restricted to OWNER/SUPERADMIN.
  @Get()
  findAll(@CurrentUser() user: Actor) {
    return this.svc.findAll(user)
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: Actor) {
    return this.svc.findOne(id, user)
  }

  @Post()
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  create(@Body() body: CreateProductDto, @CurrentUser() user: Actor) {
    return this.svc.create(body, user)
  }

  @Patch(':id')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  update(@Param('id') id: string, @Body() body: UpdateProductDto, @CurrentUser() user: Actor) {
    return this.svc.update(id, body, user)
  }

  @Delete(':id')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() user: Actor) {
    return this.svc.remove(id, user)
  }
}
