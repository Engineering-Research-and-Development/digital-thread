import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'

/**
 * Cross-iteration Component Passport.
 *
 * Walks every iteration tagged with the given `componentRef` in metadata and
 * returns an ordered lifecycle view: design → MFG → QA → operation, linking
 * artefacts by produced-node category.
 */
@Injectable()
export class ComponentPassportService {
  constructor(private prisma: PrismaService) {}

  async listKnown(): Promise<Array<{ componentRef: string; iterationCount: number; lastSeenAt: Date }>> {
    const all = await this.prisma.iteration.findMany({
      select: { metadataJson: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    const agg = new Map<string, { iterationCount: number; lastSeenAt: Date }>()
    for (const i of all) {
      let ref: string | undefined
      try { ref = JSON.parse(i.metadataJson || '{}').componentRef } catch {}
      if (!ref || typeof ref !== 'string') continue
      const prev = agg.get(ref)
      if (prev) prev.iterationCount += 1
      else agg.set(ref, { iterationCount: 1, lastSeenAt: i.createdAt })
    }
    return [...agg.entries()]
      .map(([componentRef, v]) => ({ componentRef, ...v }))
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
  }

  async passport(componentRef: string) {
    const all = await this.prisma.iteration.findMany({
      include: { fileRecords: true, machine: true },
      orderBy: { createdAt: 'asc' },
    })
    const matching = all.filter((i) => {
      try { return JSON.parse(i.metadataJson || '{}').componentRef === componentRef } catch { return false }
    })

    const phases = [
      { phase: 'design',       tags: ['CAD_RELEASE', 'REQUIREMENTS_DEF', 'TOPOLOGY_OPTIMIZATION'] },
      { phase: 'material',     tags: ['MATERIAL_SPEC', 'MATERIAL_CHANGE', 'LAB_COUPON_TEST'] },
      { phase: 'manufacturing',tags: ['ATL_MANUFACTURING', 'MFG_ATL', 'PROTOTYPE_MFG'] },
      { phase: 'simulation',   tags: ['PROCESS_SIM', 'SIM_CONSOLIDATION', 'FEA_STRUCTURAL', 'VIRTUAL_TESTING'] },
      { phase: 'quality',      tags: ['NDI_INSPECTION', 'NDI_SCAN', 'AI_QUALITY_CHECK', 'AI_DEFECT_DETECTION', 'LAB_TEST'] },
      { phase: 'operation',    tags: ['SHM_CALIBRATION', 'DIC_STRAIN_FIELD'] },
      { phase: 'end-of-life',  tags: ['DELAMINATION_PROCESS', 'RECYCLING_PLAN'] },
    ]

    const grouped: Record<string, any[]> = {}
    for (const p of phases) grouped[p.phase] = []
    for (const iter of matching) {
      const nodes: Array<{ id: string; nodeTypeId: string; label?: string }> = JSON.parse(iter.machine.nodesJson || '[]')
      for (const phase of phases) {
        for (const n of nodes) {
          if (!phase.tags.includes(n.nodeTypeId)) continue
          const files = iter.fileRecords.filter((f) => f.nodeSourceId === n.id)
          if (files.length === 0) continue
          grouped[phase.phase].push({
            iterationId: iter.id,
            iterationDisplayId: iter.displayId,
            nodeId: n.id,
            nodeTypeId: n.nodeTypeId,
            label: n.label,
            files: files.map((f) => ({ id: f.id, filename: f.filename, classification: f.classification, contentHash: f.contentHash })),
          })
        }
      }
    }

    return {
      componentRef,
      iterationCount: matching.length,
      phases: phases.map((p) => ({ phase: p.phase, entries: grouped[p.phase] })),
    }
  }
}
