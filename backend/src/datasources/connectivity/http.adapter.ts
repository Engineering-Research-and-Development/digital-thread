import { IConnectivityAdapter, TagMapping } from './connectivity.interface'

export class HttpAdapter implements IConnectivityAdapter {
  constructor(
    private endpoint: string,
    private authConfig: any,
    private protocolConfig: any,
  ) {}

  async testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now()
    try {
      const headers: Record<string, string> = {}
      if (this.authConfig?.type === 'bearer') headers['Authorization'] = `Bearer ${this.authConfig.token}`
      if (this.authConfig?.type === 'apikey') headers[this.authConfig.headerName ?? 'X-Api-Key'] = this.authConfig.token

      const res = await fetch(this.endpoint, { method: 'HEAD', headers, signal: AbortSignal.timeout(5000) })
      return { ok: res.ok || res.status < 500, latencyMs: Date.now() - start }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  async fetchLatest(tagMapping: TagMapping[]): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.authConfig?.type === 'bearer') headers['Authorization'] = `Bearer ${this.authConfig.token}`
    if (this.authConfig?.type === 'apikey') headers[this.authConfig.headerName ?? 'X-Api-Key'] = this.authConfig.token

    const cfg = this.protocolConfig ?? {}
    const url = this.endpoint + (cfg.path ?? '')
    const res = await fetch(url, { method: cfg.method ?? 'GET', headers })
    const body = await res.json()

    const result: Record<string, unknown> = {}
    for (const mapping of tagMapping) {
      const parts = mapping.sourcePath.replace(/^\$\./, '').split('.')
      let value: any = body
      for (const part of parts) value = value?.[part]
      result[mapping.targetInputId] = value
    }
    return result
  }
}
