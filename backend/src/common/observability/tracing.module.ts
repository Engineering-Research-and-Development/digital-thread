import { Module } from '@nestjs/common'
import { TracingController } from './tracing.controller'

@Module({ controllers: [TracingController] })
export class TracingModule {}
