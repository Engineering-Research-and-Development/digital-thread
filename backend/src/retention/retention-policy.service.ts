import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { IStorageProvider } from '@/files/storage/storage.interface'
import { STORAGE_PROVIDER } from '@/files/storage/storage.tokens'

/**
 * RetentionPolicyService — enforces classification-based data retention.
 *
 * Each classification carries a default retention window (in days):
 *
 *   PUBLIC       — 365 days
 *   INTERNAL     — 730 days
 *   PARTNER      — 1825 days (5y)
 *   CONFIDENTIAL — 2555 days (7y)
 *   RESTRICTED   — 3650 days (10y — default aerospace floor)
 *
 * Envs `RETENTION_DAYS_<LEVEL>` override the defaults. The scheduler runs
 * nightly (interval via `RETENTION_SWEEP_MS`, default 24h) and deletes files
 * older than their window. Audit events (`TimelineEvent`, `LoginAuditLog`)
 * are NEVER auto-deleted — they require an explicit approval flow.
 */
@Injectable()
export class RetentionPolicyService implements OnModuleInit {
  private readonly logger = new Logger(RetentionPolicyService.name)
  private sweepTimer: NodeJS.Timeout | null = null

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: IStorageProvider,
  ) {}

  onModuleInit() {
    if (process.env.RETENTION_ENABLED !== 'true') {
      this.logger.log('Retention sweeps disabled — set RETENTION_ENABLED=true to activate')
      return
    }
    const interval = parseInt(process.env.RETENTION_SWEEP_MS ?? String(24 * 60 * 60 * 1000), 10)
    // First sweep after a short delay to let the app warm up
    this.sweepTimer = setInterval(() => this.sweep().catch((e) => this.logger.warn(`sweep error: ${e?.message}`)), interval)
    setTimeout(() => this.sweep().catch(() => {}), 5_000)
    this.logger.log(`Retention sweeps active every ${Math.round(interval / 60_000)} min`)
  }

  /** Policy in days per classification. */
  policy(): Record<string, number> {
    const base: Record<string, number> = {
      PUBLIC: 365,
      INTERNAL: 730,
      PARTNER: 1825,
      CONFIDENTIAL: 2555,
      RESTRICTED: 3650,
    }
    for (const k of Object.keys(base)) {
      const env = process.env[`RETENTION_DAYS_${k}`]
      if (env && !Number.isNaN(+env)) base[k] = +env
    }
    return base
  }

  /** Runs a single sweep. Returns a summary for admin visibility. */
  async sweep(): Promise<{ checked: number; deleted: number; perClassification: Record<string, number> }> {
    const policy = this.policy()
    const now = Date.now()
    const summary: Record<string, number> = {}
    let deleted = 0
    // Paginate — avoid pulling every row
    let cursorId: string | undefined
    const page = 500
    let checked = 0
    while (true) {
      const batch = await this.prisma.fileRecord.findMany({
        take: page,
        skip: cursorId ? 1 : 0,
        cursor: cursorId ? { id: cursorId } : undefined,
        orderBy: { id: 'asc' },
      })
      if (batch.length === 0) break
      for (const f of batch) {
        checked++
        const days = policy[f.classification] ?? policy.INTERNAL
        const age = (now - f.timestamp.getTime()) / 86_400_000
        if (age <= days) continue
        try {
          await this.storage.delete(f.path)
          await this.prisma.fileRecord.delete({ where: { id: f.id } })
          deleted++
          summary[f.classification] = (summary[f.classification] ?? 0) + 1
        } catch (e: any) {
          this.logger.warn(`Retention delete failed for ${f.path}: ${e?.message}`)
        }
      }
      cursorId = batch[batch.length - 1].id
      if (batch.length < page) break
    }
    this.logger.log(`Retention sweep: checked ${checked}, deleted ${deleted}`)
    return { checked, deleted, perClassification: summary }
  }
}
