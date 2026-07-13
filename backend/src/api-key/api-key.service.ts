import { Injectable, Logger } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '@/database/prisma.service'
import { ROLE, type Role } from '@/auth/roles'

/** Roles allowed to hold an external API key. */
export const API_KEY_ROLES: Role[] = [ROLE.OPERATOR, ROLE.OWNER]

export interface ApiKeyMeta {
  exists: boolean
  prefix?: string
  createdAt?: Date
  lastUsedAt?: Date | null
}

export interface ResolvedApiKeyUser {
  id: string
  email: string
  role: Role
  partnerId?: string | null
}

/**
 * ApiKeyService — issues and resolves per-user opaque API keys for
 * the external REST API (`/api/v1/ext`). Only the SHA-256 hash is persisted
 * (mirrors AuthService.hashToken for refresh tokens); the plaintext token is
 * returned exactly once at generation. One active key per user.
 */
@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name)

  constructor(private prisma: PrismaService) {}

  private hash(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex')
  }

  /**
   * (Re)generate the caller's API key. Replaces any existing key (rotation).
   * Returns the plaintext token ONCE — it is never retrievable afterwards.
   */
  async issue(userId: string): Promise<{ token: string; prefix: string }> {
    const token = `dt_${crypto.randomBytes(24).toString('hex')}`
    const prefix = `${token.slice(0, 9)}…`
    const keyHash = this.hash(token)
    // Upsert by the unique userId → regenerate replaces the previous key.
    await this.prisma.apiKey.upsert({
      where: { userId },
      create: { userId, keyHash, prefix },
      update: { keyHash, prefix, lastUsedAt: null, createdAt: new Date() },
    })
    return { token, prefix }
  }

  async revoke(userId: string): Promise<void> {
    await this.prisma.apiKey.deleteMany({ where: { userId } })
  }

  async getMeta(userId: string): Promise<ApiKeyMeta> {
    const row = await this.prisma.apiKey.findUnique({ where: { userId } })
    if (!row) return { exists: false }
    return { exists: true, prefix: row.prefix, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt }
  }

  /**
   * Resolve a presented token to its owning user. Returns null when the token
   * is unknown, the user is inactive, or the role is not allowed to use the
   * external API. Bumps `lastUsedAt` best-effort (never blocks the request).
   */
  async resolve(token: string): Promise<ResolvedApiKeyUser | null> {
    if (!token || !token.startsWith('dt_')) return null
    const row = await this.prisma.apiKey.findUnique({
      where: { keyHash: this.hash(token) },
      include: { user: true },
    })
    if (!row || !row.user || !row.user.isActive) return null
    const role = row.user.role as Role
    if (!API_KEY_ROLES.includes(role)) return null

    this.prisma.apiKey
      .update({ where: { userId: row.userId }, data: { lastUsedAt: new Date() } })
      .catch((e) => this.logger.warn(`lastUsedAt bump failed: ${e?.message}`))

    return { id: row.user.id, email: row.user.email, role, partnerId: row.user.partnerId }
  }
}
