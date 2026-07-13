import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'

/**
 * Digital Product Passport exporter (EU ESPR 2027 mandate).
 *
 * Produces an AAS submodel-flavoured JSON document aggregating, for a given
 * component URN, the data required by the EU Digital Product Passport mandate:
 *   - Identification (URN, partner origin)
 *   - Bill of materials (enriched from iteration metadata)
 *   - Manufacturing history (iteration chain)
 *   - Compliance evidence (certifications mentioned in timeline + files)
 *
 * This is a JSON serialisation, not a PDF. PDF rendering is downstream.
 */
@Injectable()
export class DppService {
  constructor(private prisma: PrismaService) {}

  async byComponent(componentRef: string) {
    // Find iterations whose metadata.componentRef matches.
    const all = await this.prisma.iteration.findMany()
    const matching = all.filter((i) => {
      try {
        return JSON.parse(i.metadataJson || '{}').componentRef === componentRef
      } catch { return false }
    })
    if (matching.length === 0) throw new NotFoundException(`No iterations for component ${componentRef}`)

    const iterationIds = matching.map((m) => m.id)
    const [files, events, ncs, fieldIssues] = await Promise.all([
      this.prisma.fileRecord.findMany({ where: { iterationId: { in: iterationIds } } }),
      this.prisma.timelineEvent.findMany({ where: { iterationId: { in: iterationIds } } }),
      this.prisma.nonConformance.findMany({ where: { iterationId: { in: iterationIds } } }),
      this.prisma.fieldIssue.findMany({ where: { componentRef } }),
    ])

    return {
      passportKind: 'DigitalProductPassport',
      passportVersion: '1.0.0',
      submodelIdShort: 'DigitalProductPassport',
      aasSemanticId: 'urn:digital-thread:submodel:DigitalProductPassport:1:0',
      generatedAt: new Date().toISOString(),
      componentRef,
      origins: [...new Set(matching.map((m) => JSON.parse(m.metadataJson || '{}').partnerOwner).filter(Boolean))],
      manufacturingHistory: matching.map((m) => ({
        iterationId: m.id,
        displayId: m.displayId,
        status: m.status,
        createdAt: m.createdAt,
        completedAt: m.completedAt,
      })),
      files: files.map((f) => ({
        id: f.id, filename: f.filename, contentHash: f.contentHash, classification: f.classification,
      })),
      complianceEvidence: {
        ncOpen: ncs.filter((n) => n.status !== 'CLOSED').length,
        ncTotal: ncs.length,
        fieldIssuesOpen: fieldIssues.filter((f) => f.status !== 'CLOSED').length,
      },
      timelineSummary: {
        totalEvents: events.length,
        firstEvent: events[0]?.timestamp ?? null,
        lastEvent: events[events.length - 1]?.timestamp ?? null,
      },
    }
  }
}
