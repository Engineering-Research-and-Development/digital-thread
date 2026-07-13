import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { CorrelationService } from './correlation.service'

/**
 * AasEventsService — subscribes to push events from AAS-backed MQTT data sources.
 *
 * Subscribes to AAS Part 2 events on MQTT data sources (BaSyx-style
 * `MqttSubmodelRepositoryFeature`). At module init we scan active
 * PUSH-mode MQTT DataSources and open long-lived subscriptions through
 * the existing MqttAdapter. Each inbound message is handed to
 * `CorrelationService.ingestPushEvent`.
 *
 * The adapter layer here is deliberately lazy — if `mqtt` (package) isn't
 * installed or a DataSource is misconfigured, we log a warning and skip it
 * rather than crash the app.
 */
@Injectable()
export class AasEventsService implements OnModuleInit {
  private readonly logger = new Logger(AasEventsService.name)
  private unsubs: Array<() => void> = []

  constructor(
    private prisma: PrismaService,
    private correlation: CorrelationService,
  ) {}

  async onModuleInit() {
    // Opt-in via env, since we don't want accidental connections in dev.
    if (process.env.AAS_EVENTS_SUBSCRIBE !== 'true') return
    await this.refreshSubscriptions()
  }

  async refreshSubscriptions() {
    for (const u of this.unsubs) try { u() } catch {}
    this.unsubs = []
    const sources = await this.prisma.dataSource.findMany({
      where: { protocol: 'MQTT', accessMode: { in: ['PUSH', 'BOTH'] } },
    })
    for (const ds of sources) {
      try {
        const cfg = ds.protocolConfigJson ? JSON.parse(ds.protocolConfigJson) : {}
        const topics: string[] = cfg.topics ?? []
        if (topics.length === 0) continue
        const { createAdapter } = await import('@/datasources/connectivity/adapter.factory')
        const adapter = createAdapter('MQTT', ds.endpoint, ds.authConfigJson ? JSON.parse(ds.authConfigJson) : null, cfg)
        if (!adapter.subscribe) continue
        const stop = adapter.subscribe([], (msg) => {
          const correlationValue = this.extractCorrelation(msg, cfg.correlation)
          this.correlation
            .ingestPushEvent({
              dataSourceId: ds.id,
              topic: (msg as any).topic ?? topics[0],
              payload: msg,
              correlationValue,
              correlationMetadataKey: cfg.correlation?.matchesMetadataKey ?? 'lotId',
            })
            .catch((e) => this.logger.warn(`ingestPushEvent failed for ${ds.name}: ${e?.message}`))
        })
        this.unsubs.push(stop)
        this.logger.log(`AAS events: subscribed to ${topics.length} topic(s) on ${ds.name}`)
      } catch (e: any) {
        this.logger.warn(`Failed to subscribe to DataSource ${ds.name}: ${e?.message}`)
      }
    }
  }

  private extractCorrelation(msg: any, corrCfg?: { payloadPath?: string; matchesMetadataKey?: string }): string | undefined {
    if (!corrCfg?.payloadPath) return undefined
    const parts = corrCfg.payloadPath.replace(/^\$\.?/, '').split('.')
    let cur: any = msg
    for (const p of parts) {
      if (cur == null) return undefined
      cur = cur[p]
    }
    return cur == null ? undefined : String(cur)
  }
}
