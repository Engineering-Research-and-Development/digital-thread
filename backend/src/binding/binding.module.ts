import { Module } from '@nestjs/common'
import { BindingController } from './binding.controller'
import { BindingService } from './binding.service'
import { BindingRuntimeService } from './binding-runtime.service'
import { TemplateResolverService } from './template-resolver.service'
import { DataSourcesModule } from '@/datasources/datasources.module'

@Module({
  imports: [DataSourcesModule],
  controllers: [BindingController],
  providers: [BindingService, BindingRuntimeService, TemplateResolverService],
  exports: [BindingService, BindingRuntimeService, TemplateResolverService],
})
export class BindingModule {}
