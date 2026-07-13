import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '@/database/prisma.service'
import * as crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import type { Role } from '@/auth/roles'
import { ROLE } from '@/auth/roles'

interface DiscoveryDoc {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint?: string
  jwks_uri?: string
  end_session_endpoint?: string
  id_token_signing_alg_values_supported?: string[]
}

interface TokenResponse {
  id_token: string
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in?: number
}

interface RoleMapping { claim: string; mapping: Record<string, Role> }

/**
 * OidcService — federated identity provider integration.
 *
 * Acts as an OIDC Relying Party against an external IAM (Keycloak / generic
 * OIDC provider). Flow:
 *
 *   1. GET /auth/oidc/login       → 302 to IdP authorize endpoint with PKCE
 *   2. IdP → /auth/oidc/callback  → exchange `code` for tokens, validate id_token
 *   3. Upsert local User row, map claims → Role, mint DT access + refresh JWT
 *
 * Deliberately dep-free — uses `fetch` + node:crypto for JWK verification in a
 * later iteration. For now, we trust the id_token payload (signature check is a
 * TODO flagged in the controller response). Production deploy sets JWKS via env.
 */
@Injectable()
export class OidcService implements OnModuleInit {
  private readonly logger = new Logger(OidcService.name)
  private discovery: DiscoveryDoc | null = null
  private stateCache = new Map<string, { codeVerifier: string; createdAt: number }>()
  // Raw IdP id_token kept per user id, used as `id_token_hint` for RP-initiated
  // logout (so the IdP can end the session without a confirmation screen).
  // In-memory & single-instance — same posture/caveat as `stateCache`; lost on
  // restart, in which case logout falls back to a no-hint end_session redirect.
  private idTokenByUser = new Map<string, string>()

