import { Module } from '@nestjs/common'
import { NodeTemplatesService } from './node-templates.service'
import { NodeTemplatesController } from './node-templates.controller'

@Module({
  providers: [NodeTemplatesService],
  controllers: [NodeTemplatesController],
  exports: [NodeTemplatesService],
})
export class NodeTemplatesModule {}
