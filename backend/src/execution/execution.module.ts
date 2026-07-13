import { Module } from '@nestjs/common'
import { DispatcherService } from './dispatcher.service'
import { ExecutionController } from './execution.controller'
import { IterationsModule } from '@/iterations/iterations.module'

@Module({
  imports: [IterationsModule],
  providers: [DispatcherService],
  controllers: [ExecutionController],
  exports: [DispatcherService],
})
export class ExecutionModule {}
