/**
 * Sparkplug B 3.0 payload decoder.
 *
 * The Eclipse Tahu wire format is protobuf; for zero-dependency parsing we
 * only decode the minimum shape needed by the DT correlation layer:
 *   - NBIRTH / DBIRTH — extract metric aliases + names
 *   - NDATA / DDATA   — apply aliases to shrink payloads
 *   - NDEATH / DDEATH — treated as offline signals
 *
 * Partners shipping full protobuf payloads should install `sparkplug-payload`
 * and register it via `MqttAdapter.setPayloadDecoder()`. Without that, the
 * function here accepts already-JSON-decoded payloads (common with BaSyx-style
 * MQTT bridges) and simply applies alias resolution.
 */
export type SparkplugMetric = { name?: string; alias?: number; value: unknown; type?: string; timestamp?: number }
export interface SparkplugPayload {
  timestamp?: number
  seq?: number
  metrics: SparkplugMetric[]
}

export interface SparkplugTopicParts {
  namespace: string    // 'spBv1.0'
  groupId: string
  messageType: 'NBIRTH' | 'DBIRTH' | 'NDATA' | 'DDATA' | 'NDEATH' | 'DDEATH' | 'NCMD' | 'DCMD' | 'STATE'
  eonId: string
  deviceId?: string
}

export function parseTopic(topic: string): SparkplugTopicParts | null {
  const parts = topic.split('/')
  if (parts.length < 4) return null
  const [namespace, groupId, messageType, eonId, deviceId] = parts
  if (!namespace.startsWith('spBv1')) return null
  return { namespace, groupId, messageType: messageType as any, eonId, deviceId }
}

/**
 * Returns a correlation key (eonId or deviceId) that the DT matches against
 * `iteration.metadata.lotId` (or configurable `correlationMetadataKey`).
 */
export function correlationKey(topic: SparkplugTopicParts): string {
  return topic.deviceId ?? topic.eonId
}

/**
 * Resolves metric aliases. In Sparkplug B, only NBIRTH/DBIRTH carry human-readable
 * names; subsequent NDATA/DDATA rely on aliases. The state argument tracks the
 * alias→name map per (groupId, eonId[, deviceId]).
 */
export type AliasState = Map<string, Map<number, string>>

export function keyOf(t: SparkplugTopicParts): string {
  return `${t.groupId}/${t.eonId}${t.deviceId ? '/' + t.deviceId : ''}`
}

export function resolveMetrics(topic: SparkplugTopicParts, payload: SparkplugPayload, aliases: AliasState): SparkplugMetric[] {
  const scope = keyOf(topic)
  const scopeAliases = aliases.get(scope) ?? new Map<number, string>()
  if (topic.messageType === 'NBIRTH' || topic.messageType === 'DBIRTH') {
    for (const m of payload.metrics) if (m.alias !== undefined && m.name) scopeAliases.set(m.alias, m.name)
    aliases.set(scope, scopeAliases)
  }
  return payload.metrics.map((m) => ({
    ...m,
    name: m.name ?? (m.alias !== undefined ? scopeAliases.get(m.alias) : undefined),
  }))
}
