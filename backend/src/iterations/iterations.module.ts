import { Module } from '@nestjs/common'
import { PartnerScopeGuard } from '@/auth/guards/partner-scope.guard'
import { IterationsService } from './iterations.service'
import { IterationsController } from './iterations.controller'
import { WorkflowEngineService } from './workflow-engine.service'
import { EventsModule } from '@/events/events.module'
import { FilesModule } from '@/files/files.module'
import { LineageModule } from '@/lineage/lineage.module'

@Module({
  imports: [EventsModule, FilesModule, LineageModule],
  providers: [IterationsService, WorkflowEngineService, PartnerScopeGuard],
  controllers: [IterationsController],
  exports: [IterationsService, WorkflowEngineService],
})
export class IterationsModule {}
