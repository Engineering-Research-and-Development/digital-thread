import { Injectable, Logger } from '@nestjs/common'
import { EventEmitter } from 'events'
import { createRedisAdapter, type PubSubAdapter } from './redis-adapter'

export type DtEventType =
  | 'node_status_changed'
  | 'node_log'
  | 'node_progress'
  | 'timeline_event'
  | 'iteration_status'
  | 'file_saved'
  | 'file_enriched'
  | 'ingest_unassigned'
  | 'file_access_requested'
  | 'file_access_decided'

export interface DtEvent {
  type: DtEventType
  iterationId: string
  payload: Record<string, unknown>
}

@Injectable()
export class EventBrokerService {
  private readonly logger = new Logger(EventBrokerService.name)
  private emitter = new EventEmitter()
  private redis: PubSubAdapter | null

  constructor() {
    this.emitter.setMaxListeners(200)
    this.redis = createRedisAdapter(this.logger)
    if (this.redis) this.logger.log('EventBroker using Redis Pub/Sub adapter')
  }

  emit(event: DtEvent) {
    this.emitter.emit(`iter:${event.iterationId}`, event)
    this.emitter.emit('global', event)
    this.redis?.publish(event)
  }

  subscribe(iterationId: string, handler: (event: DtEvent) => void): () => void {
    const key = `iter:${iterationId}`
    this.emitter.on(key, handler)
    return () => this.emitter.off(key, handler)
  }

  subscribeAll(handler: (event: DtEvent) => void): () => void {
    this.emitter.on('global', handler)
    return () => this.emitter.off('global', handler)
  }
}
