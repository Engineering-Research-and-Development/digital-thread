import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { normalizeNodesJson } from '@/iterations/normalize-node'
import type { FlowNodeDef } from '@/iterations/types/flow-node'

export type CollectionMethod = 'MANUAL' | 'AUTOMATIC' | 'INGESTED' | 'IMPORTED' | 'DERIVED'

export interface StoryPartner {
  id: string
  code: string
  fullName: string
  color: string
  role: string | null
}

export interface StoryAgent {
  id: string
  type: 'HANDLER' | 'USER' | 'EXTERNAL'
  name: string
  version: string | null
}

export interface StoryFile {
  id: string
  filename: string
  path: string
  sizeBytes: number
  contentType: string
  contentHash: string | null
  classification: string
  uploadType: string
  sourceInfo: string
  timestamp: string
  iterationId: string
  ownerIterationDisplayId: string | null
  nodeStateId: string | null
  nodeId: string
  nodeLabel: string
  outputId: string | null
  partner: StoryPartner | null
  agent: StoryAgent | null
  transformation: string
  collectionMethod: CollectionMethod
  upstreamFileIds: string[]
  downstreamFileIds: string[]
  external: boolean
}

export interface StoryStep {
  nodeStateId: string
  nodeId: string
  nodeLabel: string
  kind: string
  status: string
  startedAt: string | null
  completedAt: string | null
  durationMs: number | null
  partner: StoryPartner | null
  agent: StoryAgent | null
  transformation: string
  collectionMethod: CollectionMethod
  inputFileIds: string[]
  outputFileIds: string[]
}

export interface IterationStory {
  iterationId: string
  displayId: string
  machineId: string
  machineName: string
  status: string
  startedAt: string
  endedAt: string | null
  parentIterationId: string | null
  restartFromNodeId: string | null
  partners: StoryPartner[]
  steps: StoryStep[]
  files: StoryFile[]
}

/**
 * IterationStoryService — denormalised "story" view of an iteration.
 *
 * Reads the same source-of-truth as ProvenanceService (NodeRuntimeState +
 * FileRecord + LineageEdge + ProvenanceAgent + frozen FlowNodeDef) but emits a
 * shape friendly to non-PROV-O consumers:
 *   - timeline / swimlane per partner,
 *   - breadcrumb chain for a selected file,
 *   - sortable table + CSV export.
 *
 * No new persistence — this is a read-side projection.
 */
@Injectable()
export class IterationStoryService {
  constructor(private prisma: PrismaService) {}

