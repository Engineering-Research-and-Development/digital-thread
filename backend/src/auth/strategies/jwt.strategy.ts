import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '@/database/prisma.service'

export interface JwtPayload {
  sub: string
  email: string
  role: string
  partnerId?: string
  jti?: string
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        // Allow token via query param for SSE (EventSource can't set headers)
        (req: any) => req?.query?.token ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('auth.jwtSecret') ?? 'fallback-secret',
      passReqToCallback: false,
    })
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } })
    if (!user || !user.isActive) throw new UnauthorizedException()
    return { id: user.id, email: user.email, role: user.role, partnerId: user.partnerId }
  }
}
