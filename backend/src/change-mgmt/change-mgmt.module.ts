import { Module } from '@nestjs/common'
import { LineageModule } from '@/lineage/lineage.module'
import { FilesModule } from '@/files/files.module'
import { ChangeMgmtController } from './change-mgmt.controller'
import { ChangeRequestService } from './change-request.service'
import { NonConformanceService } from './non-conformance.service'
import { FieldIssueService } from './field-issue.service'

@Module({
  imports: [LineageModule, FilesModule],
  controllers: [ChangeMgmtController],
  providers: [ChangeRequestService, NonConformanceService, FieldIssueService],
  exports: [ChangeRequestService, NonConformanceService, FieldIssueService],
})
export class ChangeMgmtModule {}
