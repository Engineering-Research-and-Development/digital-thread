import { Module } from '@nestjs/common'
import { GovernanceModule } from '@/governance/governance.module'
import { UsageFrameworkController } from './usage-framework.controller'
import { UsageFrameworkService } from './usage-framework.service'

@Module({
  imports: [GovernanceModule],
  controllers: [UsageFrameworkController],
  providers: [UsageFrameworkService],
  exports: [UsageFrameworkService],
})
export class UsageFrameworkModule {}
