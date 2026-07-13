import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { FilesService } from '@/files/files.service'
import { ROLE, type Role } from '@/auth/roles'

export type RelationType = 'WAS_DERIVED_FROM' | 'WAS_GENERATED_BY' | 'USED' | 'WAS_REVISION_OF'

/** Requester context used to scope inner trace views for OWNER. */
export type LineageRequester = { id: string; role: Role; partnerId?: string | null }

/**
 * LineageService — manages explicit file-to-file derivation edges.
 *
 * Edges are created:
 *   - Automatically on node completion via `recordEdgesForNode` (uses the node's
 *     declared inputs from `inputFileStatusesJson` to derive upstream file IDs).
 *   - Manually via `createEdge` for cross-iteration / out-of-band lineage.
 */
@Injectable()
export class LineageService {
  constructor(private prisma: PrismaService, private files: FilesService) {}

  /**
   * Auto-create lineage edges from a node's declared input files to all
   * output FileRecords produced by that node in the iteration.
   *
   * The upstream candidates come from two sources on
   * `NodeRuntimeState.inputFileStatusesJson`:
   *   - `fileIds[]` (current): explicit FileRecord IDs populated by the engine
   *     when resolving PREDECESSOR bindings, or by setInputFile from the
   *     runtime UI.
   *   - `filePath` (legacy): a single-file pointer from the pre-generic-node-model
   *     schema; still accepted as a fallback so older iterations keep working.
   *
   * Idempotent — duplicate edges are silently skipped via the unique
   * constraint on (upstreamFileId, downstreamFileId, relationType).
   */
  async recordEdgesForNode(opts: {
    iterationId: string
    nodeId: string
    handlerName?: string
    handlerVersion?: string
  }): Promise<number> {
    const node = await this.prisma.nodeRuntimeState.findUnique({
      where: { iterationId_nodeId: { iterationId: opts.iterationId, nodeId: opts.nodeId } },
    })
    if (!node) return 0

    type InputStatus = { provided?: boolean; filePath?: string; fileIds?: string[]; resolvedFrom?: string }
    const inputs: Record<string, InputStatus> = node.inputFileStatusesJson
      ? JSON.parse(node.inputFileStatusesJson)
      : {}

    const upstreamIds = new Set<string>()
    const upstreamPaths = new Set<string>()
    for (const v of Object.values(inputs)) {
      if (Array.isArray(v?.fileIds)) {
        for (const id of v.fileIds) if (id) upstreamIds.add(id)
      }
      if (typeof v?.filePath === 'string' && v.filePath) {
        upstreamPaths.add(v.filePath)
      }
    }

    if (upstreamIds.size === 0 && upstreamPaths.size === 0) return 0

    // Resolve upstream FileRecords by id OR by legacy path. Both lookups are
    // unioned and de-duplicated to avoid double edges.
    const [byId, byPath] = await Promise.all([
      upstreamIds.size > 0
        ? this.prisma.fileRecord.findMany({ where: { id: { in: Array.from(upstreamIds) } } })
        : Promise.resolve([] as any[]),
      upstreamPaths.size > 0
        ? this.prisma.fileRecord.findMany({ where: { path: { in: Array.from(upstreamPaths) } } })
        : Promise.resolve([] as any[]),
    ])
    const upstreamFiles = new Map<string, any>()
    for (const f of byId) upstreamFiles.set(f.id, f)
    for (const f of byPath) upstreamFiles.set(f.id, f)
    if (upstreamFiles.size === 0) return 0

    const downstreamFiles = await this.prisma.fileRecord.findMany({
      where: { iterationId: opts.iterationId, nodeSourceId: opts.nodeId },
    })
    if (downstreamFiles.length === 0) return 0

    const transformInfo = JSON.stringify({
      handlerName: opts.handlerName ?? node.handlerName,
      handlerVersion: opts.handlerVersion ?? node.handlerVersion,
      provenanceAgentId: node.provenanceAgentId,
    })

    let created = 0
    for (const up of upstreamFiles.values()) {
      for (const down of downstreamFiles) {
        if (up.id === down.id) continue
        try {
          await this.prisma.lineageEdge.create({
            data: {
              upstreamFileId: up.id,
              downstreamFileId: down.id,
              relationType: 'WAS_DERIVED_FROM',
              transformInfo,
            },
          })
          created++
        } catch {
          // unique constraint = duplicate, ignore
        }
      }
    }
    return created
  }

