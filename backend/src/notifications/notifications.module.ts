import { Module } from '@nestjs/common'
import { EventsModule } from '@/events/events.module'
import { FilesModule } from '@/files/files.module'
import { NotificationsController } from './notifications.controller'
import { NotificationsService } from './notifications.service'
import { AppConfigService } from './app-config.service'

@Module({
  // EventsModule → EventBrokerService; FilesModule → FilesService.canRead for
  // permission-filtered file payloads. PrismaService (PrismaModule) and
  // SecretsService (SecurityModule) are provided globally.
  imports: [EventsModule, FilesModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, AppConfigService],
  exports: [NotificationsService, AppConfigService],
})
export class NotificationsModule {}
