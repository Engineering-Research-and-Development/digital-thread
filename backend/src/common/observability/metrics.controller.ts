import { Controller, Get, Res, SetMetadata } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import { IS_PUBLIC_KEY } from '@/auth/guards/jwt-auth.guard'
import { MetricsService } from './metrics.service'

@Controller()
export class MetricsController {
  constructor(private metrics: MetricsService) {}

  @SetMetadata(IS_PUBLIC_KEY, true)
  @Get('metrics')
  serve(@Res() reply: FastifyReply) {
    reply
      .status(200)
      .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(this.metrics.exposition())
  }
}
