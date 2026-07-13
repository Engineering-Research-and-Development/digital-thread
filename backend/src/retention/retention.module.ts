import { Module } from '@nestjs/common'
import { FilesModule } from '@/files/files.module'
import { RetentionPolicyService } from './retention-policy.service'
import { ErasureService } from './erasure.service'
import { RetentionController } from './retention.controller'

@Module({
  imports: [FilesModule],
  controllers: [RetentionController],
  providers: [RetentionPolicyService, ErasureService],
  exports: [RetentionPolicyService, ErasureService],
})
export class RetentionModule {}
