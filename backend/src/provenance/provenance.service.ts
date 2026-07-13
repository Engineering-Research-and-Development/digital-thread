import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'

export type ProvGraphNodeKind = 'activity' | 'entity' | 'agent'
export type ProvGraphEdgeKind =
  | 'wasGeneratedBy'
  | 'wasAttributedTo'
  | 'wasAssociatedWith'
  | 'wasInformedBy'
  | 'wasDerivedFrom'
  | 'wasRevisionOf'
  | 'used'

export interface ProvGraphNode {
  id: string
  kind: ProvGraphNodeKind
  label: string
  subtype?: string
  attrs?: Record<string, string | undefined>
}

export interface ProvGraphEdge {
  id: string
  source: string
  target: string
  relation: ProvGraphEdgeKind
}

export interface ProvGraph {
  iterationId: string
  rootId: string
  nodes: ProvGraphNode[]
  edges: ProvGraphEdge[]
}

/**
 * ProvenanceService — emits W3C PROV-O Turtle for an iteration.
 *
 * Mapping:
 *   - Iteration  → prov:Activity (its execution as a whole)
 *   - NodeRuntimeState → prov:Activity (per-node)
 *   - FileRecord → prov:Entity
 *   - ProvenanceAgent / User → prov:Agent
 *   - "WAS_DERIVED_FROM" lineage → prov:wasDerivedFrom
 *   - Handler invocation → prov:wasAssociatedWith
 */
@Injectable()
export class ProvenanceService {
  constructor(private prisma: PrismaService) {}