  constructor(
    private config: ConfigService,
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  async onModuleInit() {
    if (!this.enabled()) return
    try {
      await this.refreshDiscovery()
      this.logger.log(`OIDC ready — issuer=${this.discovery?.issuer}`)
    } catch (e: any) {
      this.logger.warn(`OIDC discovery failed: ${e?.message}. Login will retry lazily.`)
    }
  }

  enabled(): boolean {
    return !!(process.env.OIDC_ISSUER_URL && process.env.OIDC_CLIENT_ID)
  }

  /** Returns the IdP authorize URL with PKCE + state. */
  async authorizeUrl(): Promise<{ url: string; state: string }> {
    if (!this.enabled()) throw new UnauthorizedException('OIDC not configured')
    const d = await this.getDiscovery()
    const clientId = process.env.OIDC_CLIENT_ID!
    const redirect = this.redirectUri()
    const state = crypto.randomBytes(16).toString('hex')
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
    this.stateCache.set(state, { codeVerifier, createdAt: Date.now() })
    this.prune()
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      scope: process.env.OIDC_SCOPE ?? 'openid email profile',
      redirect_uri: redirect,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })
    return { url: `${d.authorization_endpoint}?${params.toString()}`, state }
  }

  /** Handles the IdP callback — exchanges code for tokens + mints DT session. */
  async handleCallback(input: { code: string; state: string }) {
    const entry = this.stateCache.get(input.state)
    if (!entry) throw new UnauthorizedException('Invalid OIDC state')
    this.stateCache.delete(input.state)
    const d = await this.getDiscovery()
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: this.redirectUri(),
      client_id: process.env.OIDC_CLIENT_ID!,
      code_verifier: entry.codeVerifier,
    })
    if (process.env.OIDC_CLIENT_SECRET) body.set('client_secret', process.env.OIDC_CLIENT_SECRET)
    const tokenRes = await fetch(d.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    })
    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      this.logger.warn(`OIDC token exchange failed: ${tokenRes.status} ${err}`)
      throw new UnauthorizedException('OIDC token exchange failed')
    }
    const tokens = (await tokenRes.json()) as TokenResponse
    const claims = this.parseIdToken(tokens.id_token)

    // Optional extra claims via userinfo
    let userinfo: Record<string, any> | null = null
    if (d.userinfo_endpoint) {
      try {
        const ui = await fetch(d.userinfo_endpoint, { headers: { Authorization: `Bearer ${tokens.access_token}` } })
        if (ui.ok) userinfo = await ui.json()
      } catch {}
    }
    const merged = { ...claims, ...(userinfo ?? {}) }

    const user = await this.upsertUser(merged)
    // Remember the raw id_token for a later RP-initiated logout (id_token_hint).
    if (tokens.id_token) this.idTokenByUser.set(user.id, tokens.id_token)
    const dtTokens = await this.mintDtSession(user)
    return { user, ...dtTokens }
  }

  /**
   * RP-initiated logout (OIDC end_session). Revokes the user's DT refresh tokens
   * and returns the IdP end_session URL (with `id_token_hint` when we still hold
   * it) for the SPA to navigate to; the IdP then clears its SSO session and
   * redirects back to `${FRONTEND_URL}/login` — which MUST be registered as a
   * post-logout redirect URI on the provider. Falls back to the local /login URL
   * when OIDC is disabled or the provider advertises no end_session_endpoint.
   */
  async buildLogout(userId: string): Promise<{ url: string }> {
    // Always end the local DT session first (idempotent).
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    })
    const postLogout = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/login`
    if (!this.enabled()) return { url: postLogout }
    let d: DiscoveryDoc
    try {
      d = await this.getDiscovery()
    } catch {
      return { url: postLogout }
    }
    const idToken = this.idTokenByUser.get(userId)
    this.idTokenByUser.delete(userId)
    if (!d.end_session_endpoint) return { url: postLogout }
    const params = new URLSearchParams({
      post_logout_redirect_uri: postLogout,
      client_id: process.env.OIDC_CLIENT_ID!,
    })
    if (idToken) params.set('id_token_hint', idToken)
    return { url: `${d.end_session_endpoint}?${params.toString()}` }
  }

  /** Public metadata for the frontend (used by the Login page to render the button). */
  publicConfig() {
    return {
      enabled: this.enabled(),
      loginUrl: this.enabled() ? '/api/v1/auth/oidc/login' : null,
      providerLabel: process.env.OIDC_PROVIDER_LABEL ?? 'SLICES IAM',
    }
  }

  // ──────────────────────────────────────────────────────────────────────────

  private async refreshDiscovery() {
    const issuer = process.env.OIDC_ISSUER_URL!.replace(/\/$/, '')
    const res = await fetch(`${issuer}/.well-known/openid-configuration`)
    if (!res.ok) throw new Error(`OIDC discovery HTTP ${res.status}`)
    this.discovery = (await res.json()) as DiscoveryDoc
  }

  private async getDiscovery(): Promise<DiscoveryDoc> {
    if (!this.discovery) await this.refreshDiscovery()
    return this.discovery!
  }

  private redirectUri(): string {
    return process.env.OIDC_REDIRECT_URI ?? 'http://localhost:3000/api/v1/auth/oidc/callback'
  }

  private parseIdToken(idToken: string): Record<string, any> {
    const parts = idToken.split('.')
    if (parts.length !== 3) throw new UnauthorizedException('Malformed id_token')
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return payload
  }

  private async upsertUser(claims: Record<string, any>) {
    const email = claims.email ?? claims.preferred_username
    if (!email) throw new UnauthorizedException('id_token missing email')
    const role = this.mapRole(claims)
    const partnerId = await this.mapPartner(claims)
    // Uphold the same role↔partner invariant the local UsersService
    // enforces: OWNER and OPERATOR are partner-scoped and MUST map to a Partner.
    // The federation path bypasses validateRolePartner, so guard it here to
    // avoid minting a half-broken partner-less OWNER/OPERATOR session.
    if ((role === ROLE.OWNER || role === ROLE.OPERATOR) && !partnerId) {
      throw new UnauthorizedException(
        `Federated ${role} login could not be mapped to a known partner — set the partner claim / OIDC_* mapping.`,
      )
    }
    const user = await this.prisma.user.upsert({
      where: { email },
      create: {
        id: uuidv4(),
        email,
        hashedPassword: '$2b$10$oidc-federated-no-local-password-0000000000000000000000000',
        fullName: claims.name ?? claims.given_name ?? email,
        role,
        partnerId,
      },
      update: {
        fullName: claims.name ?? claims.given_name ?? email,
        role,
        partnerId: partnerId ?? null,
        lastLoginAt: new Date(),
      },
      include: { partner: true },
    })
    await this.prisma.loginAuditLog.create({
      data: { userId: user.id, email, success: true, reason: 'OK' },
    })
    return user
  }

  private mapRole(claims: Record<string, any>): Role {
    const raw = process.env.OIDC_ROLE_MAPPING
    const claimName = process.env.OIDC_ROLE_CLAIM ?? 'roles'
    // Supported shapes:
    //   roles array: ["dt-superadmin","dt-owner"]
    //   nested object: realm_access.roles
    let values: string[] = []
    const src = claimName.split('.').reduce<any>((acc, k) => acc?.[k], claims)
    if (Array.isArray(src)) values = src.map(String)
    else if (typeof src === 'string') values = [src]

    // Default IdP-group → role mapping. `dt-operator` was renamed from the
    // legacy `dt-partner` group; both are accepted so existing
    // IdP configs keep working, and admins can still override via OIDC_ROLE_MAPPING.
    let mapping: RoleMapping['mapping'] = {
      'dt-superadmin': ROLE.SUPERADMIN,
      'dt-owner': ROLE.OWNER,
      'dt-operator': ROLE.OPERATOR,
      'dt-partner': ROLE.OPERATOR, // legacy alias
    }
    if (raw) {
      try { mapping = { ...mapping, ...JSON.parse(raw) } } catch {}
    }
    for (const v of values) if (mapping[v]) return mapping[v]
    // Default fallback — safest is the least-privileged OPERATOR.
    return ROLE.OPERATOR
  }

  private async mapPartner(claims: Record<string, any>): Promise<string | null> {
    const claimName = process.env.OIDC_PARTNER_CLAIM ?? 'partner'
    const partnerRef = claims[claimName]
    if (!partnerRef) return null
    const partner = await this.prisma.partner.findFirst({
      where: { OR: [{ id: partnerRef }, { name: partnerRef }] },
    })
    return partner?.id ?? null
  }

  private async mintDtSession(user: any) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      partnerId: user.partnerId ?? null,
      jti: uuidv4(),
      iss: 'dt-oidc',
    }
    const accessToken = this.jwt.sign(payload)
    const rawRefreshToken = uuidv4()
    const expiresDays = this.config.get<number>('auth.refreshTokenExpiresDays') ?? 7
    const expiresAt = new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: crypto.createHash('sha256').update(rawRefreshToken).digest('hex'),
        expiresAt,
      },
    })
    return { access_token: accessToken, refresh_token: rawRefreshToken }
  }

  /** Drop state entries older than 10 min — they cannot complete the flow anyway. */
  private prune() {
    const cutoff = Date.now() - 10 * 60_000
    for (const [k, v] of this.stateCache) if (v.createdAt < cutoff) this.stateCache.delete(k)
  }
}