  async buildStory(iterationId: string): Promise<IterationStory> {
    const iter = await this.prisma.iteration.findUnique({
      where: { id: iterationId },
      include: {
        machine: true,
        stateMachineVersion: true,
        nodeStates: { include: { provenanceAgent: true } },
        fileRecords: true,
      },
    })
    if (!iter) throw new NotFoundException(`Iteration ${iterationId} not found`)

    const flowJson = iter.stateMachineVersion?.nodesJson ?? iter.machine?.nodesJson ?? null
    const flowNodes = normalizeNodesJson(flowJson)
    const nodeDefById = new Map<string, FlowNodeDef>(flowNodes.map((n) => [n.id, n]))

    const referencedFileIds = collectReferencedFileIds(iter.nodeStates)
    const ownFileIds = new Set(iter.fileRecords.map((f) => f.id))
    const externalIds = Array.from(referencedFileIds).filter((id) => !ownFileIds.has(id))

    const externalFiles = externalIds.length
      ? await this.prisma.fileRecord.findMany({ where: { id: { in: externalIds } } })
      : []
    const externalIterationIds = Array.from(
      new Set(externalFiles.map((f) => f.iterationId).filter((id): id is string => id !== null)),
    )
    const externalIterations = externalIterationIds.length
      ? await this.prisma.iteration.findMany({
          where: { id: { in: externalIterationIds } },
          select: { id: true, displayId: true },
        })
      : []
    const externalIterDisplayById = new Map(externalIterations.map((i) => [i.id, i.displayId]))

    const allFiles = [
      ...iter.fileRecords.map((f) => ({ ...f, external: false })),
      ...externalFiles.map((f) => ({ ...f, external: true })),
    ]

    const fileIds = allFiles.map((f) => f.id)
    const lineage = fileIds.length
      ? await this.prisma.lineageEdge.findMany({
          where: {
            OR: [
              { upstreamFileId: { in: fileIds } },
              { downstreamFileId: { in: fileIds } },
            ],
          },
        })
      : []

    const upstreamByFile = new Map<string, Set<string>>()
    const downstreamByFile = new Map<string, Set<string>>()
    for (const e of lineage) {
      if (!upstreamByFile.has(e.downstreamFileId)) upstreamByFile.set(e.downstreamFileId, new Set())
      upstreamByFile.get(e.downstreamFileId)!.add(e.upstreamFileId)
      if (!downstreamByFile.has(e.upstreamFileId)) downstreamByFile.set(e.upstreamFileId, new Set())
      downstreamByFile.get(e.upstreamFileId)!.add(e.downstreamFileId)
    }

    const partnerIds = new Set<string>()
    for (const n of flowNodes) if (n.responsiblePartnerId) partnerIds.add(n.responsiblePartnerId)
    // Pick up structured partner attribution from FileRecord.partnerId.
    for (const f of allFiles) if (f.partnerId) partnerIds.add(f.partnerId)

    const userAgents = iter.nodeStates.filter((ns) => ns.provenanceAgent?.agentType === 'USER')
    const userEmails = Array.from(new Set(userAgents.map((ns) => ns.provenanceAgent!.name).filter(Boolean)))
    const users = userEmails.length
      ? await this.prisma.user.findMany({
          where: { email: { in: userEmails } },
          select: { id: true, email: true, partnerId: true, fullName: true },
        })
      : []
    const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]))
    for (const u of users) if (u.partnerId) partnerIds.add(u.partnerId)

    const partners = partnerIds.size
      ? await this.prisma.partner.findMany({ where: { id: { in: Array.from(partnerIds) } } })
      : []
    const partnerById = new Map<string, StoryPartner>(
      partners.map((p) => [
        p.id,
        { id: p.id, code: p.name, fullName: p.fullName, color: p.color, role: p.role ?? null },
      ]),
    )
    const partnerByName = new Map<string, StoryPartner>(
      partners.map((p) => [p.name.toLowerCase(), partnerById.get(p.id)!]),
    )

    const resolveStepPartner = (ns: typeof iter.nodeStates[number]): StoryPartner | null => {
      const def = nodeDefById.get(ns.nodeId)
      if (def?.responsiblePartnerId && partnerById.has(def.responsiblePartnerId)) {
        return partnerById.get(def.responsiblePartnerId)!
      }
      if (def?.responsiblePartner) {
        const p = partnerByName.get(def.responsiblePartner.toLowerCase())
        if (p) return p
      }
      if (ns.provenanceAgent?.agentType === 'USER') {
        const u = userByEmail.get((ns.provenanceAgent.name ?? '').toLowerCase())
        if (u?.partnerId && partnerById.has(u.partnerId)) return partnerById.get(u.partnerId)!
      }
      return null
    }

    const steps: StoryStep[] = iter.nodeStates.map((ns) => {
      const def = nodeDefById.get(ns.nodeId)
      const agent = ns.provenanceAgent
        ? {
            id: ns.provenanceAgent.id,
            type: ns.provenanceAgent.agentType as StoryAgent['type'],
            name: ns.provenanceAgent.name,
            version: ns.provenanceAgent.version,
          }
        : null
      const partner = resolveStepPartner(ns)
      const collectionMethod: CollectionMethod = ns.handlerName
        ? 'AUTOMATIC'
        : agent?.type === 'USER'
        ? 'MANUAL'
        : 'MANUAL'
      const startedAt = ns.startedAt?.toISOString() ?? null
      const completedAt = ns.completedAt?.toISOString() ?? null
      const durationMs =
        ns.startedAt && ns.completedAt
          ? Math.max(0, ns.completedAt.getTime() - ns.startedAt.getTime())
          : null
      const inputs = parseInputs(ns.inputFileStatusesJson)
      const outputs = parseOutputs(ns.outputsJson)
      const inputFileIds = uniq(Object.values(inputs).flatMap((v) => v.fileIds ?? []))
      const outputFileIds = uniq(Object.values(outputs).flat())
      return {
        nodeStateId: ns.id,
        nodeId: ns.nodeId,
        nodeLabel: def?.name ?? def?.label ?? ns.nodeId,
        kind: def?.kind ?? 'TASK',
        status: ns.status,
        startedAt,
        completedAt,
        durationMs,
        partner,
        agent,
        // Prefer the structured transformationLabel persisted at handler completion /
        // manual upload time; fall back to a derived description for legacy rows.
        transformation:
          ns.transformationLabel ??
          describeTransformation({ agent, collectionMethod, nodeLabel: def?.name ?? ns.nodeId }),
        collectionMethod,
        inputFileIds,
        outputFileIds,
      }
    })

    const stepByNodeId = new Map(steps.map((s) => [s.nodeId, s]))

    const files: StoryFile[] = allFiles.map((f) => {
      // These are always set for node-produced files (raw files never appear
      // in a story). Coerce the nullable columns defensively.
      const fNodeSourceId = f.nodeSourceId ?? ''
      const fIterationId = f.iterationId ?? ''
      const ownStep = stepByNodeId.get(fNodeSourceId)
      const def = nodeDefById.get(fNodeSourceId)
      let partner: StoryPartner | null = null
      let agent: StoryAgent | null = null
      let collectionMethod: CollectionMethod
      let transformation: string
      // Prefer the structured FileRecord.partnerId when present.
      if (f.partnerId && partnerById.has(f.partnerId)) {
        partner = partnerById.get(f.partnerId)!
      }
      if (!f.external && ownStep) {
        partner = partner ?? ownStep.partner
        agent = ownStep.agent
        collectionMethod = inferFileCollectionMethod(f.uploadType, ownStep.collectionMethod)
        transformation = ownStep.transformation
      } else {
        // External (cross-iteration) file or no matching step — fall back to file fields.
        partner = partner ?? (def?.responsiblePartnerId ? partnerById.get(def.responsiblePartnerId) ?? null : null)
        agent = null
        collectionMethod = inferFileCollectionMethod(f.uploadType, 'MANUAL')
        transformation = `Produced in iteration ${externalIterDisplayById.get(fIterationId) ?? fIterationId.slice(0, 8)}`
      }
      return {
        id: f.id,
        filename: f.filename,
        path: f.path,
        sizeBytes: f.sizeBytes,
        contentType: f.contentType,
        contentHash: f.contentHash,
        classification: f.classification,
        uploadType: f.uploadType,
        sourceInfo: f.sourceInfo,
        timestamp: f.timestamp.toISOString(),
        iterationId: fIterationId,
        ownerIterationDisplayId: f.external ? externalIterDisplayById.get(fIterationId) ?? null : iter.displayId,
        nodeStateId: ownStep?.nodeStateId ?? null,
        nodeId: fNodeSourceId,
        nodeLabel: f.nodeSourceLabel ?? '',
        outputId: f.nodeOutputId ?? null,
        partner,
        agent,
        transformation,
        collectionMethod,
        upstreamFileIds: Array.from(upstreamByFile.get(f.id) ?? []),
        downstreamFileIds: Array.from(downstreamByFile.get(f.id) ?? []),
        external: f.external,
      }
    })

    // Order partners by first-appearance in steps timeline for stable lane order.
    const partnerOrder: StoryPartner[] = []
    const seenPartners = new Set<string>()
    for (const s of steps) {
      if (s.partner && !seenPartners.has(s.partner.id)) {
        partnerOrder.push(s.partner)
        seenPartners.add(s.partner.id)
      }
    }
    for (const p of partnerById.values()) {
      if (!seenPartners.has(p.id)) {
        partnerOrder.push(p)
        seenPartners.add(p.id)
      }
    }

    return {
      iterationId: iter.id,
      displayId: iter.displayId,
      machineId: iter.machineId,
      machineName: iter.machineName,
      status: iter.status,
      startedAt: iter.createdAt.toISOString(),
      endedAt: iter.completedAt?.toISOString() ?? null,
      parentIterationId: iter.parentIterationId,
      restartFromNodeId: iter.restartFromNodeId,
      partners: partnerOrder,
      steps,
      files,
    }
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseInputs(json: string | null): Record<string, { fileIds?: string[]; filePath?: string }> {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function parseOutputs(json: string | null): Record<string, string[]> {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr))
}

