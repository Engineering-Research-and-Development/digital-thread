import { Controller, Get, Post, Param, Body, UseGuards, NotFoundException, Res } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { AasMapperService } from './aas-mapper.service'
import { AasImporterService } from './aas-importer.service'
import { MachinesService } from '@/machines/machines.service'
import { validateAas } from '../validation/aas-validator'
import { NODE_CATALOG } from '@/standards/node-catalog.data'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { sendAasx } from './aasx-packager'

@ApiTags('aas')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('aas')
export class AasController {
  constructor(
    private mapper: AasMapperService,
    private importer: AasImporterService,
    private machines: MachinesService,
  ) {}

  @Get('machines/:id')
  @ApiOperation({ summary: 'Type-level AAS 3.0 Environment of a workflow: WorkflowDefinition plus one IDTA 02100 Manufacturing Work Description per task node' })
  async getMachine(@Param('id') id: string) {
    const machine = await this.machines.findOne(id)
    return this.mapper.machineToAas(machine)
  }

  @Get('machines/:id/aasx')
  @ApiOperation({ summary: 'The Type-level Environment of a workflow as an AASX package (JSON specification part)' })
  async getMachineAasx(@Param('id') id: string, @Res() reply: FastifyReply) {
    const machine = await this.machines.findOne(id)
    const env = this.mapper.machineToAas(machine)
    sendAasx(reply, env, env.assetAdministrationShells[0].idShort)
  }

  @Get('machines/:id/nodes/:nodeId/mwd')
  @ApiOperation({ summary: 'IDTA 02100 Manufacturing Work Description (pattern) of one task node, as an Environment with its ConceptDescriptions' })
  async getNodeMwd(@Param('id') id: string, @Param('nodeId') nodeId: string) {
    const machine = await this.machines.findOne(id)
    const env = this.mapper.nodeMwdToAas(machine, nodeId)
    if (!env) throw new NotFoundException(`Node ${nodeId} is not a task of workflow ${id}`)
    return env
  }

  @Get('machines/:id/nodes/:nodeId/mwd/aasx')
  @ApiOperation({ summary: 'The Manufacturing Work Description of one task node as an AASX package' })
  async getNodeMwdAasx(@Param('id') id: string, @Param('nodeId') nodeId: string, @Res() reply: FastifyReply) {
    const machine = await this.machines.findOne(id)
    const env = this.mapper.nodeMwdToAas(machine, nodeId)
    if (!env) throw new NotFoundException(`Node ${nodeId} is not a task of workflow ${id}`)
    sendAasx(reply, env, env.submodels[0].idShort)
  }

  @Get('node-catalog')
  @ApiOperation({ summary: 'Node type catalog as an AAS Environment' })
  getNodeCatalog() {
    return this.mapper.nodeCatalogToAas(NODE_CATALOG)
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate an AAS document (Environment or legacy envelope) without importing it' })
  validate(@Body() body: unknown) {
    return validateAas(body)
  }

  @Post('import')
  @ApiOperation({ summary: 'Import an AAS Environment (WorkflowDefinition and/or Manufacturing Work Descriptions) or a legacy envelope as a new workflow' })
  async importMachine(@Body() body: unknown) {
    const dto = this.importer.import(body)
    return this.machines.create(dto)
  }
}
