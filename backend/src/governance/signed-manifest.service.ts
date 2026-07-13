import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import * as crypto from 'crypto'
import { PrismaService } from '@/database/prisma.service'
import { ManifestService } from '@/files/manifest.service'

/**
 * SignedManifestService — signs and verifies exported iteration manifests
 * for tamper detection across federated partners.
 *
 * The DT generates a MANIFEST.json (via ManifestService) then signs it with
 * an ed25519 keypair per Partner. `verify` is called on inbound manifests
 * from federated partners. Production deployments will replace the local
 * keypair with a Vault-backed signer.
 */
@Injectable()
export class SignedManifestService {
  private readonly logger = new Logger(SignedManifestService.name)

  constructor(
    private prisma: PrismaService,
    private manifest: ManifestService,
  ) {}

  /**
   * Generate and sign a MANIFEST.json for the given iteration using the named
   * partner's certificate. The partner record must carry a PEM-encoded
   * ed25519 private key in `Partner.certificatePem` (dev), or a Vault reference.
   */
  async exportSigned(iterationId: string, partnerId: string) {
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } })
    if (!partner) throw new NotFoundException(`Partner ${partnerId} not found`)

    const manifestRec = await this.manifest.generateManifest(iterationId)
    if (!manifestRec) throw new NotFoundException(`Iteration ${iterationId} not found`)

    const pem = partner.certificatePem
    let signature: string | null = null
    if (pem) {
      try {
        const sig = crypto.sign(null, Buffer.from(manifestRec.manifestHash, 'hex'), pem)
        signature = sig.toString('base64')
      } catch (e: any) {
        this.logger.warn(`Signing failed for partner ${partner.name}: ${e?.message}`)
      }
    } else {
      // Dev fallback — HMAC over the hash with partner id as key. Not crypto-grade
      // but preserves end-to-end integrity semantics for local dev.
      signature = crypto.createHmac('sha256', partner.id).update(manifestRec.manifestHash).digest('base64')
    }

    return this.prisma.iterationManifest.update({
      where: { id: manifestRec.id },
      data: { signature, signerPartnerId: partner.id },
    })
  }

  /**
   * Verify a manifest — reconstruct the hash over the referenced manifest body,
   * then check the signature against the partner's public key (or HMAC in dev).
   */
  async verify(manifestId: string): Promise<{ valid: boolean; reason?: string }> {
    const m = await this.prisma.iterationManifest.findUnique({ where: { id: manifestId } })
    if (!m) return { valid: false, reason: 'not found' }
    if (!m.signature) return { valid: false, reason: 'unsigned' }
    if (!m.signerPartnerId) return { valid: false, reason: 'no signer partner' }
    const partner = await this.prisma.partner.findUnique({ where: { id: m.signerPartnerId } })
    if (!partner) return { valid: false, reason: 'signer partner missing' }

    if (partner.certificatePem) {
      try {
        const ok = crypto.verify(null, Buffer.from(m.manifestHash, 'hex'), partner.certificatePem, Buffer.from(m.signature, 'base64'))
        return { valid: ok, reason: ok ? undefined : 'signature mismatch' }
      } catch (e: any) {
        return { valid: false, reason: `verify error: ${e?.message}` }
      }
    }
    // Dev HMAC fallback
    const expected = crypto.createHmac('sha256', partner.id).update(m.manifestHash).digest('base64')
    return { valid: expected === m.signature, reason: expected === m.signature ? undefined : 'hmac mismatch' }
  }
}
