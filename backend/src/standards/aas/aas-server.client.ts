import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

/**
 * Thin HTTP client for the AAS Part 2 REST API (BaSyx / AAS4J). Supports:
 *   - publishing AAS shells + submodels to a remote AAS server
 *   - registering shells with an AAS Registry
 *   - listing / fetching shells by URI
 *
 * Endpoints are configured via env:
 *   AAS_SERVER_BASE_URL   (required to publish)
 *   AAS_REGISTRY_BASE_URL (optional)
 *
 * When the base URL is unset, the client returns a `skipped` response so callers
 * can run in a dev environment without a BaSyx instance.
 */
@Injectable()
export class AasServerClient {
  private readonly logger = new Logger(AasServerClient.name)
  private readonly serverBase: string | undefined
  private readonly registryBase: string | undefined

  constructor(config: ConfigService) {
    this.serverBase = config.get<string>('AAS_SERVER_BASE_URL') ?? process.env.AAS_SERVER_BASE_URL
    this.registryBase = config.get<string>('AAS_REGISTRY_BASE_URL') ?? process.env.AAS_REGISTRY_BASE_URL
  }

  async publishShell(shell: any): Promise<{ ok: boolean; status?: number; skipped?: boolean; error?: string }> {
    if (!this.serverBase) return { ok: false, skipped: true }
    try {
      const encodedId = this.b64url(shell.id ?? '')
      const res = await this.put(`${this.serverBase}/shells/${encodedId}`, shell)
      return { ok: res.ok, status: res.status }
    } catch (e: any) { return { ok: false, error: e?.message } }
  }

  async publishSubmodel(shellId: string, submodel: any): Promise<{ ok: boolean; status?: number; skipped?: boolean; error?: string }> {
    if (!this.serverBase) return { ok: false, skipped: true }
    try {
      const encoded = this.b64url(shellId)
      const encodedSm = this.b64url(submodel.id ?? '')
      const res = await this.put(`${this.serverBase}/shells/${encoded}/submodels/${encodedSm}`, submodel)
      return { ok: res.ok, status: res.status }
    } catch (e: any) { return { ok: false, error: e?.message } }
  }

  async registerInRegistry(descriptor: object): Promise<{ ok: boolean; status?: number; skipped?: boolean; error?: string }> {
    if (!this.registryBase) return { ok: false, skipped: true }
    try {
      const res = await this.post(`${this.registryBase}/shell-descriptors`, descriptor)
      return { ok: res.ok, status: res.status }
    } catch (e: any) { return { ok: false, error: e?.message } }
  }

  async lookupShell(shellId: string): Promise<{ ok: boolean; body?: any; status?: number; skipped?: boolean }> {
    if (!this.registryBase) return { ok: false, skipped: true }
    const encoded = this.b64url(shellId)
    const res = await fetch(`${this.registryBase}/shell-descriptors/${encoded}`)
    if (!res.ok) return { ok: false, status: res.status }
    return { ok: true, status: res.status, body: await res.json().catch(() => null) }
  }

  private async put(url: string, body: any) {
    return fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  }
  private async post(url: string, body: any) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  }
  private b64url(s: string): string {
    return Buffer.from(s, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
}
