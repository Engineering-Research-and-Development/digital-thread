import { Controller, Get, Post, Param, Body, Res, UseGuards, HttpStatus } from '@nestjs/common'
import { AmlExporterService } from './aml-exporter.service'
import { AmlImporterService } from './aml-importer.service'
import { MachinesService } from '@/machines/machines.service'
import { validateAml } from '../validation/aml-validator'
import { XMLParser } from 'fast-xml-parser'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { FastifyReply } from 'fastify'

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

@UseGuards(JwtAuthGuard)
@Controller('aml')
export class AmlController {
  constructor(
    private exporter: AmlExporterService,
    private importer: AmlImporterService,
    private machines: MachinesService,
  ) {}

  @Get('machines/:id')
  async getMachine(@Param('id') id: string, @Res() reply: FastifyReply) {
    const machine = await this.machines.findOne(id)
    const xml = this.exporter.machineToAml(machine)
    reply
      .status(HttpStatus.OK)
      .header('Content-Type', 'application/xml')
      .header('Content-Disposition', `attachment; filename="${machine.name.replace(/\s+/g, '_')}.aml"`)
      .send(xml)
  }

  @Get('node-catalog')
  getNodeCatalog(@Res() reply: FastifyReply) {
    const xml = this.exporter.nodeCatalogToAml()
    reply
      .status(HttpStatus.OK)
      .header('Content-Type', 'application/xml')
      .header('Content-Disposition', 'attachment; filename="DigitalThreadNodeCatalog.aml"')
      .send(xml)
  }

  @Post('validate')
  validate(@Body() body: unknown) {
    // Accept JSON (pre-parsed) or XML string
    const parsed = typeof body === 'string' ? xmlParser.parse(body) : body
    return validateAml(parsed)
  }

  @Post('import')
  async importMachine(@Body() body: unknown) {
    let parsed: unknown
    if (typeof body === 'string') {
      parsed = xmlParser.parse(body)
    } else {
      parsed = body
    }
    const dto = this.importer.import(parsed)
    return this.machines.create(dto)
  }
}
