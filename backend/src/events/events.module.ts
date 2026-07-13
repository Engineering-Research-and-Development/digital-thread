import { Module } from '@nestjs/common'
import { EventBrokerService } from './event-broker.service'
import { SseController } from './sse.controller'

@Module({
  providers: [EventBrokerService],
  controllers: [SseController],
  exports: [EventBrokerService],
})
export class EventsModule {}
