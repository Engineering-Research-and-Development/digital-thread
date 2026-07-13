import { Module } from '@nestjs/common'
import { DataSourcesService } from './datasources.service'
import { DataSourcesController } from './datasources.controller'

@Module({
  providers: [DataSourcesService],
  controllers: [DataSourcesController],
  exports: [DataSourcesService],
})
export class DataSourcesModule {}