function collectReferencedFileIds(
  nodeStates: Array<{ outputsJson: string | null; inputFileStatusesJson: string | null }>,
): Set<string> {
  const ids = new Set<string>()
  for (const ns of nodeStates) {
    for (const list of Object.values(parseOutputs(ns.outputsJson))) {
      for (const id of list) if (id) ids.add(id)
    }
    for (const entry of Object.values(parseInputs(ns.inputFileStatusesJson))) {
      for (const id of entry.fileIds ?? []) if (id) ids.add(id)
    }
  }
  return ids
}

function describeTransformation(opts: {
  agent: StoryAgent | null
  collectionMethod: CollectionMethod
  nodeLabel: string
}): string {
  if (opts.agent?.type === 'HANDLER') {
    return `Ran ${opts.agent.name}${opts.agent.version ? ` v${opts.agent.version}` : ''}`
  }
  if (opts.agent?.type === 'USER') {
    return `Manual step by ${opts.agent.name}`
  }
  if (opts.agent?.type === 'EXTERNAL') {
    return `External system: ${opts.agent.name}`
  }
  return opts.collectionMethod === 'AUTOMATIC' ? `Automated step "${opts.nodeLabel}"` : `Manual step "${opts.nodeLabel}"`
}

function inferFileCollectionMethod(uploadType: string, stepMethod: CollectionMethod): CollectionMethod {
  if (uploadType === 'INGESTED') return 'INGESTED'
  if (uploadType === 'AUTOMATIC') return 'AUTOMATIC'
  if (uploadType === 'MANUAL') return 'MANUAL'
  return stepMethod
}
