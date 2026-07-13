/**
 * OpenTelemetry bootstrap.
 *
 * Activates when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (standard OTEL env).
 * Dependencies loaded lazily — if `@opentelemetry/*` packages aren't installed,
 * logs a warning and the app runs without tracing. Installing:
 *
 *   npm i @opentelemetry/sdk-node \
 *         @opentelemetry/auto-instrumentations-node \
 *         @opentelemetry/exporter-trace-otlp-http
 *
 * Call `initTracing()` BEFORE importing NestFactory so instrumentation hooks
 * can patch modules on require.
 */
import { Logger } from '@nestjs/common'

let started = false

export function initTracing(): void {
  if (started) return
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  if (!endpoint) return
  const logger = new Logger('OTEL')
  try {
    const req = eval('require')
    const { NodeSDK } = req('@opentelemetry/sdk-node')
    const { getNodeAutoInstrumentations } = req('@opentelemetry/auto-instrumentations-node')
    const { OTLPTraceExporter } = req('@opentelemetry/exporter-trace-otlp-http')
    const { Resource } = req('@opentelemetry/resources')
    const { SemanticResourceAttributes } = req('@opentelemetry/semantic-conventions')
    const sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]: process.env.OTEL_SERVICE_NAME ?? 'digital-thread-backend',
        [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version ?? '1.0.0',
        'deployment.environment': process.env.NODE_ENV ?? 'development',
      }),
      traceExporter: new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, '')}/v1/traces` }),
      instrumentations: [getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false }, // too chatty
      })],
    })
    sdk.start()
    started = true
    logger.log(`Tracing enabled — exporter=${endpoint}`)
    const shutdown = async () => {
      try { await sdk.shutdown() } catch {}
    }
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  } catch (e: any) {
    logger.warn(`Tracing requested but not initialised: ${e?.message}. Install @opentelemetry/* packages.`)
  }
}

export function tracingStatus() {
  return {
    enabled: started,
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null,
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'digital-thread-backend',
  }
}
