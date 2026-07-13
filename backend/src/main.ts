// OpenTelemetry must initialise BEFORE any other imports for instrumentation
// patches to take effect.
import { initTracing } from './common/observability/tracing'
initTracing()

import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { ValidationPipe, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'
import { ExtApiModule } from './ext-api/ext-api.module'
import { AllExceptionsFilter } from './common/filters/http-exception.filter'

// ── Last-resort process safety net ──────────────────────────────────────────
// The correct fix for any specific failure is per-source error handling (e.g.
// download streams attach an 'error' listener). But a single stray unhandled
// error (an EventEmitter 'error' with no listener, a floating promise
// rejection) must NEVER hard-kill the server. These handlers log the error with
// full stack so it stays diagnosable, and keep the process serving. Placed
// before bootstrap so they cover startup too.
const safetyLog = new Logger('ProcessSafetyNet')
process.on('uncaughtException', (err, origin) => {
  safetyLog.error(`Uncaught exception (${origin}) — process kept alive: ${err?.stack ?? err}`)
})
process.on('unhandledRejection', (reason) => {
  const r = reason as { stack?: string }
  safetyLog.error(`Unhandled promise rejection — process kept alive: ${r?.stack ?? reason}`)
})

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({
      logger: {
        level: process.env.LOG_LEVEL ?? 'info',
        // pino structured JSON; in dev a pretty transport may be added externally
      },
      bodyLimit: 50 * 1024 * 1024, // 50 MB — supports base64 file upload
      trustProxy: true,
    }),
  )

  const config = app.get(ConfigService)
  const corsOrigin = config.get<string>('corsOrigin') ?? 'http://localhost:5173'
  const port = config.get<number>('port') ?? 3000

  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  })

  app.setGlobalPrefix('api/v1', { exclude: ['health', 'readiness'] })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: false,
      transform: true,
    }),
  )

  app.useGlobalFilters(new AllExceptionsFilter())

  // OpenAPI / Swagger — full internal API (JWT)
  // NOTE: the documented operation paths already carry the global `api/v1`
  // prefix, so we do NOT also declare a `/api/v1` server — doing both makes
  // Swagger "Try it out" double the prefix (`/api/v1/api/v1/...`). Default
  // server = the current origin.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Digital Thread API')
    .setDescription('Digital Thread platform — REST API')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'jwt')
    .build()
  const document = SwaggerModule.createDocument(app, swaggerConfig)
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  })

  // Dedicated external API doc — only the API-key-authenticated
  // `/api/v1/ext` surface, secured by the `X-API-Key` header. Linked from the
  // user's Profile page.
  const extConfig = new DocumentBuilder()
    .setTitle('Digital Thread — External API')
    .setDescription(
      'API-key-authenticated REST API for OPERATOR/OWNER systems to drive their iterations. ' +
        'Authenticate every request with the `X-API-Key` header (generate the key in your Profile). ' +
        'All endpoints are scoped to your partner permissions.',
    )
    .setVersion('1.0.0')
    .addApiKey({ type: 'apiKey', in: 'header', name: 'X-API-Key' }, 'apiKey')
    .build()
  const extDocument = SwaggerModule.createDocument(app, extConfig, { include: [ExtApiModule] })
  SwaggerModule.setup('docs/ext', app, extDocument, {
    swaggerOptions: { persistAuthorization: true },
  })

  app.enableShutdownHooks()

  await app.listen(port, '0.0.0.0')
  const log = new Logger('Bootstrap')
  log.log(`Digital Thread Backend listening on http://localhost:${port}`)
  log.log(`API base:    http://localhost:${port}/api/v1`)
  log.log(`OpenAPI:     http://localhost:${port}/docs`)
  log.log(`External API:http://localhost:${port}/docs/ext`)
  log.log(`Health:      http://localhost:${port}/health`)
  log.log(`Readiness:   http://localhost:${port}/readiness`)
  log.log(`CORS origin: ${corsOrigin}`)
  log.log(`Storage:     ${config.get<string>('storage.provider') ?? 'fs'}`)
  log.log(`DB:          ${config.get<string>('database.provider') ?? 'sqlite'}`)
}

bootstrap()
