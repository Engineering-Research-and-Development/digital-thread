import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { EventBrokerService } from '@/events/event-broker.service'

/**
 * CorrelationService — matches inbound push events to waiting iterations.
 *
 * Accepts inbound push events (from the MQTT / AAS Events subscriber) and
 * routes them to waiting iterations by matching a payload-extracted key
 * against `iteration.metadata[correlationMetadataKey]` (default: `lotId`).
 *
 * Non-matching events land in an **Unassigned Inbox** — the `IngestRecord`
 * row with `status='UNASSIGNED'`. An admin can later reassign or purge.
 */
@Injectable()
export class CorrelationService {
  private readonly logger = new Logger(CorrelationService.name)

  constructor(
    private prisma: PrismaService,
    private broker: EventBrokerService,
  ) {}

  async ingestPushEvent(input: {
    dataSourceId: string
    topic: string
    payload: any
    correlationValue?: string
    correlationMetadataKey?: string
  }) {
    const key = input.correlationMetadataKey ?? 'lotId'
    const iter = input.correlationValue
      ? await this.findIterationByMetadata(key, input.correlationValue)
      : null

    const payloadStr = typeof input.payload === 'string' ? input.payload : JSON.stringify(input.payload)
    const hash = this.sha256(payloadStr)

    if (!iter) {
      // Unassigned inbox
      const rec = await this.prisma.ingestRecord.create({
        data: {
          dataSourceId: input.dataSourceId,
          status: 'UNASSIGNED',
          payloadHash: hash,
          bytesIngested: Buffer.byteLength(payloadStr),
          resolvedQuery: input.topic,
          payloadPreview: payloadStr.slice(0, 512),
        },
      })
      this.broker.emit({
        type: 'ingest_unassigned' as any,
        iterationId: 'global',
        payload: { ingestId: rec.id, topic: input.topic, key, value: input.correlationValue },
      })
      return { status: 'UNASSIGNED' as const, ingestId: rec.id }
    }

    // Find the awaiting binding (if any) in this iteration.
    const waiting = await this.prisma.ingestRecord.findFirst({
      where: { iterationId: iter.id, dataSourceId: input.dataSourceId, status: 'UNASSIGNED' },
      orderBy: { receivedAt: 'desc' },
    })

    const rec = await this.prisma.ingestRecord.create({
      data: {
        dataSourceId: input.dataSourceId,
        iterationId: iter.id,
        nodeId: waiting?.nodeId,
        inputId: waiting?.inputId,
        status: 'OK',
        payloadHash: hash,
        bytesIngested: Buffer.byteLength(payloadStr),
        resolvedQuery: input.topic,
        payloadPreview: payloadStr.slice(0, 512),
      },
    })

    // Promote the previously-UNASSIGNED subscription to OK.
    if (waiting) {
      await this.prisma.ingestRecord.update({
        where: { id: waiting.id },
        data: { status: 'OK' },
      })
    }
    return { status: 'OK' as const, ingestId: rec.id, iterationId: iter.id }
  }

  async listUnassigned() {
    return this.prisma.ingestRecord.findMany({
      where: { status: 'UNASSIGNED' },
      orderBy: { receivedAt: 'desc' },
    })
  }

  async assignToIteration(ingestId: string, iterationId: string, nodeId?: string, inputId?: string) {
    return this.prisma.ingestRecord.update({
      where: { id: ingestId },
      data: { iterationId, nodeId, inputId, status: 'OK' },
    })
  }

  private async findIterationByMetadata(key: string, value: string) {
    // SQLite JSON1 is available through raw query, but keep it portable:
    const all = await this.prisma.iteration.findMany({ where: { status: 'RUNNING' } })
    return all.find((i) => {
      try { return JSON.parse(i.metadataJson || '{}')[key] === value } catch { return false }
    })
  }

  private sha256(s: string): string {
    const crypto = require('crypto')
    return crypto.createHash('sha256').update(s).digest('hex')
  }
}
