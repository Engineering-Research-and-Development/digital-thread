import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import type { BindingType } from './binding.types'

@Injectable()
export class BindingService {
  constructor(private prisma: PrismaService) {}

  async listByMachine(stateMachineId: string) {
    return this.prisma.inputBinding.findMany({
      where: { stateMachineId },
      orderBy: [{ nodeId: 'asc' }, { inputId: 'asc' }],
    })
  }

  async listByDataSource(dataSourceId: string) {
    return this.prisma.inputBinding.findMany({
      where: { dataSourceId },
      include: { stateMachine: { select: { id: true, name: true, version: true } } },
    })
  }

  async upsert(input: {
    stateMachineId: string
    nodeId: string
    inputId: string
    bindingType: BindingType
    dataSourceId?: string | null
    config?: object
  }) {
    const sm = await this.prisma.stateMachine.findUnique({ where: { id: input.stateMachineId } })
    if (!sm) throw new NotFoundException(`StateMachine ${input.stateMachineId} not found`)
    this.assertConfigShape(input.bindingType, input.config)
    return this.prisma.inputBinding.upsert({
      where: {
        stateMachineId_nodeId_inputId: {
          stateMachineId: input.stateMachineId,
          nodeId: input.nodeId,
          inputId: input.inputId,
        },
      },
      create: {
        stateMachineId: input.stateMachineId,
        nodeId: input.nodeId,
        inputId: input.inputId,
        bindingType: input.bindingType,
        dataSourceId: input.dataSourceId ?? null,
        configJson: JSON.stringify(input.config ?? {}),
      },
      update: {
        bindingType: input.bindingType,
        dataSourceId: input.dataSourceId ?? null,
        configJson: JSON.stringify(input.config ?? {}),
      },
    })
  }

  async remove(id: string) {
    await this.prisma.inputBinding.delete({ where: { id } })
  }

  private assertConfigShape(type: BindingType, config: any) {
    const has = (key: string) => config && typeof config[key] === 'string' && config[key].length > 0
    switch (type) {
      case 'FROM_NODE':
        if (!has('sourceNodeId')) throw new BadRequestException('FROM_NODE requires config.sourceNodeId')
        break
      case 'FROM_DATASOURCE_QUERY':
        if (!has('queryTemplate')) throw new BadRequestException('FROM_DATASOURCE_QUERY requires config.queryTemplate')
        break
      case 'FROM_DATASOURCE_EVENT':
        if (!has('topicTemplate')) throw new BadRequestException('FROM_DATASOURCE_EVENT requires config.topicTemplate')
        break
      case 'FROM_AAS_SUBMODEL':
        if (!has('submodelUri') || !has('elementPath')) {
          throw new BadRequestException('FROM_AAS_SUBMODEL requires config.submodelUri and config.elementPath')
        }
        break
      case 'FROM_METADATA':
        if (!has('metadataPath')) throw new BadRequestException('FROM_METADATA requires config.metadataPath')
        break
      case 'MANUAL':
        break
      default:
        throw new BadRequestException(`Unknown bindingType: ${type}`)
    }
  }
}
