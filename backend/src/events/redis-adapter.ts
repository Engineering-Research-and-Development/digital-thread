/**
 * Redis Pub/Sub adapter for EventBrokerService, used to fan events out across
 * multiple backend instances.
 *
 * Activates when `EVENT_BROKER=redis` and `REDIS_URL` are set. Uses `ioredis`
 * if installed; otherwise logs a warning and falls back to the in-memory
 * emitter — so the app never crashes on a missing optional dep.
 */
import { Logger } from '@nestjs/common'
import type { DtEvent } from './event-broker.service'

export interface PubSubAdapter {
  publish(event: DtEvent): void
  subscribe(channel: string, handler: (event: DtEvent) => void): () => void
}

export function createRedisAdapter(logger: Logger): PubSubAdapter | null {
  if (process.env.EVENT_BROKER !== 'redis' || !process.env.REDIS_URL) return null
  try {
    const req = eval('require')
    const Redis = req('ioredis')
    const pub = new Redis(process.env.REDIS_URL)
    const sub = new Redis(process.env.REDIS_URL)
    const handlers = new Map<string, Set<(e: DtEvent) => void>>()
    sub.on('message', (channel: string, payload: string) => {
      try {
        const evt = JSON.parse(payload) as DtEvent
        handlers.get(channel)?.forEach((h) => h(evt))
      } catch {}
    })
    return {
      publish(event) { pub.publish(`iter:${event.iterationId}`, JSON.stringify(event)) },
      subscribe(channel, handler) {
        const set = handlers.get(channel) ?? new Set()
        if (set.size === 0) sub.subscribe(channel)
        set.add(handler)
        handlers.set(channel, set)
        return () => { set.delete(handler); if (set.size === 0) sub.unsubscribe(channel) }
      },
    }
  } catch (e: any) {
    logger.warn(`Redis adapter requested but ioredis unavailable: ${e?.message}`)
    return null
  }
}
