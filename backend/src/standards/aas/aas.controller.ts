import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common'
import { AasMapperService } from './aas-mapper.service'
import { AasImporterService } from './aas-importer.service'
import { MachinesService } from '@/machines/machines.service'
import { validateAas } from '../validation/aas-validator'
import { NODE_CATALOG } from '@/standards/node-catalog.data'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'

@UseGuards(JwtAuthGuard)
@Controller('aas')
export class AasController {
  constructor(
    private mapper: AasMapperService,
    private importer: AasImporterService,
    private machines: MachinesService,
  ) {}

  @Get('machines/:id')
  async getMachine(@Param('id') id: string) {
    const machine = await this.machines.findOne(id)
    return this.mapper.machineToAas(machine)
  }

  @Get('node-catalog')
  getNodeCatalog() {
    return this.mapper.nodeCatalogToAas(NODE_CATALOG)
  }

  @Post('validate')
  validate(@Body() body: unknown) {
    return validateAas(body)
  }

  @Post('import')
  async importMachine(@Body() body: unknown) {
    const dto = this.importer.import(body)
    return this.machines.create(dto)
  }
}