  async exportTurtle(iterationId: string): Promise<string> {
    const iter = await this.prisma.iteration.findUnique({
      where: { id: iterationId },
      include: { nodeStates: { include: { provenanceAgent: true } }, fileRecords: true, machine: true },
    })
    if (!iter) throw new NotFoundException(`Iteration ${iterationId} not found`)

    // Fork support — a forked iteration "uses" files that were produced in
    // its parent (predecessor outputs cloned through fork) and any node may
    // "use" inputs wired from external uploads. Walk the inputs catalog so
    // every cross-iteration file referenced by this iteration's activities is
    // materialised as a prov:Entity with its real attribution.
    const referencedFileIds = this.collectReferencedFileIds(iter.nodeStates)
    const referencedFiles = referencedFileIds.size
      ? await this.prisma.fileRecord.findMany({ where: { id: { in: Array.from(referencedFileIds) } } })
      : []
    const ownFileIds = new Set(iter.fileRecords.map((f) => f.id))
    const externalFiles = referencedFiles.filter((f) => !ownFileIds.has(f.id))

    const lineage = await this.prisma.lineageEdge.findMany({
      where: { OR: [
        { upstream: { iterationId } },
        { downstream: { iterationId } },
        // Also include edges whose endpoints are external files referenced
        // by this iteration — so the fork's PROV captures derivations that
        // span parent → fork.
        ...(externalFiles.length
          ? [
              { upstreamFileId: { in: externalFiles.map((f) => f.id) } },
              { downstreamFileId: { in: externalFiles.map((f) => f.id) } },
            ]
          : []),
      ] },
    })

    const lines: string[] = []
    const p = (s: string) => lines.push(s)

    // Prefixes
    p('@prefix prov: <http://www.w3.org/ns/prov#> .')
    p('@prefix xsd:  <http://www.w3.org/2001/XMLSchema#> .')
    p('@prefix dt:   <urn:digital-thread:> .')
    p('@prefix iter: <urn:digital-thread:iteration:> .')
    p('@prefix node: <urn:digital-thread:node:> .')
    p('@prefix file: <urn:digital-thread:file:> .')
    p('@prefix agent:<urn:digital-thread:agent:> .')
    p('')

    // Iteration as activity
    p(`iter:${iter.id} a prov:Activity ;`)
    p(`    dt:displayId "${iter.displayId}" ;`)
    p(`    dt:machine   "${iter.machineName}" ;`)
    p(`    dt:status    "${iter.status}" ;`)
    if (iter.parentIterationId) {
      p(`    prov:wasInformedBy iter:${iter.parentIterationId} ;`)
      if (iter.restartFromNodeId) p(`    dt:restartFromNodeId "${iter.restartFromNodeId}" ;`)
    }
    p(`    prov:startedAtTime "${iter.createdAt.toISOString()}"^^xsd:dateTime${iter.completedAt ? ' ;' : ' .'}`)
    if (iter.completedAt) p(`    prov:endedAtTime   "${iter.completedAt.toISOString()}"^^xsd:dateTime .`)
    p('')

    // Node-level activities — emit `prov:used` for each input file (typed by
    // FileRecord lookup so cross-iter usages are captured).
    const inputsByNode = this.collectInputsByNode(iter.nodeStates)
    for (const ns of iter.nodeStates) {
      p(`node:${ns.id} a prov:Activity ;`)
      p(`    dt:nodeId "${ns.nodeId}" ;`)
      p(`    dt:status "${ns.status}" ;`)
      if (ns.startedAt) p(`    prov:startedAtTime "${ns.startedAt.toISOString()}"^^xsd:dateTime ;`)
      if (ns.completedAt) p(`    prov:endedAtTime   "${ns.completedAt.toISOString()}"^^xsd:dateTime ;`)
      if (ns.provenanceAgent) p(`    prov:wasAssociatedWith agent:${ns.provenanceAgent.id} ;`)
      const usedIds = inputsByNode.get(ns.nodeId) ?? []
      for (const fid of usedIds) p(`    prov:used file:${fid} ;`)
      p(`    prov:wasInformedBy iter:${iter.id} .`)
    }
    p('')

    // Agents
    const agents = new Map<string, any>()
    for (const ns of iter.nodeStates) if (ns.provenanceAgent) agents.set(ns.provenanceAgent.id, ns.provenanceAgent)
    for (const a of agents.values()) {
      p(`agent:${a.id} a prov:SoftwareAgent ;`)
      p(`    dt:agentType "${a.agentType}" ;`)
      p(`    dt:name "${a.name}" ;`)
      p(`    dt:version "${a.version ?? ''}" .`)
    }
    p('')

    // Entities (files) — own files keep their iteration attribution; external
    // files referenced by this iteration's activities are emitted with their
    // ORIGINAL attribution so a single FileRecord never accumulates multiple
    // prov:wasAttributedTo claims across iterations.
    const allEntities = [...iter.fileRecords, ...externalFiles]
    for (const f of allEntities) {
      p(`file:${f.id} a prov:Entity ;`)
      p(`    dt:filename "${f.filename}" ;`)
      p(`    dt:contentHash "${f.contentHash ?? ''}" ;`)
      p(`    dt:classification "${f.classification}" ;`)
      p(`    dt:uploadType "${f.uploadType}" ;`)
      p(`    prov:generatedAtTime "${f.timestamp.toISOString()}"^^xsd:dateTime ;`)
      if (f.iterationId === iter.id) {
        const ns = iter.nodeStates.find((n) => n.nodeId === f.nodeSourceId)
        if (ns) p(`    prov:wasGeneratedBy node:${ns.id} ;`)
      }
      // Only attribute to an owning iteration when one exists; a RAW
      // (unattached) file would otherwise emit a dangling `iter:null`. Always
      // terminate the entity block with a valid statement.
      if (f.iterationId) {
        p(`    prov:wasAttributedTo iter:${f.iterationId} .`)
      } else {
        p(`    dt:unattached "true"^^xsd:boolean .`)
      }
    }
    p('')

    // Lineage edges
    for (const e of lineage) {
      const verb =
        e.relationType === 'WAS_DERIVED_FROM' ? 'prov:wasDerivedFrom' :
        e.relationType === 'WAS_REVISION_OF' ? 'prov:wasRevisionOf' :
        e.relationType === 'USED' ? 'prov:used' :
        'prov:wasGeneratedBy'
      p(`file:${e.downstreamFileId} ${verb} file:${e.upstreamFileId} .`)
    }

    return lines.join('\n') + '\n'
  }

