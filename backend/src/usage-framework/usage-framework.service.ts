import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { SignedManifestService } from '@/governance/signed-manifest.service'
import { evaluateAction, validateOdrl, type OdrlPolicy } from './odrl.validator'

/**
 * UsageFrameworkService — implements a lightweight, self-hosted data-space
 * exchange between Digital Thread instances (no external broker/connector
 * required). A `DataExport` bundles an `IterationManifest` + an ODRL policy.
 * The export can be signed (reusing `SignedManifestService`), transmitted to
 * another DT instance, and verified on import.
 */
@Injectable()
export class UsageFrameworkService {
  private readonly logger = new Logger(UsageFrameworkService.name)

  constructor(
    private prisma: PrismaService,
    private signed: SignedManifestService,
  ) {}

  // ── Export side ──────────────────────────────────────────────────────────

  async createExport(input: {
    iterationId: string
    targetPartnerId?: string
    policy?: OdrlPolicy
    createdById: string
  }) {
    if (input.policy) {
      const v = validateOdrl(input.policy)
      if (!v.valid) throw new BadRequestException({ message: 'ODRL policy invalid', issues: v.issues })
    }
    return this.prisma.dataExport.create({
      data: {
        iterationId: input.iterationId,
        targetPartnerId: input.targetPartnerId,
        policyJson: input.policy ? JSON.stringify(input.policy) : null,
        createdById: input.createdById,
      },
    })
  }

  async signAndAttach(exportId: string, signerPartnerId: string) {
    const exp = await this.prisma.dataExport.findUnique({ where: { id: exportId } })
    if (!exp || !exp.iterationId) throw new NotFoundException('Export or iteration not found')
    const manifest = await this.signed.exportSigned(exp.iterationId, signerPartnerId)
    return this.prisma.dataExport.update({
      where: { id: exportId },
      data: { manifestId: manifest.id, status: 'SIGNED' },
    })
  }

  async markTransmitted(exportId: string) {
    return this.prisma.dataExport.update({
      where: { id: exportId },
      data: { status: 'TRANSMITTED', transmittedAt: new Date() },
    })
  }

  async listExports() {
    return this.prisma.dataExport.findMany({
      orderBy: { createdAt: 'desc' },
      include: { iteration: { select: { displayId: true } }, targetPartner: { select: { name: true } } },
    })
  }

  // ── Import side ──────────────────────────────────────────────────────────

  async receiveImport(input: {
    sourcePartner: string
    manifestJson: any
    signature?: string
    policy?: OdrlPolicy
  }) {
    if (input.policy) {
      const v = validateOdrl(input.policy)
      if (!v.valid) throw new BadRequestException({ message: 'ODRL policy invalid', issues: v.issues })
    }
    const manifestText = JSON.stringify(input.manifestJson)
    const manifestHash = require('crypto').createHash('sha256').update(manifestText).digest('hex')
    return this.prisma.dataImport.create({
      data: {
        sourcePartner: input.sourcePartner,
        manifestHash,
        manifestJson: manifestText,
        policyJson: input.policy ? JSON.stringify(input.policy) : null,
        signature: input.signature,
      },
    })
  }

  /** Verify an inbound import's signature against the partner certificate. */
  async verifyImport(importId: string) {
    const imp = await this.prisma.dataImport.findUnique({ where: { id: importId } })
    if (!imp) throw new NotFoundException('Import not found')
    if (!imp.signature) {
      return this.prisma.dataImport.update({
        where: { id: importId }, data: { verified: false, verifyReason: 'no signature' },
      })
    }
    const partner = await this.prisma.partner.findFirst({ where: { name: imp.sourcePartner } })
    let ok = false; let reason: string | undefined
    if (!partner) reason = 'source partner unknown'
    else if (!partner.certificatePem) reason = 'source partner has no public key configured'
    else {
      try {
        const crypto = require('crypto')
        ok = crypto.verify(null, Buffer.from(imp.manifestHash, 'hex'), partner.certificatePem, Buffer.from(imp.signature, 'base64'))
        if (!ok) reason = 'signature mismatch'
      } catch (e: any) { reason = `verify error: ${e?.message}` }
    }
    return this.prisma.dataImport.update({ where: { id: importId }, data: { verified: ok, verifyReason: reason ?? null } })
  }

  async acceptImport(importId: string, acceptedById: string) {
    const imp = await this.prisma.dataImport.findUnique({ where: { id: importId } })
    if (!imp) throw new NotFoundException('Import not found')
    if (!imp.verified) throw new BadRequestException('Import must be verified before accepting')
    return this.prisma.dataImport.update({
      where: { id: importId },
      data: { acceptedById, acceptedAt: new Date() },
    })
  }

  async listImports() { return this.prisma.dataImport.findMany({ orderBy: { receivedAt: 'desc' } }) }

  /**
   * Runtime enforcement — checks whether a requested action is permitted by
   * the import's ODRL policy. Callers (e.g. download of derived artefacts)
   * invoke this before serving bytes.
   */
  async checkAllowed(importId: string, action: string, ctx: Record<string, any> = {}) {
    const imp = await this.prisma.dataImport.findUnique({ where: { id: importId } })
    if (!imp) throw new NotFoundException('Import not found')
    if (!imp.policyJson) return { allowed: true, reason: 'no policy attached' }
    const policy = JSON.parse(imp.policyJson) as OdrlPolicy
    return evaluateAction(policy, action, ctx)
  }

  validatePolicy(policy: OdrlPolicy) { return validateOdrl(policy) }
}
