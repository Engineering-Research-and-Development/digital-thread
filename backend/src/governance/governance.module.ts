import { Module } from '@nestjs/common'
import { FilesModule } from '@/files/files.module'
import { GovernanceController } from './governance.controller'
import { ApprovalsService } from './approvals.service'
import { SignedManifestService } from './signed-manifest.service'

@Module({
  imports: [FilesModule],
  controllers: [GovernanceController],
  providers: [ApprovalsService, SignedManifestService],
  exports: [ApprovalsService, SignedManifestService],
})
export class GovernanceModule {}
