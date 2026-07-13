import { Module } from '@nestjs/common'
import { AasRegistrySyncController } from './registry-sync.controller'
import { AasRegistrySyncService } from './registry-sync.service'

@Module({
  controllers: [AasRegistrySyncController],
  providers: [AasRegistrySyncService],
  exports: [AasRegistrySyncService],
})
export class AasRegistrySyncModule {}
