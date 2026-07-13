import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as crypto from 'crypto'

/**
 * SecretsService — AES-256-GCM symmetric encryption for at-rest credentials.
 *
 * Used to encrypt `DataSource.authConfigJson` and any other secret blob
 * persisted in the database. Supports a Vault-backed key source as a drop-in
 * alternative to the local env-derived key, behind the same interface.
 *
 * Key sources (priority order):
 *   1. `SECRETS_KEY_HEX` env (32 bytes hex)
 *   2. Derived from `JWT_SECRET` via SHA-256 (development fallback — logs a warning)
 */
@Injectable()
export class SecretsService implements OnModuleInit {
  private readonly logger = new Logger(SecretsService.name)
  private key!: Buffer

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    // Priority:
    //   1. VAULT_ADDR + VAULT_TOKEN + VAULT_SECRET_PATH → fetch 32-byte hex from Vault KV v2.
    //   2. SECRETS_KEY_HEX env
    //   3. SHA-256(JWT_SECRET) dev fallback
    const vaultAddr = process.env.VAULT_ADDR
    const vaultToken = process.env.VAULT_TOKEN
    const vaultPath = process.env.VAULT_SECRET_PATH
    if (vaultAddr && vaultToken && vaultPath) {
      try {
        const res = await fetch(`${vaultAddr}/v1/${vaultPath}`, { headers: { 'X-Vault-Token': vaultToken } })
        if (res.ok) {
          const body: any = await res.json()
          const hex: string | undefined = body?.data?.data?.secretsKeyHex ?? body?.data?.secretsKeyHex
          if (hex && hex.length === 64) {
            this.key = Buffer.from(hex, 'hex')
            this.logger.log('SecretsService: loaded 32-byte key from Vault')
            return
          }
        }
        this.logger.warn('SecretsService: Vault fetch failed or key missing; falling back to env')
      } catch (e: any) {
        this.logger.warn(`SecretsService: Vault error ${e?.message}; falling back to env`)
      }
    }
    const hex = process.env.SECRETS_KEY_HEX
    if (hex && hex.length === 64) {
      this.key = Buffer.from(hex, 'hex')
      return
    }
    const fallback = this.config.get<string>('auth.jwtSecret') ?? 'change-me'
    this.key = crypto.createHash('sha256').update(fallback).digest()
    this.logger.warn(
      'SECRETS_KEY_HEX not set — derived encryption key from JWT_SECRET. ' +
      'For production, set SECRETS_KEY_HEX (32-byte hex) or Vault (VAULT_* envs).',
    )
  }

  /** Returns base64 JSON `{iv, tag, ciphertext}` of the plaintext. */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv)
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.from(JSON.stringify({
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      ct: ct.toString('base64'),
    })).toString('base64')
  }

  decrypt(envelope: string): string {
    const obj = JSON.parse(Buffer.from(envelope, 'base64').toString('utf8'))
    const iv = Buffer.from(obj.iv, 'base64')
    const tag = Buffer.from(obj.tag, 'base64')
    const ct = Buffer.from(obj.ct, 'base64')
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  }
}