  /**
   * Aggregate every FileRecord id referenced as an INPUT or OUTPUT by any of
   * the supplied node states. Used by exportTurtle/exportGraph to surface
   * cross-iteration file usages (forked iterations consume parent outputs as
   * their restart node's predecessor inputs).
   */
  private collectReferencedFileIds(nodeStates: Array<{ outputsJson: string | null; inputFileStatusesJson: string | null }>): Set<string> {
    const ids = new Set<string>()
    for (const ns of nodeStates) {
      if (ns.outputsJson) {
        let parsed: Record<string, string[]> = {}
        try { parsed = JSON.parse(ns.outputsJson) } catch { parsed = {} }
        for (const list of Object.values(parsed)) {
          if (Array.isArray(list)) for (const id of list) if (id) ids.add(id)
        }
      }
      if (ns.inputFileStatusesJson) {
        let parsed: Record<string, { fileIds?: string[] }> = {}
        try { parsed = JSON.parse(ns.inputFileStatusesJson) } catch { parsed = {} }
        for (const entry of Object.values(parsed)) {
          if (Array.isArray(entry?.fileIds)) for (const id of entry.fileIds) if (id) ids.add(id)
        }
      }
    }
    return ids
  }

  /**
   * Map each nodeId → list of FileRecord ids wired as INPUT for the node.
   * Drives `prov:used` edges in the PROV export.
   */
  private collectInputsByNode(nodeStates: Array<{ nodeId: string; inputFileStatusesJson: string | null }>): Map<string, string[]> {
    const out = new Map<string, string[]>()
    for (const ns of nodeStates) {
      if (!ns.inputFileStatusesJson) continue
      let parsed: Record<string, { fileIds?: string[] }> = {}
      try { parsed = JSON.parse(ns.inputFileStatusesJson) } catch { parsed = {} }
      const flat = new Set<string>()
      for (const entry of Object.values(parsed)) {
        if (Array.isArray(entry?.fileIds)) for (const id of entry.fileIds) if (id) flat.add(id)
      }
      if (flat.size > 0) out.set(ns.nodeId, Array.from(flat))
    }
    return out
  }

