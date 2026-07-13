import { Controller, Get, NotFoundException, Post, Param, Body, UseGuards } from '@nestjs/common'
import { DtdlExporterService } from './dtdl-exporter.service'
import { DtdlImporterService } from './dtdl-importer.service'
import { MachinesService } from '@/machines/machines.service'
import { PrismaService } from '@/database/prisma.service'
import { validateDtdl } from '../validation/dtdl-validator'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'

@UseGuards(JwtAuthGuard)
@Controller('dtdl')
export class DtdlController {
  constructor(
    private exporter: DtdlExporterService,
    private importer: DtdlImporterService,
    private machines: MachinesService,
    private prisma: PrismaService,
  ) {}

  @Get('machines/:id')
  async getMachine(@Param('id') id: string) {
    const machine = await this.machines.findOne(id)
    return this.exporter.machineToDtdl(machine)
  }

  /**
   * DTDL twin instance of a specific iteration. Self-contained
   * (`models[]` + `twins[]`) so the file can be handed off to a partner
   * without an Azure Digital Twins service.
   */
  @Get('iteration/:id')
  async getIteration(@Param('id') id: string) {
    const iter = await this.prisma.iteration.findUnique({
      where: { id },
      include: { nodeStates: true },
    })
    if (!iter) throw new NotFoundException(`Iteration ${id} not found`)
    const machine = await this.machines.findOne(iter.machineId)
    return this.exporter.machineIterationToDtdlTwin(machine, iter, iter.nodeStates)
  }

  @Get('node-catalog')
  getNodeCatalog() {
    return this.exporter.nodeCatalogToDtdl()
  }

  @Post('validate')
  validate(@Body() body: unknown) {
    const docs = Array.isArray(body) ? body : [body]
    return validateDtdl(docs)
  }

  @Post('import')
  async importMachine(@Body() body: unknown) {
    const dto = this.importer.import(body)
    return this.machines.create(dto)
  }
}
