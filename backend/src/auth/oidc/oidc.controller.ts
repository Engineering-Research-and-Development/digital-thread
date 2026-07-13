import { Controller, Get, Post, Query, Res, SetMetadata } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import type { FastifyReply } from 'fastify'
import { IS_PUBLIC_KEY } from '@/auth/guards/jwt-auth.guard'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { OidcService } from './oidc.service'

@ApiTags('auth-oidc')
@Controller('auth/oidc')
export class OidcController {
  constructor(private oidc: OidcService) {}

  @SetMetadata(IS_PUBLIC_KEY, true)
  @Get('config')
  config() { return this.oidc.publicConfig() }

  @SetMetadata(IS_PUBLIC_KEY, true)
  @Get('login')
  async login(@Res() reply: FastifyReply) {
    const { url } = await this.oidc.authorizeUrl()
    reply.redirect(url, 302)
  }

  @SetMetadata(IS_PUBLIC_KEY, true)
  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string | undefined,
    @Res() reply: FastifyReply,
  ) {
    if (error) {
      reply.redirect(`/login?oidc_error=${encodeURIComponent(error)}`, 302)
      return
    }
    const session = await this.oidc.handleCallback({ code, state })
    // Hand tokens back to the SPA via fragment — avoids logging them in server/proxy access logs.
    const fragment = new URLSearchParams({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }).toString()
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'
    reply.redirect(`${frontendUrl}/oidc/complete#${fragment}`, 302)
  }

  // Authenticated on purpose (global JwtAuthGuard) — revokes the DT session and
  // returns the IdP end_session URL for the SPA to navigate to (RP-initiated
  // single logout). The frontend only calls this for federated sessions.
  @Post('logout')
  logout(@CurrentUser() user: { id: string }) {
    return this.oidc.buildLogout(user.id)
  }
}
