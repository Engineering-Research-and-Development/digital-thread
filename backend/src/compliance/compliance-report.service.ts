import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'

/**
 * ComplianceReportService — one-click audit report for a single iteration.
 *
 * Emits an audit-ready bundle for a single iteration containing:
 *   - Iteration envelope (machine, metadata, classification, partner scope)
 *   - Timeline events (append-only audit trail)
 *   - Files produced (per node, classification, hashes)
 *   - Manifest list (hash + signature presence)
 *   - PROV-O turtle reference (by URL)
 *   - Non-conformances + change requests touching this iteration
 *
 * Returned JSON is both the in-app view and the canonical serialisation that
 * the (future) PDF renderer consumes.
 */
@Injectable()
export class ComplianceReportService {
  constructor(private prisma: PrismaService) {}

  async forIteration(iterationId: string) {
    const iter = await this.prisma.iteration.findUnique({
      where: { id: iterationId },
      include: {
        machine: { select: { id: true, name: true, version: true, dtmiBase: true } },
        nodeStates: { include: { provenanceAgent: true } },
        timelineEvents: { orderBy: { timestamp: 'asc' } },
        fileRecords: true,
        manifests: true,
      },
    })
    if (!iter) throw new NotFoundException(`Iteration ${iterationId} not found`)

    const [ncs, crs] = await Promise.all([
      this.prisma.nonConformance.findMany({ where: { iterationId } }),
      this.prisma.changeRequest.findMany({ where: { targetType: 'Iteration', targetId: iterationId } }),
    ])

    return {
      reportKind: 'DigitalThread-ComplianceReport',
      reportVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      iteration: {
        id: iter.id,
        displayId: iter.displayId,
        status: iter.status,
        classification: iter.classification,
        metadata: JSON.parse(iter.metadataJson || '{}'),
        createdAt: iter.createdAt,
        completedAt: iter.completedAt,
        machine: iter.machine,
      },
      nodeExecutions: iter.nodeStates.map((n) => ({
        nodeId: n.nodeId,
        status: n.status,
        handler: n.handlerName ? `${n.handlerName}@${n.handlerVersion ?? '?'}` : null,
        agent: n.provenanceAgent ? { id: n.provenanceAgent.id, name: n.provenanceAgent.name, version: n.provenanceAgent.version } : null,
        startedAt: n.startedAt, completedAt: n.completedAt,
        claimedBy: n.claimedBy,
        outputFilePath: n.outputFilePath,
      })),
      timeline: iter.timelineEvents.map((e) => ({
        timestamp: e.timestamp, action: e.action, nodeId: e.nodeId, partner: e.partner, detail: e.detail,
      })),
      files: iter.fileRecords.map((f) => ({
        id: f.id, path: f.path, filename: f.filename, version: f.version,
        contentHash: f.contentHash, classification: f.classification,
        uploadType: f.uploadType, pathKind: f.pathKind, sizeBytes: f.sizeBytes, timestamp: f.timestamp,
      })),
      manifests: iter.manifests.map((m) => ({
        id: m.id, manifestHash: m.manifestHash, signed: !!m.signature, signerPartnerId: m.signerPartnerId,
      })),
      nonConformances: ncs,
      changeRequests: crs,
      provenance: {
        format: 'application/turtle',
        endpoint: `/api/v1/provenance/iteration/${iter.id}.ttl`,
      },
    }
  }
}
