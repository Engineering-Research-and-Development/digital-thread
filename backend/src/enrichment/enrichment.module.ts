import { Module } from '@nestjs/common'
import { FilesModule } from '@/files/files.module'
import { EventsModule } from '@/events/events.module'
import { EnrichmentController } from './enrichment.controller'
import { EnrichmentService } from './enrichment.service'

@Module({
  imports: [FilesModule, EventsModule],
  controllers: [EnrichmentController],
  providers: [EnrichmentService],
  exports: [EnrichmentService],
})
export class EnrichmentModule {}
