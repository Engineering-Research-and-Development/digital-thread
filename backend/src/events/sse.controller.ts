import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { EventBrokerService } from './event-broker.service'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'

@UseGuards(JwtAuthGuard)
@Controller('sse')
export class SseController {
  constructor(private broker: EventBrokerService) {}

  @Get('iterations/:id/events')
  stream(@Param('id') id: string, @Res() reply: FastifyReply) {
    reply.raw.setHeader('Content-Type', 'text/event-stream')
    reply.raw.setHeader('Cache-Control', 'no-cache')
    reply.raw.setHeader('Connection', 'keep-alive')
    reply.raw.flushHeaders?.()

    const send = (data: object) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`)
    }

    const unsub = this.broker.subscribe(id, (event) => send(event))

    // Keepalive every 25s
    const keepalive = setInterval(() => reply.raw.write(': ping\n\n'), 25_000)

    reply.raw.on('close', () => {
      unsub()
      clearInterval(keepalive)
    })
  }
}
