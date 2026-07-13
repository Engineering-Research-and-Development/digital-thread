import { Global, Module } from '@nestjs/common'
import { NormalizerService } from './normalizer.service'
import { NormalizationController } from './normalization.controller'

@Global()
@Module({
  providers: [NormalizerService],
  controllers: [NormalizationController],
  exports: [NormalizerService],
})
export class NormalizationModule {}
