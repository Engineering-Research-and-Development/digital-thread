import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { tap } from 'rxjs/operators'
import { PrismaService } from '@/database/prisma.service'

/**
 * AdminAuditInterceptor — records every mutating request (POST/PUT/PATCH/DELETE)
 * by users of ANY role as an `AdminAuditLog` row. Captures the user's role at
 * write time so the historical record stays accurate even if the user's role
 * is later changed.
 *
 * Append-only — `AdminAuditLog` rows are protected by SQLite triggers
 * blocking UPDATE/DELETE (see provenance hardening migration).
 *
 * Anonymous requests (no JWT) are not logged here — they are handled by
 * `LoginAuditLog` (auth) and per-route rate limiting.
 */
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const req = ctx.switchToHttp().getRequest()
    const method = req.method as string
    const user = req.user as { id?: string; role?: string } | undefined

    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

    return next.handle().pipe(
      tap(async () => {
        if (!isMutation || !user?.id) return
        const targetType = (req.params?.['kind'] as string) ?? this.deriveTargetType(req.url)
        const targetId = req.params?.id ?? null
        const action = `${method} ${this.scrubUrl(req.url)}`
        try {
          await this.prisma.adminAuditLog.create({
            data: {
              actorUserId: user.id,
              actorRole: user.role ?? null,
              action,
              targetType,
              targetId,
              ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip,
              detail: req.body ? JSON.stringify(this.scrubBody(req.body)).slice(0, 4000) : null,
            },
          })
        } catch {
          // never block the request because audit failed
        }
      }),
    )
  }

  private deriveTargetType(url?: string): string {
    if (!url) return 'unknown'
    const seg = url.split('?')[0].split('/').filter(Boolean)
    // skip "api","v1" if present
    return seg.find((s) => !['api', 'v1'].includes(s)) ?? 'unknown'
  }

  private scrubUrl(url?: string): string {
    if (!url) return ''
    return url.split('?')[0].replace(/[a-f0-9-]{8,}/gi, ':id')
  }

  private scrubBody(body: any): any {
    if (!body || typeof body !== 'object') return body
    const clone: any = Array.isArray(body) ? [...body] : { ...body }
    for (const k of ['password', 'newPassword', 'authConfigJson', 'token', 'refresh_token', 'access_token']) {
      if (k in clone) clone[k] = '***'
    }
    return clone
  }
}
