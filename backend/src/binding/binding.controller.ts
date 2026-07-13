import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE } from '@/auth/roles'
import { BindingService } from './binding.service'
import { BindingRuntimeService } from './binding-runtime.service'
import type { BindingType } from './binding.types'

@ApiTags('bindings')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('bindings')
export class BindingController {
  constructor(
    private svc: BindingService,
    private runtime: BindingRuntimeService,
  ) {}

  @Get()
  list(
    @Query('stateMachineId') stateMachineId?: string,
    @Query('dataSourceId') dataSourceId?: string,
  ) {
    if (dataSourceId) return this.svc.listByDataSource(dataSourceId)
    if (stateMachineId) return this.svc.listByMachine(stateMachineId)
    return []
  }

  @Post()
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  upsert(@Body() body: {
    stateMachineId: string
    nodeId: string
    inputId: string
    bindingType: BindingType
    dataSourceId?: string | null
    config?: object
  }) {
    return this.svc.upsert(body)
  }

  @Delete(':id')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }

  @Post('resolve')
  resolve(@Body() body: { iterationId: string; nodeId: string }) {
    return this.runtime.resolveNode(body)
  }
}
