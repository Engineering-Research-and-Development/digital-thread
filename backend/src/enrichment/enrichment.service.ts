import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { IStorageProvider } from '@/files/storage/storage.interface'
import { STORAGE_PROVIDER } from '@/files/storage/storage.tokens'
import type { IEnricher } from './enricher.interface'
import { PdfTextEnricher } from './enrichers/pdf-text.enricher'
import { PreviewEnricher } from './enrichers/preview.enricher'
import { CScanHeaderEnricher } from './enrichers/cscan-header.enricher'
import { EventBrokerService } from '@/events/event-broker.service'
import { FilesService } from '@/files/files.service'
import { ROLE, type Role } from '@/auth/roles'

/**
 * EnrichmentService — runs registered `IEnricher` plugins against a FileRecord
 * after it is saved. Writes one `EnrichmentRecord` per (file, enricher, version).
 *
 * The set of enrichers is hard-wired here; a future iteration could add a plugin
 * discovery mechanism. `runAll` is safe to call repeatedly — each
 * (file, enricher, version) row is protected by a unique index.
 */
@Injectable()
export class EnrichmentService implements OnModuleInit {
  private readonly logger = new Logger(EnrichmentService.name)
  private enrichers: IEnricher[] = [
    new PdfTextEnricher(),
    new PreviewEnricher(),
    new CScanHeaderEnricher(),
  ]

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: IStorageProvider,
    private broker: EventBrokerService,
    private files: FilesService,
  ) {}

  onModuleInit() {
    this.broker.subscribeAll((evt) => {
      if (evt.type !== 'file_saved') return
      const fileId = (evt.payload as any)?.fileId as string | undefined
      if (!fileId) return
      this.runAll(fileId).catch((e) => this.logger.warn(`Enrichment dispatch failed for ${fileId}: ${e?.message}`))
    })
  }

  register(enricher: IEnricher) { this.enrichers.push(enricher) }

  async runAll(fileId: string) {
    const file = await this.prisma.fileRecord.findUnique({ where: { id: fileId } })
    if (!file) return { ok: false, reason: 'file not found' }
    const results: Array<{ enricher: string; status: string; ms?: number; error?: string }> = []
    for (const e of this.enrichers) {
      if (!e.canHandle(file)) continue
      const start = Date.now()
      try {
        const data = await e.enrich(file, () => this.storage.readStream(file.path))
        if (data === null) {
          await this.upsertRecord(file.id, e, 'SKIPPED', null, null)
          results.push({ enricher: e.id, status: 'SKIPPED' })
        } else {
          await this.upsertRecord(file.id, e, 'OK', data, null)
          results.push({ enricher: e.id, status: 'OK', ms: Date.now() - start })
        }
      } catch (err: any) {
        await this.upsertRecord(file.id, e, 'ERROR', null, err?.message ?? String(err))
        results.push({ enricher: e.id, status: 'ERROR', error: err?.message })
        this.logger.warn(`Enricher ${e.id} failed for ${file.filename}: ${err?.message}`)
      }
    }
    return { ok: true, results }
  }

  async listForFile(fileId: string, requester?: { id: string; role: Role; partnerId?: string | null }) {
    // An OWNER may only inspect enrichment for files used in
    // iterations of their own products. Out-of-scope files return an empty set
    // (graceful, never throws). SUPERADMIN and other roles are unfiltered.
    if (requester?.role === ROLE.OWNER) {
      const { fileIds } = await this.files.ownerProductScope(requester.partnerId)
      if (!fileIds.includes(fileId)) return []
    }
    return this.prisma.enrichmentRecord.findMany({
      where: { fileId },
      orderBy: { createdAt: 'desc' },
    })
  }

  private async upsertRecord(fileId: string, e: IEnricher, status: string, data: any, errorMsg: string | null) {
    await this.prisma.enrichmentRecord.upsert({
      where: { fileId_enricherId_enricherVersion: { fileId, enricherId: e.id, enricherVersion: e.version } },
      create: {
        fileId, enricherId: e.id, enricherVersion: e.version,
        status, resultJson: data ? JSON.stringify(data) : null, errorMsg,
      },
      update: {
        status, resultJson: data ? JSON.stringify(data) : null, errorMsg,
      },
    })
  }
}
