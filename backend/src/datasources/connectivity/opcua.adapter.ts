import { IConnectivityAdapter, TagMapping } from './connectivity.interface'

/**
 * OPC-UA adapter stub — full implementation requires `node-opcua` package.
 * Install: npm install node-opcua
 */
export class OpcUaAdapter implements IConnectivityAdapter {
  constructor(
    private endpoint: string,
    private _authConfig: any,
    private _protocolConfig: any,
  ) {}

  async testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    return { ok: false, error: `OPC-UA stub — endpoint: ${this.endpoint}. Install node-opcua package to enable.` }
  }

  async fetchLatest(_tagMapping: TagMapping[]): Promise<Record<string, unknown>> {
    return {}
  }
}
