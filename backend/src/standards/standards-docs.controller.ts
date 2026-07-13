import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
  NotFoundException,
  BadRequestException,
  HttpStatus,
} from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { promises as fs } from 'fs'
import { join } from 'path'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { MachinesService } from '@/machines/machines.service'
import { AasMapperService } from './aas/aas-mapper.service'
import { DtdlExporterService } from './dtdl/dtdl-exporter.service'
import { AmlExporterService } from './aml/aml-exporter.service'

type StandardFormat = 'aas' | 'dtdl' | 'aml'

const SUPPORTED: ReadonlySet<StandardFormat> = new Set(['aas', 'dtdl', 'aml'])

// The seeded `sm-uc-manual-upload` machine doubles as the canonical example:
// it exercises MANUAL/AUTOMATIC/GATEWAY/STORAGE node kinds, parallel branches,
// AND-gateways, and a non-conformity loop — i.e. every shape an importer
// realistically needs to round-trip.
const EXAMPLE_MACHINE_ID = 'sm-uc-manual-upload'

@UseGuards(JwtAuthGuard)
@Controller('standards')
export class StandardsDocsController {
  constructor(
    private machines: MachinesService,
    private aas: AasMapperService,
    private dtdl: DtdlExporterService,
    private aml: AmlExporterService,
  ) {}

  @Get(':format/example')
  async getExample(@Param('format') format: string, @Res() reply: FastifyReply) {
    const fmt = this.assertFormat(format)
    const machine = await this.machines.findOne(EXAMPLE_MACHINE_ID).catch(() => null)
    if (!machine) {
      throw new NotFoundException(
        `Example machine "${EXAMPLE_MACHINE_ID}" not found. Run \`npm run seed\` first.`,
      )
    }
    const safeName = (machine.name || 'example').replace(/\s+/g, '_')
    if (fmt === 'aas') {
      const doc = this.aas.machineToAas(machine)
      reply
        .status(HttpStatus.OK)
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="${safeName}.aas.json"`)
        .send(doc)
      return
    }
    if (fmt === 'dtdl') {
      const doc = this.dtdl.machineToDtdl(machine)
      reply
        .status(HttpStatus.OK)
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="${safeName}.dtdl.json"`)
        .send(doc)
      return
    }
    const xml = this.aml.machineToAml(machine)
    reply
      .status(HttpStatus.OK)
      .header('Content-Type', 'application/xml')
      .header('Content-Disposition', `attachment; filename="${safeName}.aml"`)
      .send(xml)
  }

  @Get(':format/reference')
  async getReference(@Param('format') format: string, @Res() reply: FastifyReply) {
    const fmt = this.assertFormat(format)
    const filename = `${fmt}-minimum-example.md`
    const content = await this.loadReferenceFile(filename)
    reply
      .status(HttpStatus.OK)
      .header('Content-Type', 'text/markdown; charset=utf-8')
      .header('Content-Disposition', `inline; filename="${filename}"`)
      .send(content)
  }

  private assertFormat(format: string): StandardFormat {
    const lower = format.toLowerCase() as StandardFormat
    if (!SUPPORTED.has(lower)) {
      throw new BadRequestException(
        `Unsupported format "${format}". Expected one of: aas, dtdl, aml.`,
      )
    }
    return lower
  }

  private async loadReferenceFile(filename: string): Promise<string> {
    // Tries cwd first (dev/prod normally launched from backend/), then walks up
    // from __dirname for edge cases where the process was started elsewhere.
    const candidates = [
      join(process.cwd(), 'docs', filename),
      join(__dirname, '..', '..', 'docs', filename),
      join(__dirname, '..', '..', '..', 'docs', filename),
    ]
    for (const path of candidates) {
      try {
        return await fs.readFile(path, 'utf-8')
      } catch {
        // try next
      }
    }
    throw new NotFoundException(`Reference doc not found: ${filename}`)
  }
}
