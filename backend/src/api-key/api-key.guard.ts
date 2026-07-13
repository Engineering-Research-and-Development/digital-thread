import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ApiKeyService } from './api-key.service'

/** Header carrying the external API key. */
export const API_KEY_HEADER = 'x-api-key'

/**
 * ApiKeyGuard — authenticates external REST API requests via the
 * `X-API-Key` header instead of a JWT. On success it attaches `request.user`
 * with the SAME shape the JWT strategy produces (`{ id, email, role, partnerId }`),
 * so `@CurrentUser`, `RolesGuard`, `PartnerScopeGuard` and the audit interceptor
 * all work unchanged. External controllers also set `@SetMetadata(IS_PUBLIC_KEY, true)`
 * so the global JwtAuthGuard steps aside and lets this guard run.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private apiKeys: ApiKeyService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const header = req.headers?.[API_KEY_HEADER]
    const token = Array.isArray(header) ? header[0] : header
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException(`Missing ${API_KEY_HEADER} header`)
    }
    const user = await this.apiKeys.resolve(token.trim())
    if (!user) throw new UnauthorizedException('Invalid or revoked API key')
    req.user = user
    return true
  }
}
