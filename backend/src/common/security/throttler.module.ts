import { Module } from '@nestjs/common'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { APP_GUARD } from '@nestjs/core'

/**
 * Global rate limiting, applied app-wide as a guard.
 *
 * Defaults — overridable via env (THROTTLE_TTL_S, THROTTLE_LIMIT):
 *   - 60 requests / 60 seconds per IP across the API
 *   - Login endpoint enforces an additional 5/15min via per-route override (see AuthController).
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'global',
        ttl: parseInt(process.env.THROTTLE_TTL_S ?? '60', 10) * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT ?? '120', 10),
      },
    ]),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppThrottlerModule {}
