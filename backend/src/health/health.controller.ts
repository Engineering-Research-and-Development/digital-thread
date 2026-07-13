import { Controller, Get, SetMetadata, ServiceUnavailableException } from '@nestjs/common'
import { ApiTags, ApiOperation } from '@nestjs/swagger'
import { PrismaService } from '@/database/prisma.service'
import { IS_PUBLIC_KEY } from '@/auth/guards/jwt-auth.guard'

@ApiTags('health')
@Controller()
export class HealthController {
  private readonly bootedAt = Date.now()

  constructor(private prisma: PrismaService) {}

  @SetMetadata(IS_PUBLIC_KEY, true)
  @Get('health')
  @ApiOperation({ summary: 'Liveness probe — process is up' })
  liveness() {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.bootedAt) / 1000),
      version: process.env.npm_package_version ?? '1.0.0',
      timestamp: new Date().toISOString(),
    }
  }

  @SetMetadata(IS_PUBLIC_KEY, true)
  @Get('readiness')
  @ApiOperation({ summary: 'Readiness probe — DB reachable' })
  async readiness() {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1')
      return { status: 'ready', db: 'ok', timestamp: new Date().toISOString() }
    } catch (e: any) {
      throw new ServiceUnavailableException({
        status: 'not-ready',
        db: 'unreachable',
        error: e?.message ?? 'unknown',
      })
    }
  }
}