  /**
   * Rebuild lineage for every completed node of an iteration. Used as a
   * backfill for iterations that ran on the bugged code path (where
   * `recordEdgesForNode` could not resolve fileIds-only bindings) — and as
   * a general repair primitive when something looks off in the Thread
   * Explorer "Trace" buttons.
   */
  async rebuildForIteration(iterationId: string) {
    const states = await this.prisma.nodeRuntimeState.findMany({
      where: { iterationId, status: 'COMPLETED' },
    })
    let totalEdges = 0
    let touchedNodes = 0
    for (const s of states) {
      const created = await this.recordEdgesForNode({
        iterationId,
        nodeId: s.nodeId,
        handlerName: s.handlerName ?? undefined,
        handlerVersion: s.handlerVersion ?? undefined,
      })
      if (created > 0) touchedNodes++
      totalEdges += created
    }
    return { iterationId, nodesProcessed: states.length, nodesWithEdges: touchedNodes, edgesCreated: totalEdges }
  }

  async createEdge(input: {
    upstreamFileId: string
    downstreamFileId: string
    relationType?: RelationType
    transformInfo?: object
  }) {
    return this.prisma.lineageEdge.create({
      data: {
        upstreamFileId: input.upstreamFileId,
        downstreamFileId: input.downstreamFileId,
        relationType: input.relationType ?? 'WAS_DERIVED_FROM',
        transformInfo: input.transformInfo ? JSON.stringify(input.transformInfo) : null,
      },
    })
  }

  async getUpstream(fileId: string, depth = 1) {
    return this.traverse(fileId, depth, 'upstream')
  }

  async getDownstream(fileId: string, depth = 1) {
    return this.traverse(fileId, depth, 'downstream')
  }

