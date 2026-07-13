import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { SecretsService } from '@/common/security/secrets.service'

/** Structured SMTP settings persisted (encrypted) under AppConfig key 'smtp'. */
export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  username?: string
  password?: string
  fromAddress: string
  fromName?: string
}

/** SMTP config as returned to the client — password is never echoed. */
export interface SmtpConfigPublic extends Omit<SmtpConfig, 'password'> {
  hasPassword: boolean
  source: 'db' | 'env' | 'none'
}

const SMTP_KEY = 'smtp'

/**
 * Generic runtime-editable platform settings. Values are stored as
 * JSON in the `AppConfig` table; secret values are encrypted at rest via
 * SecretsService (same AES-256-GCM envelope used for DataSource credentials).
 *
 * First consumer: SUPERADMIN-editable SMTP credentials, which override the
 * legacy `SMTP_URL` env var.
 */
@Injectable()
export class AppConfigService {
  private readonly logger = new Logger(AppConfigService.name)

  constructor(
    private prisma: PrismaService,
    private secrets: SecretsService,
  ) {}

  /** Read + decrypt a config value. Returns null if absent. */
  async get<T = any>(key: string): Promise<T | null> {
    const row = await this.prisma.appConfig.findUnique({ where: { key } })
    if (!row) return null
    const raw = row.encrypted ? this.secrets.decrypt(row.valueJson) : row.valueJson
    try {
      return JSON.parse(raw) as T
    } catch {
      return null
    }
  }

  /** Upsert a config value (optionally encrypted). */
  async set(key: string, value: unknown, opts: { encrypted?: boolean; userId?: string } = {}) {
    const json = JSON.stringify(value)
    const stored = opts.encrypted ? this.secrets.encrypt(json) : json
    // AppConfig has no append-only trigger — a plain upsert is safe here.
    await this.prisma.appConfig.upsert({
      where: { key },
      create: { key, valueJson: stored, encrypted: !!opts.encrypted, updatedById: opts.userId ?? null },
      update: { valueJson: stored, encrypted: !!opts.encrypted, updatedById: opts.userId ?? null },
    })
  }

  // ─── SMTP helpers ─────────────────────────────────────────────────────────

  /** Raw SMTP config (with password) — internal use for building the transport. */
  async getSmtpRaw(): Promise<SmtpConfig | null> {
    return this.get<SmtpConfig>(SMTP_KEY)
  }

  /** SMTP config for the client: password redacted, with the active source. */
  async getSmtpPublic(): Promise<SmtpConfigPublic | null> {
    const cfg = await this.getSmtpRaw()
    if (cfg) {
      const { password, ...rest } = cfg
      return { ...rest, hasPassword: !!password, source: 'db' }
    }
    if (process.env.SMTP_URL) {
      // Surface the env fallback so the admin understands where mail comes from.
      return {
        host: this.maskUrlHost(process.env.SMTP_URL),
        port: 0,
        secure: false,
        fromAddress: process.env.SMTP_FROM ?? 'noreply@digital-thread.local',
        hasPassword: true,
        source: 'env',
      }
    }
    return null
  }

  /**
   * Save SMTP config. If `password` is omitted/empty the previously-stored
   * password is preserved (so the admin can edit other fields without
   * re-typing the secret).
   */
  async setSmtp(input: Partial<SmtpConfig>, userId?: string): Promise<SmtpConfigPublic> {
    const existing = await this.getSmtpRaw()
    const merged: SmtpConfig = {
      host: input.host ?? existing?.host ?? '',
      port: input.port ?? existing?.port ?? 587,
      secure: input.secure ?? existing?.secure ?? false,
      username: input.username ?? existing?.username,
      password: input.password && input.password.length > 0 ? input.password : existing?.password,
      fromAddress: input.fromAddress ?? existing?.fromAddress ?? 'noreply@digital-thread.local',
      fromName: input.fromName ?? existing?.fromName,
    }
    await this.set(SMTP_KEY, merged, { encrypted: true, userId })
    const { password, ...rest } = merged
    return { ...rest, hasPassword: !!password, source: 'db' }
  }

  private maskUrlHost(url: string): string {
    try {
      const u = new URL(url)
      return `${u.protocol}//${u.hostname}:${u.port || ''}`
    } catch {
      return 'configured via SMTP_URL'
    }
  }
}
