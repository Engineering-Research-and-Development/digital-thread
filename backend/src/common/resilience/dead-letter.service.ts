import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'

/**
 * DeadLetterService — routes failed ingestion events into a
 * parkable inbox. Reuses `IngestRecord` with `status='ERROR'` rather than
 * creating a second table; `errorMsg` captures the dispatcher's exception.
 */
@Injectable()
export class DeadLetterService {
  constructor(private prisma: PrismaService) {}

  async push(input: { dataSourceId: string; topic?: string; payload: unknown; error: string }) {
    const body = typeof input.payload === 'string' ? input.payload : JSON.stringify(input.payload)
    return this.prisma.ingestRecord.create({
      data: {
        dataSourceId: input.dataSourceId,
        status: 'ERROR',
        resolvedQuery: input.topic,
        bytesIngested: Buffer.byteLength(body),
        payloadPreview: body.slice(0, 512),
        errorMsg: input.error,
      },
    })
  }

  list() {
    return this.prisma.ingestRecord.findMany({ where: { status: 'ERROR' }, orderBy: { receivedAt: 'desc' } })
  }

  purge() {
    return this.prisma.ingestRecord.deleteMany({ where: { status: 'ERROR' } })
  }
}
