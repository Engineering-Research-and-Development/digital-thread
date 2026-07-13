import { Module } from '@nestjs/common'
import { ComplianceController } from './compliance.controller'
import { ComplianceReportService } from './compliance-report.service'
import { DppService } from './dpp.service'
import { ComponentPassportService } from './component-passport.service'
import { VersionCompareService } from './version-compare.service'

@Module({
  controllers: [ComplianceController],
  providers: [ComplianceReportService, DppService, ComponentPassportService, VersionCompareService],
  exports: [ComplianceReportService, DppService, ComponentPassportService, VersionCompareService],
})
export class ComplianceModule {}