  /**
   * Projects the same provenance dataset as `exportTurtle` into a typed
   * `{nodes, edges}` shape suitable for graph rendering (XYFlow on the frontend).
   * Same Prisma reads, different serialisation — kept in sync with the Turtle
   * mapping in `exportTurtle` above.
   */
  async exportGraph(iterationId: string): Promise<ProvGraph> {
    const iter = await this.prisma.iteration.findUnique({
      where: { id: iterationId },
      include: { nodeStates: { include: { provenanceAgent: true } }, fileRecords: true, machine: true },
    })
    if (!iter) throw new NotFoundException(`Iteration ${iterationId} not found`)

    const referencedFileIds = this.collectReferencedFileIds(iter.nodeStates)
    const referencedFiles = referencedFileIds.size
      ? await this.prisma.fileRecord.findMany({ where: { id: { in: Array.from(referencedFileIds) } } })
      : []
    const ownFileIds = new Set(iter.fileRecords.map((f) => f.id))
    const externalFiles = referencedFiles.filter((f) => !ownFileIds.has(f.id))

    const lineage = await this.prisma.lineageEdge.findMany({
      where: { OR: [
        { upstream: { iterationId } },
        { downstream: { iterationId } },
        ...(externalFiles.length
          ? [
              { upstreamFileId: { in: externalFiles.map((f) => f.id) } },
              { downstreamFileId: { in: externalFiles.map((f) => f.id) } },
            ]
          : []),
      ] },
    })

    const iterNodeId = `iter:${iter.id}`
    const nodes: ProvGraphNode[] = []
    const edges: ProvGraphEdge[] = []

    nodes.push({
      id: iterNodeId,
      kind: 'activity',
      label: iter.displayId,
      subtype: 'iteration',
      attrs: {
        machine: iter.machineName,
        status: iter.status,
        startedAt: iter.createdAt.toISOString(),
        endedAt: iter.completedAt?.toISOString(),
        parentIterationId: iter.parentIterationId ?? undefined,
        restartFromNodeId: iter.restartFromNodeId ?? undefined,
      },
    })

    // wasInformedBy edge to the parent iteration (fork lineage).
    if (iter.parentIterationId) {
      edges.push({
        id: `${iterNodeId}->iter:${iter.parentIterationId}:informedBy`,
        source: iterNodeId,
        target: `iter:${iter.parentIterationId}`,
        relation: 'wasInformedBy',
      })
    }

    const agentsSeen = new Map<string, ProvGraphNode>()
    const inputsByNode = this.collectInputsByNode(iter.nodeStates)
    for (const ns of iter.nodeStates) {
      const nsId = `node:${ns.id}`
      nodes.push({
        id: nsId,
        kind: 'activity',
        label: ns.nodeId,
        subtype: 'node',
        attrs: {
          status: ns.status,
          startedAt: ns.startedAt?.toISOString(),
          endedAt: ns.completedAt?.toISOString(),
        },
      })
      edges.push({
        id: `${nsId}->${iterNodeId}:informedBy`,
        source: nsId,
        target: iterNodeId,
        relation: 'wasInformedBy',
      })
      if (ns.provenanceAgent) {
        const aId = `agent:${ns.provenanceAgent.id}`
        if (!agentsSeen.has(aId)) {
          agentsSeen.set(aId, {
            id: aId,
            kind: 'agent',
            label: ns.provenanceAgent.name,
            subtype: ns.provenanceAgent.agentType,
            attrs: { version: ns.provenanceAgent.version ?? undefined },
          })
        }
        edges.push({
          id: `${nsId}->${aId}:associatedWith`,
          source: nsId,
          target: aId,
          relation: 'wasAssociatedWith',
        })
      }
      for (const fid of inputsByNode.get(ns.nodeId) ?? []) {
        edges.push({
          id: `${nsId}->file:${fid}:used`,
          source: nsId,
          target: `file:${fid}`,
          relation: 'used',
        })
      }
    }
    for (const a of agentsSeen.values()) nodes.push(a)

    // Own files + cross-iteration externally-referenced files. Attribution
    // edge always points to the file's REAL owning iteration so a file does
    // not collect multiple wasAttributedTo claims across iterations.
    const allEntities = [...iter.fileRecords, ...externalFiles]
    for (const f of allEntities) {
      const fId = `file:${f.id}`
      nodes.push({
        id: fId,
        kind: 'entity',
        label: f.filename,
        subtype: f.classification,
        attrs: {
          uploadType: f.uploadType,
          contentHash: f.contentHash ?? undefined,
          generatedAt: f.timestamp.toISOString(),
          ownerIterationId: f.iterationId ?? undefined,
          external: f.iterationId !== iter.id ? 'true' : undefined,
        },
      })
      if (f.iterationId === iter.id) {
        const ns = iter.nodeStates.find((n) => n.nodeId === f.nodeSourceId)
        if (ns) {
          edges.push({
            id: `${fId}->node:${ns.id}:generatedBy`,
            source: fId,
            target: `node:${ns.id}`,
            relation: 'wasGeneratedBy',
          })
        }
      }
      // Skip the attribution edge for RAW/unattached files (no owning
      // iteration node exists, so the edge would dangle to `iter:null`).
      if (f.iterationId) {
        edges.push({
          id: `${fId}->iter:${f.iterationId}:attributedTo`,
          source: fId,
          target: `iter:${f.iterationId}`,
          relation: 'wasAttributedTo',
        })
      }
    }

    for (const e of lineage) {
      const rel: ProvGraphEdgeKind =
        e.relationType === 'WAS_DERIVED_FROM' ? 'wasDerivedFrom' :
        e.relationType === 'WAS_REVISION_OF' ? 'wasRevisionOf' :
        e.relationType === 'USED' ? 'used' :
        'wasGeneratedBy'
      edges.push({
        id: `file:${e.downstreamFileId}->file:${e.upstreamFileId}:${rel}`,
        source: `file:${e.downstreamFileId}`,
        target: `file:${e.upstreamFileId}`,
        relation: rel,
      })
    }

    return { iterationId: iter.id, rootId: iterNodeId, nodes, edges }
  }
}
