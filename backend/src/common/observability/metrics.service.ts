import { Injectable } from '@nestjs/common'

/**
 * Lightweight in-process Prometheus-compatible metrics registry.
 *
 * We avoid pulling `prom-client` to keep dependencies light; a switchover to
 * `prom-client` + full OpenTelemetry is a trivial substitution if a future
 * deployment wires up Loki/Grafana.
 *
 * Exposed via `GET /metrics` (public endpoint) in text exposition format.
 */
type Labels = Record<string, string | number>
const serializeLabels = (l?: Labels): string => {
  if (!l) return ''
  const entries = Object.entries(l).map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
  return entries.length ? `{${entries.join(',')}}` : ''
}

@Injectable()
export class MetricsService {
  private counters = new Map<string, Map<string, number>>()
  private gauges = new Map<string, Map<string, number>>()
  private histograms = new Map<string, Array<{ labels?: Labels; value: number; ts: number }>>()

  incrementCounter(name: string, labels?: Labels, by = 1) {
    const map = this.counters.get(name) ?? new Map<string, number>()
    const key = serializeLabels(labels)
    map.set(key, (map.get(key) ?? 0) + by)
    this.counters.set(name, map)
  }

  setGauge(name: string, value: number, labels?: Labels) {
    const map = this.gauges.get(name) ?? new Map<string, number>()
    map.set(serializeLabels(labels), value)
    this.gauges.set(name, map)
  }

  observeHistogram(name: string, value: number, labels?: Labels) {
    const list = this.histograms.get(name) ?? []
    list.push({ labels, value, ts: Date.now() })
    // Keep window bounded — this is in-memory only, no external TSDB
    if (list.length > 10_000) list.splice(0, list.length - 10_000)
    this.histograms.set(name, list)
  }

  /** Prometheus 0.0.4 text exposition format. */
  exposition(): string {
    const lines: string[] = []
    for (const [name, series] of this.counters.entries()) {
      lines.push(`# TYPE ${name} counter`)
      for (const [labels, v] of series.entries()) lines.push(`${name}${labels} ${v}`)
    }
    for (const [name, series] of this.gauges.entries()) {
      lines.push(`# TYPE ${name} gauge`)
      for (const [labels, v] of series.entries()) lines.push(`${name}${labels} ${v}`)
    }
    for (const [name, samples] of this.histograms.entries()) {
      lines.push(`# TYPE ${name} summary`)
      const recent = samples.slice(-500)
      const labels: Record<string, number[]> = {}
      for (const s of recent) {
        const k = serializeLabels(s.labels)
        labels[k] ??= []
        labels[k].push(s.value)
      }
      for (const [k, arr] of Object.entries(labels)) {
        const sum = arr.reduce((a, b) => a + b, 0)
        lines.push(`${name}_count${k} ${arr.length}`)
        lines.push(`${name}_sum${k} ${sum}`)
      }
    }
    return lines.join('\n') + '\n'
  }
}
