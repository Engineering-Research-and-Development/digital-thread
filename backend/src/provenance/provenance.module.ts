import { Module } from '@nestjs/common'
import { ProvenanceController } from './provenance.controller'
import { ProvenanceService } from './provenance.service'
import { IterationStoryService } from './story.service'

@Module({
  controllers: [ProvenanceController],
  providers: [ProvenanceService, IterationStoryService],
  exports: [ProvenanceService, IterationStoryService],
})
export class ProvenanceModule {}
