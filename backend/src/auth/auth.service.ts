import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '@/database/prisma.service'
import * as bcrypt from 'bcrypt'
import * as crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'

const MAX_FAILED_LOGINS = 10
const LOCKOUT_DURATION_MS = 30 * 60 * 1000 // 30 minutes

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(email: string, password: string, audit?: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { partner: true },
    })

    if (!user) {
      await this.recordLogin(null, email, false, 'INVALID_CREDENTIALS', audit)
      throw new UnauthorizedException('Invalid credentials')
    }
    if (!user.isActive) {
      await this.recordLogin(user.id, email, false, 'INACTIVE', audit)
      throw new UnauthorizedException('Account is disabled')
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.recordLogin(user.id, email, false, 'LOCKED', audit)
      throw new UnauthorizedException(`Account locked until ${user.lockedUntil.toISOString()}`)
    }

    const valid = await bcrypt.compare(password, user.hashedPassword)
    if (!valid) {
      const failed = (user.failedLoginAttempts ?? 0) + 1
      const lockedUntil = failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: failed, lockedUntil },
      })
      await this.recordLogin(user.id, email, false, lockedUntil ? 'LOCKED' : 'INVALID_CREDENTIALS', audit)
      throw new UnauthorizedException('Invalid credentials')
    }

    // Successful login — reset counter, stamp lastLoginAt
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    })
    await this.recordLogin(user.id, email, true, 'OK', audit)

    const tokens = await this.generateTokens(user)
    return {
      ...tokens,
      user: this.sanitizeUser(user),
    }
  }

  async refresh(rawRefreshToken: string) {
    const hash = this.hashToken(rawRefreshToken)
    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: hash, revoked: false },
      include: { user: true },
    })
    if (!record || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token invalid or expired')
    }

    // Rotate: revoke old, issue new
    await this.prisma.refreshToken.update({ where: { id: record.id }, data: { revoked: true } })

    const tokens = await this.generateTokens(record.user)
    return tokens
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    })
    return { ok: true }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { partner: true },
    })
    if (!user) throw new UnauthorizedException()
    return this.sanitizeUser(user)
  }

  private async generateTokens(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      partnerId: user.partnerId ?? null,
      jti: uuidv4(),
    }

    const accessToken = this.jwtService.sign(payload)

    const rawRefreshToken = uuidv4()
    const expiresDays = this.config.get<number>('auth.refreshTokenExpiresDays') ?? 7
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: this.hashToken(rawRefreshToken),
        expiresAt,
      },
    })

    return { access_token: accessToken, refresh_token: rawRefreshToken }
  }

  private hashToken(raw: string) {
    return crypto.createHash('sha256').update(raw).digest('hex')
  }

  private sanitizeUser(user: any) {
    const { hashedPassword, failedLoginAttempts, lockedUntil, ...safe } = user
    return safe
  }

  private async recordLogin(
    userId: string | null,
    email: string,
    success: boolean,
    reason: 'INVALID_CREDENTIALS' | 'LOCKED' | 'INACTIVE' | 'OK',
    audit?: { ip?: string; userAgent?: string },
  ) {
    await this.prisma.loginAuditLog.create({
      data: {
        userId: userId ?? undefined,
        email,
        success,
        reason,
        ip: audit?.ip,
        userAgent: audit?.userAgent,
      },
    })
  }
}