  /**
   * Full transitive graph anchored on `fileId`, walking upstream and downstream
   * up to `maxDepth` hops. Returns `{ nodes, edges }` ready for XYFlow / Dagre.
   *
   * Each node is enriched with the iteration it belongs to (`iterationDisplayId`,
   * `iterationStatus`, `iterationMachineName`, `iterationCreatedAt`) and the
   * partner attributed to the file (from the structured `FileRecord.partnerId`).
   * The frontend uses this to (a) show iteration context inside each file card
   * and (b) collapse the graph by iteration when the file count is large.
   */
  async getFullGraph(fileId: string, maxDepth = 5, requester?: LineageRequester) {
    const root = await this.prisma.fileRecord.findUnique({ where: { id: fileId } })
    if (!root) throw new NotFoundException(`File ${fileId} not found`)

    const visited = new Map<string, any>()
    const edges: any[] = []
    const queue: Array<{ id: string; depth: number; direction: 'up' | 'down' }> = [
      { id: fileId, depth: 0, direction: 'up' },
      { id: fileId, depth: 0, direction: 'down' },
    ]
    visited.set(fileId, root)

    while (queue.length) {
      const { id, depth, direction } = queue.shift()!
      if (depth >= maxDepth) continue
      const adj = await this.prisma.lineageEdge.findMany({
        where: direction === 'up' ? { downstreamFileId: id } : { upstreamFileId: id },
        include: { upstream: true, downstream: true },
      })
      for (const e of adj) {
        // Include transformInfo + createdAt so the UI tooltip can show
        // "produced by handler X at <timestamp>".
        let transform: any = null
        if (e.transformInfo) {
          try { transform = JSON.parse(e.transformInfo) } catch { transform = null }
        }
        edges.push({
          id: e.id,
          source: e.upstreamFileId,
          target: e.downstreamFileId,
          relationType: e.relationType,
          createdAt: e.createdAt,
          transformInfo: transform,
        })
        const next = direction === 'up' ? e.upstream : e.downstream
        if (!visited.has(next.id)) {
          visited.set(next.id, next)
          queue.push({ id: next.id, depth: depth + 1, direction })
        }
      }
    }

    // Enrich nodes with iteration + partner metadata so the lineage explorer
    // can show cross-iteration context (the original raw payload only carried
    // FileRecord scalars). On top of the owning iteration we ALSO surface every
    // iteration that references the file as input — without this, a file used
    // as a PREDECESSOR input in iteration B but produced in iteration A would
    // only show iteration A in the lineage view, even though the Thread
    // Explorer correctly lists both.
    const files = Array.from(visited.values())
    const fileIds = files.map((f) => f.id)

    // Collect cross-iteration usages (OUTPUT + INPUT references) for every
    // file in the graph. Shape: Map<fileId, FileReference[]>.
    const usagesByFile = await this.files.collectFileReferences(fileIds)

    // Union of iterations: producers (file.iterationId) + every iteration that
    // references at least one file in the graph as INPUT/OUTPUT.
    const iterationIds = new Set<string>()
    for (const f of files) if (f.iterationId) iterationIds.add(f.iterationId)
    for (const refs of usagesByFile.values()) {
      for (const r of refs) if (r.iterationId) iterationIds.add(r.iterationId)
    }
    const partnerIds = Array.from(
      new Set(files.map((f) => f.partnerId).filter((v): v is string => !!v)),
    )
    const [iterations, partners] = await Promise.all([
      iterationIds.size
        ? this.prisma.iteration.findMany({
            where: { id: { in: Array.from(iterationIds) } },
            select: {
              id: true,
              displayId: true,
              status: true,
              machineName: true,
              createdAt: true,
              completedAt: true,
            },
          })
        : Promise.resolve([] as any[]),
      partnerIds.length
        ? this.prisma.partner.findMany({
            where: { id: { in: partnerIds } },
            select: { id: true, name: true, fullName: true, color: true },
          })
        : Promise.resolve([] as any[]),
    ])
    const iterById = new Map(iterations.map((i) => [i.id, i]))
    const partnerById = new Map(partners.map((p) => [p.id, p]))

    const enriched = files.map((f) => {
      const it = iterById.get(f.iterationId)
      const p = f.partnerId ? partnerById.get(f.partnerId) : null
      const usages = (usagesByFile.get(f.id) ?? []).map((r) => ({
        iterationId: r.iterationId,
        iterationDisplayId: r.iterationDisplayId ?? iterById.get(r.iterationId)?.displayId ?? null,
        iterationStatus: r.iterationStatus ?? iterById.get(r.iterationId)?.status ?? null,
        nodeId: r.nodeId,
        nodeLabel: r.nodeLabel ?? null,
        role: r.role,
        inputId: r.inputId ?? null,
        outputId: r.outputId ?? null,
      }))
      return {
        ...f,
        iterationDisplayId: it?.displayId ?? null,
        iterationStatus: it?.status ?? null,
        iterationMachineName: it?.machineName ?? null,
        iterationCreatedAt: it?.createdAt ?? null,
        iterationCompletedAt: it?.completedAt ?? null,
        partner: p ? { id: p.id, code: p.name, fullName: p.fullName, color: p.color } : null,
        usages,
      }
    })

    // ── OWNER scope ───────────────────────────────────────────────────────────
    // An OWNER may only see graph nodes that are files used in iterations of
    // their own products, and within each node only the usages tied to those
    // iterations. SUPERADMIN (and other roles) see the unfiltered graph.
    if (requester?.role === ROLE.OWNER) {
      const { fileIds: scopeFileIds, iterationIds: scopeIterIds } =
        await this.files.ownerProductScope(requester.partnerId)
      const allowFiles = new Set(scopeFileIds)
      const allowIters = new Set(scopeIterIds)
      const nodes = enriched
        .filter((n) => allowFiles.has(n.id))
        .map((n) => ({ ...n, usages: n.usages.filter((u) => u.iterationId && allowIters.has(u.iterationId)) }))
      const nodeIds = new Set(nodes.map((n) => n.id))
      const scopedEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      return { root: fileId, nodes, edges: scopedEdges }
    }

    return {
      root: fileId,
      nodes: enriched,
      edges,
    }
  }

  private async traverse(fileId: string, depth: number, direction: 'upstream' | 'downstream') {
    const root = await this.prisma.fileRecord.findUnique({ where: { id: fileId } })
    if (!root) throw new NotFoundException(`File ${fileId} not found`)
    const visited = new Set<string>([fileId])
    const queue: Array<{ id: string; depth: number }> = [{ id: fileId, depth: 0 }]
    const result: any[] = []
    while (queue.length) {
      const { id, depth: d } = queue.shift()!
      if (d >= depth) continue
      const edges = await this.prisma.lineageEdge.findMany({
        where: direction === 'upstream' ? { downstreamFileId: id } : { upstreamFileId: id },
        include: { upstream: true, downstream: true },
      })
      for (const e of edges) {
        const next = direction === 'upstream' ? e.upstream : e.downstream
        if (visited.has(next.id)) continue
        visited.add(next.id)
        result.push({ file: next, edge: { id: e.id, relationType: e.relationType } })
        queue.push({ id: next.id, depth: d + 1 })
      }
    }
    return { root, [direction]: result }
  }
}
