import { Module } from '@nestjs/common'
import { EventsModule } from '@/events/events.module'
import { AidImporterService } from './aid-importer.service'
import { CorrelationService } from './correlation.service'
import { AasEventsService } from './aas-events.service'
import { IngestionController } from './ingestion.controller'

@Module({
  imports: [EventsModule],
  controllers: [IngestionController],
  providers: [AidImporterService, CorrelationService, AasEventsService],
  exports: [AidImporterService, CorrelationService, AasEventsService],
})
export class IngestionModule {}
