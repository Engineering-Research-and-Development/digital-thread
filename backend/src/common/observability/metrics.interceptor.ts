import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { tap } from 'rxjs/operators'
import { MetricsService } from './metrics.service'

/**
 * Request-level metrics interceptor, registered app-wide.
 * Records:
 *   - http_requests_total{method,route,status}
 *   - http_request_duration_ms{method,route}
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private metrics: MetricsService) {}

  intercept(ctx: ExecutionContext, next: CallHandler) {
    const start = Date.now()
    const req = ctx.switchToHttp().getRequest()
    const method = req.method
    const route = (req.routerPath ?? req.url ?? '').split('?')[0]
    return next.handle().pipe(
      tap({
        next: () => {
          const res = ctx.switchToHttp().getResponse()
          const status = res.statusCode ?? 200
          this.metrics.incrementCounter('http_requests_total', { method, route, status })
          this.metrics.observeHistogram('http_request_duration_ms', Date.now() - start, { method, route })
        },
        error: () => {
          this.metrics.incrementCounter('http_requests_total', { method, route, status: 500 })
          this.metrics.observeHistogram('http_request_duration_ms', Date.now() - start, { method, route })
        },
      }),
    )
  }
}
