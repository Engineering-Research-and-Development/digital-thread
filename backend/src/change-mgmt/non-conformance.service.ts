import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { LineageService } from '@/lineage/lineage.service'

export type RootCauseCategory = 'DESIGN' | 'MATERIAL' | 'PROCESS' | 'INSPECTION' | 'HUMAN' | 'ENVIRONMENTAL' | 'UNKNOWN'
export type NcSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

/**
 * Non-conformance reports raised against workflow executions.
 *
 * Links non-conformances to iteration + node + file, and exposes an impact
 * surface (downstream-affected files) via lineage.
 */
@Injectable()
export class NonConformanceService {
  constructor(
    private prisma: PrismaService,
    private lineage: LineageService,
  ) {}

  async list(filter?: { status?: string; severity?: NcSeverity }) {
    return this.prisma.nonConformance.findMany({
      where: { status: filter?.status, severity: filter?.severity },
      orderBy: { createdAt: 'desc' },
    })
  }

  async findOne(id: string) {
    const nc = await this.prisma.nonConformance.findUnique({ where: { id } })
    if (!nc) throw new NotFoundException(`NonConformance ${id} not found`)
    return nc
  }

  async create(input: {
    title: string
    description: string
    iterationId?: string
    nodeId?: string
    fileRecordId?: string
    rootCauseCategory?: RootCauseCategory
    rootCauseDetail?: string
    severity?: NcSeverity
    reportedBy: string
  }) {
    return this.prisma.nonConformance.create({
      data: {
        title: input.title,
        description: input.description,
        iterationId: input.iterationId,
        nodeId: input.nodeId,
        fileRecordId: input.fileRecordId,
        rootCauseCategory: input.rootCauseCategory ?? 'UNKNOWN',
        rootCauseDetail: input.rootCauseDetail,
        severity: input.severity ?? 'MEDIUM',
        reportedBy: input.reportedBy,
      },
    })
  }

  async update(id: string, input: Partial<{
    rootCauseCategory: RootCauseCategory
    rootCauseDetail: string
    severity: NcSeverity
    status: string
  }>) {
    await this.findOne(id)
    return this.prisma.nonConformance.update({
      where: { id },
      data: {
        ...input,
        resolvedAt: input.status === 'RESOLVED' || input.status === 'CLOSED' ? new Date() : undefined,
      },
    })
  }

  /**
   * Affected artefacts — walks lineage downstream from the NC's linked file and
   * returns matching iterations / manifests that may need re-qualification.
   */
  async affectedArtifacts(id: string) {
    const nc = await this.findOne(id)
    if (!nc.fileRecordId) return { downstreamFiles: [], iterations: [] }
    const graph = await this.lineage.getFullGraph(nc.fileRecordId, 5).catch(() => null)
    const downstream = graph?.nodes ?? []
    const iterationIds = [...new Set(downstream.map((n: any) => n.iterationId).filter(Boolean))]
    const iterations = await this.prisma.iteration.findMany({
      where: { id: { in: iterationIds } },
      select: { id: true, displayId: true, status: true, machineName: true },
    })
    return { downstreamFiles: downstream, iterations }
  }
}
