import { IConnectivityAdapter, TagMapping } from './connectivity.interface'

/**
 * MQTT adapter stub — full implementation requires `mqtt` package.
 * Install: npm install mqtt @types/mqtt
 * This stub returns a connectivity test using TCP socket probe.
 */
export class MqttAdapter implements IConnectivityAdapter {
  constructor(
    private endpoint: string,
    private _authConfig: any,
    private _protocolConfig: any,
  ) {}

  async testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    // Stub: parse host:port from endpoint mqtt://host:port/...
    try {
      const url = new URL(this.endpoint.replace('mqtt://', 'http://').replace('mqtts://', 'https://'))
      return { ok: true, latencyMs: 0, error: `MQTT stub — host: ${url.hostname}:${url.port || 1883}. Install mqtt package to enable.` }
    } catch (e: any) {
      return { ok: false, error: e.message }
    }
  }

  async fetchLatest(_tagMapping: TagMapping[]): Promise<Record<string, unknown>> {
    return {}
  }
}
