import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { IStorageProvider, SaveFileOptions, PathKind } from './storage/storage.interface'
import { STORAGE_PROVIDER } from './storage/storage.tokens'
import { ROLE, type Role } from '@/auth/roles'
import type { FileRecord } from '@prisma/client'
import { EventBrokerService } from '@/events/event-broker.service'
import { normalizeNodesJson } from '@/iterations/normalize-node'
import { v4 as uuidv4 } from 'uuid'

const CLASSIFICATION_RANK: Record<string, number> = {
  PUBLIC: 0,
  INTERNAL: 1,
  PARTNER: 2,
  CONFIDENTIAL: 3,
  RESTRICTED: 4,
}

/**
 * One (iteration × node) reference to a FileRecord — either as the producing
 * OUTPUT or as a wired INPUT. A single file may have many references (e.g. the
 * origin node + N forked iterations that consume it as a predecessor input).
 */
export type FileReference = {
  fileId: string
  iterationId: string
  iterationDisplayId?: string
  iterationStatus?: string
  nodeId: string
  nodeLabel?: string
  role: 'OUTPUT' | 'INPUT'
  outputId?: string
  inputId?: string
}

@Injectable()
export class FilesService {
  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: IStorageProvider,
    private broker: EventBrokerService,
  ) {}

  async findAll(opts: {
    iterationId?: string
    nodeId?: string
    /** Visibility scope: RAW (unattached) | NODE (iteration-produced) | ALL (default). */
    scope?: 'RAW' | 'NODE' | 'ALL'
    page?: number
    limit?: number
    requester?: { id: string; role: Role; partnerId?: string }
  } = {}) {
    const { iterationId, nodeId, scope, page = 1, limit = 50, requester } = opts
    const where: any = {}
    if (iterationId) where.iterationId = iterationId
    if (nodeId) where.nodeSourceId = nodeId
    if (scope === 'RAW') where.attachmentKind = 'RAW'
    else if (scope === 'NODE') where.attachmentKind = 'NODE'

    // ── File Explorer visibility is strictly role-scoped ────────
    // The "global list" (no iteration/node filter — i.e. the File Explorer)
    // applies the following role matrix:
    //   • SUPERADMIN → every file.
    //   • OWNER      → only files used (produced OR consumed) in iterations of
    //                  the products their partner owns.
    //   • OPERATOR   → only files their own partner uploaded.
    // Node-scoped calls (iterationId/nodeId present — the iteration panel, a
    // node's own outputs) are intentionally NOT classification-filtered for the
    // OPERATOR role: a partner viewing a previous node must SEE that node's
    // locked (CONFIDENTIAL/RESTRICTED) files exist so they can raise a
    // FileAccessRequest. The bytes stay protected — `assertReadable` still gates
    // the download, and the UI renders "Request access" (decideFileAccess) for
    // anything out of their read scope.
    const isGlobalList = !iterationId && !nodeId
    if (requester && isGlobalList) {
      if (requester.role === ROLE.OPERATOR) {
        // Files attributed to the uploader's partner (attribution always follows
        // the real uploader, never the node's declared partner). The sentinel
        // guarantees an empty result for a partner with no partnerId rather than
        // leaking every file.
        where.partnerId = requester.partnerId ?? '__none__'
      } else if (requester.role === ROLE.OWNER) {
        const { fileIds } = await this.ownerProductScope(requester.partnerId)
        where.id = { in: fileIds.length ? fileIds : ['__none__'] }
      }
      // SUPERADMIN → unscoped (sees everything).
    }

    const skip = (page - 1) * limit
    const [items, total] = await Promise.all([
      this.prisma.fileRecord.findMany({ where, skip, take: limit, orderBy: { timestamp: 'desc' } }),
      this.prisma.fileRecord.count({ where }),
    ])

    // Enrich each file with the full set of (iteration, node) references —
    // includes the OUTPUT origin AND any INPUT usages (e.g. forked iterations
    // wiring the file as a PREDECESSOR input). The File Explorer renders
    // these as a stack so each row can show >1 reference per file.
    // Redact sensitive metadata of locked (CONFIDENTIAL/RESTRICTED) files for the
    // OPERATOR role: they may SEE such a file exists on a node (to request access)
    // but must not learn its storage path, uploader identity, or content hash
    // until a grant is approved. INTERNAL/PUBLIC/PARTNER metadata is unchanged.
    const refsByFile = await this.collectFileReferences(items.map((f) => f.id))
    const redactLocked = requester?.role === ROLE.OPERATOR
    const enriched = items.map((f) => {
      const base =
        redactLocked && (f.classification === 'CONFIDENTIAL' || f.classification === 'RESTRICTED')
          ? { ...f, path: '', sourceInfo: '', contentHash: null }
          : f
      return { ...base, references: refsByFile.get(f.id) ?? [] }
    })
    return { items: enriched, total }
  }

  /**
   * The OWNER "product scope". Computes the iterations belonging to
   * products owned by `partnerId`, and the set of files used (produced OR
   * consumed as a wired input) inside those iterations. Drives the OWNER view
   * of the File Explorer, the inner trace pages and the governance queue.
   *
   * Pure read; wrapped in try/catch on every JSON parse so a malformed
   * outputs/inputs blob can never crash the listing.
   */
  async ownerProductScope(
    partnerId?: string | null,
  ): Promise<{ iterationIds: string[]; fileIds: string[] }> {
    if (!partnerId) return { iterationIds: [], fileIds: [] }

    const products = await this.prisma.product.findMany({
      where: { ownerPartnerId: partnerId },
      select: { id: true },
    })
    if (products.length === 0) return { iterationIds: [], fileIds: [] }

    const iterations = await this.prisma.iteration.findMany({
      where: { productId: { in: products.map((p) => p.id) } },
      select: { id: true },
    })
    const iterationIds = iterations.map((i) => i.id)
    if (iterationIds.length === 0) return { iterationIds: [], fileIds: [] }

    // OUTPUT files: produced directly inside those iterations.
    const produced = await this.prisma.fileRecord.findMany({
      where: { iterationId: { in: iterationIds } },
      select: { id: true },
    })
    const fileIds = new Set<string>(produced.map((f) => f.id))

    // INPUT files: consumed (wired as predecessor inputs) in those iterations.
    const states = await this.prisma.nodeRuntimeState.findMany({
      where: { iterationId: { in: iterationIds } },
      select: { outputsJson: true, inputFileStatusesJson: true },
    })
    for (const s of states) {
      if (s.outputsJson) {
        try {
          const parsed = JSON.parse(s.outputsJson) as Record<string, string[]>
          for (const ids of Object.values(parsed)) {
            if (Array.isArray(ids)) ids.forEach((id) => typeof id === 'string' && fileIds.add(id))
          }
        } catch { /* ignore malformed outputs blob */ }
      }
      if (s.inputFileStatusesJson) {
        try {
          const parsed = JSON.parse(s.inputFileStatusesJson) as Record<string, { fileIds?: string[] }>
          for (const entry of Object.values(parsed)) {
            (entry?.fileIds ?? []).forEach((id) => typeof id === 'string' && fileIds.add(id))
          }
        } catch { /* ignore malformed inputs blob */ }
      }
    }

    return { iterationIds, fileIds: Array.from(fileIds) }
  }

  /**
   * Collect every (iteration × node) that references each of the given file
   * IDs — either as the producing output (NodeRuntimeState.outputsJson) or as
   * a wired input (NodeRuntimeState.inputFileStatusesJson). Enriches each
   * reference with the iteration's displayId/status and a human node label
   * read from the iteration's frozen workflow snapshot (the immutable
   * StateMachineVersion the iteration was created against).
   *
   * Returned shape per fileId:
   *   { iterationId, iterationDisplayId, iterationStatus,
   *     nodeId, nodeLabel,
   *     role: 'OUTPUT' | 'INPUT',
   *     outputId? | inputId? }
   */
  async collectFileReferences(fileIds: string[]): Promise<Map<string, FileReference[]>> {
    const out = new Map<string, FileReference[]>()
    if (fileIds.length === 0) return out
    const fileIdSet = new Set(fileIds)

    const states = await this.prisma.nodeRuntimeState.findMany({
      where: {
        OR: [
          { outputsJson: { not: null } },
          { inputFileStatusesJson: { not: null } },
        ],
      },
      select: {
        iterationId: true,
        nodeId: true,
        outputsJson: true,
        inputFileStatusesJson: true,
      },
    })

    type Pending = Omit<FileReference, 'iterationDisplayId' | 'iterationStatus' | 'nodeLabel'>
    const pending: Pending[] = []
    for (const s of states) {
      if (s.outputsJson) {
        let parsed: Record<string, string[]> = {}
        try { parsed = JSON.parse(s.outputsJson) } catch { parsed = {} }
        for (const [outputId, ids] of Object.entries(parsed)) {
          if (!Array.isArray(ids)) continue
          for (const fid of ids) {
            if (fileIdSet.has(fid)) {
              pending.push({
                fileId: fid,
                iterationId: s.iterationId,
                nodeId: s.nodeId,
                role: 'OUTPUT',
                outputId,
              })
            }
          }
        }
      }
      if (s.inputFileStatusesJson) {
        let parsed: Record<string, { fileIds?: string[] }> = {}
        try { parsed = JSON.parse(s.inputFileStatusesJson) } catch { parsed = {} }
        for (const [inputId, entry] of Object.entries(parsed)) {
          const ids = Array.isArray(entry?.fileIds) ? entry.fileIds : []
          for (const fid of ids) {
            if (fileIdSet.has(fid)) {
              pending.push({
                fileId: fid,
                iterationId: s.iterationId,
                nodeId: s.nodeId,
                role: 'INPUT',
                inputId,
              })
            }
          }
        }
      }
    }

    // Batch-load iteration metadata + node labels from frozen snapshots.
    const iterationIds = Array.from(new Set(pending.map((r) => r.iterationId)))
    const iterations = iterationIds.length
      ? await this.prisma.iteration.findMany({
          where: { id: { in: iterationIds } },
          include: { stateMachineVersion: true, machine: true },
        })
      : []
    const iterMeta = new Map<string, { displayId: string; status: string; nodeLabels: Map<string, string> }>()
    for (const iter of iterations) {
      const json = iter.stateMachineVersion?.nodesJson ?? iter.machine?.nodesJson ?? '[]'
      let nodes: any[] = []
      try { nodes = JSON.parse(json) } catch { nodes = [] }
      const labels = new Map<string, string>()
      for (const n of nodes) {
        const id = n?.id
        const label = n?.name ?? n?.label ?? n?.config?.name ?? n?.config?.label
        if (typeof id === 'string') labels.set(id, typeof label === 'string' ? label : id)
      }
      iterMeta.set(iter.id, { displayId: iter.displayId, status: iter.status, nodeLabels: labels })
    }

    // Dedupe (same fileId × iteration × node × role × slot) — same upload
    // listed twice in inputs of two nodes appears as two distinct refs.
    const seen = new Set<string>()
    for (const ref of pending) {
      const meta = iterMeta.get(ref.iterationId)
      const slotKey = ref.role === 'OUTPUT' ? `o:${ref.outputId ?? ''}` : `i:${ref.inputId ?? ''}`
      const dedupeKey = `${ref.fileId}|${ref.iterationId}|${ref.nodeId}|${ref.role}|${slotKey}`
      if (seen.has(dedupeKey)) continue
      seen.add(dedupeKey)
      const list = out.get(ref.fileId) ?? []
      list.push({
        ...ref,
        iterationDisplayId: meta?.displayId,
        iterationStatus: meta?.status,
        nodeLabel: meta?.nodeLabels.get(ref.nodeId),
      })
      out.set(ref.fileId, list)
    }
    return out
  }

  async findOne(id: string) {
    const f = await this.prisma.fileRecord.findUnique({ where: { id } })
    if (!f) throw new NotFoundException(`File ${id} not found`)
    return f
  }

  async listVersions(id: string) {
    const f = await this.findOne(id)
    // RAW (unattached) files have null iterationId/nodeSourceId, which Prisma
    // compiles to `IS NULL`, collapsing the sibling query to "every raw file
    // of this name in the bucket" → a cross-partner metadata leak. Raw files are
    // single-version (UUID-namespaced path), so short-circuit to just this record.
    if (f.attachmentKind === 'RAW' || (!f.iterationId && !f.nodeSourceId)) {
      return [f]
    }
    return this.prisma.fileRecord.findMany({
      where: {
        bucket: f.bucket,
        iterationId: f.iterationId,
        nodeSourceId: f.nodeSourceId,
        filename: f.filename,
      },
      orderBy: { version: 'asc' },
    })
  }

  async getDownloadStream(id: string, version?: number) {
    const f = await this.findOne(id)
    let storagePath = f.path
    let contentHash = f.contentHash

    if (version !== undefined && version !== f.version) {
      const specific = await this.prisma.fileRecord.findFirst({
        where: { bucket: f.bucket, iterationId: f.iterationId, nodeSourceId: f.nodeSourceId, filename: f.filename, version },
      })
      if (!specific) throw new NotFoundException(`Version ${version} not found`)
      storagePath = specific.path
      contentHash = specific.contentHash
    }

    const stream = await this.storage.readStream(storagePath)
    return { stream, contentType: f.contentType, filename: f.filename, contentHash }
  }

  async saveUpload(
    opts: SaveFileOptions & {
      classification?: string
      pathKind?: PathKind
      /** Email of the human uploader — recorded as PROV-O USER agent for MANUAL/INGESTED. */
      requesterEmail?: string
    },
  ) {
    // Authoritative classification — derived from the frozen state-machine
    // version's NodeOutputDef.defaultClassification. The partner uploading does
    // not get to choose: any value passed in opts.classification is ignored so
    // the classification ladder is fully decided by the workflow author.
    const resolvedClassification = await this.resolveDefaultClassification(
      opts.iterationId,
      opts.nodeId,
      opts.nodeOutputId,
    )
    // Structured partner attribution. Priority:
    //   1) the responsible partner declared on the frozen node-def
    //   2) the uploader's own partnerId
    const resolvedPartnerId = await this.resolveAttributionPartnerId(
      opts.iterationId,
      opts.nodeId,
      opts.requesterEmail,
    )
    const saved = await this.storage.save({
      ...opts,
      classification: resolvedClassification,
      partnerId: resolvedPartnerId,
    })

    // Update NodeRuntimeState.outputsJson so predecessors can resolve this slot
    // deterministically. We do this inline (no cross-module call) because
    // IterationsModule already imports FilesModule one-way.
    if (opts.pathKind === 'nodes' || opts.pathKind === undefined) {
      if (opts.iterationId && opts.nodeId) {
        const outputKey = opts.nodeOutputId ?? 'default'
        const state = await this.prisma.nodeRuntimeState.findUnique({
          where: { iterationId_nodeId: { iterationId: opts.iterationId, nodeId: opts.nodeId } },
        })
        if (state) {
          let outputs: Record<string, string[]> = {}
          if (state.outputsJson) {
            try { outputs = JSON.parse(state.outputsJson) } catch { outputs = {} }
          }
          // Cardinality is enforced when the node author marks an output ONE/MANY,
          // but at this point we don't have the FlowNodeDef handy. Default to MANY
          // semantics (append + dedupe) — the engine validates required outputs
          // at completion time, and ONE outputs typically have just one file
          // because the UI prevents duplicate uploads.
          const current = outputs[outputKey] ?? []
          outputs[outputKey] = Array.from(new Set([...current, saved.id]))
          await this.prisma.nodeRuntimeState.update({
            where: { iterationId_nodeId: { iterationId: opts.iterationId, nodeId: opts.nodeId } },
            data: { outputsJson: JSON.stringify(outputs) },
          })

          // PROV-O — for human-driven uploads, record the uploader as a USER
          // agent and link it to the node activity. Mirrors what
          // BaseNodeHandler does for HANDLER agents on AUTOMATIC nodes; we only
          // overwrite when the activity has no agent yet, so an existing
          // HANDLER attribution is preserved.
          if (
            opts.requesterEmail &&
            (opts.uploadType === 'MANUAL' || opts.uploadType === 'INGESTED') &&
            !state.provenanceAgentId
          ) {
            await this.linkUserAgent(opts.iterationId, opts.nodeId, opts.requesterEmail)
          }
        }
      }
    }

    // Fire file_saved so enrichment / indexing listeners can react.
    this.broker.emit({
      type: 'file_saved',
      iterationId: opts.iterationId,
      payload: {
        fileId: saved.id,
        filename: saved.filename,
        contentType: saved.contentType,
        nodeId: opts.nodeId,
        nodeOutputId: opts.nodeOutputId,
      },
    })
    return saved
  }

  /**
   * Store a RAW (unattached) file uploaded outside any iteration/node
   * (e.g. from the File Explorer). Attribution = the real uploader's partner.
   * Classification is capped at PARTNER (no workflow author to justify
   * CONFIDENTIAL/RESTRICTED); anything higher is coerced to INTERNAL.
   */
  async saveRawUpload(opts: {
    filename: string
    data: Buffer
    contentType: string
    classification?: string
    requester: { id: string; role: Role; partnerId?: string | null; email?: string }
    bucket?: string
  }) {
    let cls = opts.classification ?? 'INTERNAL'
    if (CLASSIFICATION_RANK[cls] === undefined || CLASSIFICATION_RANK[cls] > CLASSIFICATION_RANK.PARTNER) {
      cls = 'INTERNAL'
    }
    const saved = await this.storage.saveRaw({
      bucket: opts.bucket ?? 'digital-thread',
      filename: opts.filename,
      data: opts.data,
      contentType: opts.contentType,
      classification: cls,
      partnerId: opts.requester.partnerId ?? null,
      sourceInfo: opts.requester.email ? `User: ${opts.requester.email}` : 'Raw upload',
    })
    // Fire file_saved so enrichment / indexing listeners can react.
    // Raw files have no iteration — emit on the 'raw' channel + global.
    this.broker.emit({
      type: 'file_saved',
      iterationId: 'raw',
      payload: { fileId: saved.id, filename: saved.filename, contentType: saved.contentType, raw: true },
    })
    return saved
  }

  /**
   * Find-or-create a USER `ProvenanceAgent` for `email` and attach it to the
   * given node's runtime state, plus set a human-readable `transformationLabel`.
   * Best-effort: any failure is swallowed so the calling upload is never blocked
   * by provenance bookkeeping.
   *
   * Uses find-then-create (not upsert) because `ProvenanceAgent` rows are
   * immutable — the SQLite trigger blocks UPDATE so an `upsert(update: {})`
   * would abort on every re-upload by the same user.
   */
  private async linkUserAgent(iterationId: string, nodeId: string, email: string) {
    try {
      let agent = await this.prisma.provenanceAgent.findUnique({
        where: { name_version: { name: email, version: 'human' } },
      })
      if (!agent) {
        try {
          agent = await this.prisma.provenanceAgent.create({
            data: { agentType: 'USER', name: email, version: 'human' },
          })
        } catch {
          // Race: another concurrent upload by the same user created the row first.
          agent = await this.prisma.provenanceAgent.findUnique({
            where: { name_version: { name: email, version: 'human' } },
          })
        }
      }
      if (!agent) return
      await this.prisma.nodeRuntimeState.update({
        where: { iterationId_nodeId: { iterationId, nodeId } },
        data: {
          provenanceAgentId: agent.id,
          transformationLabel: `Manual upload by ${email}`,
        },
      })
    } catch {
      // ignore — provenance enrichment must never break uploads
    }
  }

  /**
   * Resolve the partner attributed to a file upload.
   *
   * Provenance/lineage MUST follow the ACTUAL uploader, not the
   * partner(s) declared on the node in the state machine. So the priority is:
   *   1) the uploader's OWN partner (the real human who uploaded) — primary,
   *      and the only correct choice for multi-partner nodes.
   *   2) the responsible partner declared on the frozen node-def — fallback
   *      ONLY for non-human uploads (automatic handlers with no requesterEmail);
   *      for a multi-partner node we take the first declared partner.
   * Returns null when neither is known.
   */
  private async resolveAttributionPartnerId(
    iterationId: string,
    nodeId: string,
    requesterEmail?: string,
  ): Promise<string | null> {
    // 1) The REAL uploader's own partner — wins for any human upload.
    if (requesterEmail) {
      const u = await this.prisma.user.findUnique({
        where: { email: requesterEmail },
        select: { partnerId: true },
      })
      if (u?.partnerId) return u.partnerId
    }
    // 2) Fallback — responsible partner on the frozen node-def (handler uploads).
    try {
      const iter = await this.prisma.iteration.findUnique({
        where: { id: iterationId },
        include: { stateMachineVersion: true, machine: true },
      })
      const json = iter?.stateMachineVersion?.nodesJson ?? iter?.machine?.nodesJson ?? null
      if (json) {
        const def = normalizeNodesJson(json).find((n) => n.id === nodeId)
        const firstId = def?.responsiblePartnerIds?.[0]
        if (firstId) return firstId
        if (def?.responsiblePartner) {
          const p = await this.prisma.partner.findUnique({ where: { name: def.responsiblePartner } })
          if (p) return p.id
        }
      }
    } catch {
      // ignore — attribution is best-effort
    }
    return null
  }

  async remove(id: string) {
    const f = await this.findOne(id)
    await this.storage.delete(f.path)
    await this.prisma.fileRecord.delete({ where: { id } })
  }

  /**
   * Classification × role access matrix.
   *
   * | Role / level         | PUBLIC | INTERNAL | PARTNER             | CONFIDENTIAL | RESTRICTED |
   * |----------------------|--------|----------|---------------------|--------------|------------|
   * | SUPERADMIN / OWNER   |  ✅    |  ✅      |  ✅                 |   ✅         |   ✅       |
   * | OPERATOR             |  ✅    |  ✅      |  ✅ (scope-gated)   |   🔒         |   🔒       |
   *
   * Practical reading (the PARTNER column above is the file *classification* level;
   * the OPERATOR row is the *role*, distinct from the PARTNER classification level):
   *   - PUBLIC      → any authenticated user (no scope check) — release-ready artefacts
   *   - INTERNAL    → any consortium partner (no scope check) — routine workflow artefacts
   *   - PARTNER (classification) → scope-gated for OPERATOR: file produced by their own
   *                   node OR consumed as PREDECESSOR input by one of their nodes
   *   - CONFIDENTIAL / RESTRICTED → SUPERADMIN/OWNER only; OPERATOR blocked outright
   */
  /**
   * Soft variant of assertReadable — returns a boolean instead of throwing.
   * Used to scope list views (File Explorer) to exactly what the requester
   * may download, keeping list visibility consistent with the download gate.
   */
  async canRead(file: FileRecord, requester: { id: string; role: Role; partnerId?: string }): Promise<boolean> {
    try {
      await this.assertReadable(file, requester)
      return true
    } catch {
      return false
    }
  }

  async assertReadable(file: FileRecord, requester: { id: string; role: Role; partnerId?: string }) {
    if (!requester) throw new ForbiddenException('No authenticated user')
    // Staff bypass — they see everything.
    if (requester.role === ROLE.SUPERADMIN || requester.role === ROLE.OWNER) return
    if (requester.role !== ROLE.OPERATOR) throw new ForbiddenException('Unknown role')

    // Explicit grant bypass — if an OWNER/SUPERADMIN has already approved this
    // partner's request for this file, honour the grant regardless of
    // classification or scope. Grant expiry (`grantExpiresAt`) is checked here.
    if (requester.id && (await this.hasActiveGrant(file.id, requester.id))) return

    const cls = file.classification ?? 'INTERNAL'
    const rank = CLASSIFICATION_RANK[cls] ?? CLASSIFICATION_RANK.INTERNAL

    // CONFIDENTIAL / RESTRICTED → hard block for OPERATOR role.
    if (rank > CLASSIFICATION_RANK.PARTNER) {
      throw new ForbiddenException(
        `File classification ${cls} not visible to PARTNER role — request via approval workflow.`,
      )
    }

    // PUBLIC → any authenticated user, no scope check.
    if (rank === CLASSIFICATION_RANK.PUBLIC) return

    // INTERNAL → any consortium partner, no scope check (visible across the
    // workflow to all stakeholders, no IP-tied restriction).
    if (rank === CLASSIFICATION_RANK.INTERNAL) return

    // OPERATOR → scope-gated. The partner must either own the source node OR
    // have one of their own nodes declare this file as a PREDECESSOR input.
    if (!requester.partnerId) throw new ForbiddenException('OPERATOR user without partnerId')

    // RAW (unattached) files have no node/iteration scope: gate them
    // by the owning partner recorded at upload (the real uploader's partner).
    if (!file.iterationId) {
      if (file.partnerId && file.partnerId === requester.partnerId) return
      throw new ForbiddenException('Raw file is owned by another partner')
    }

    const iter = await this.prisma.iteration.findUnique({
      where: { id: file.iterationId },
      include: { machine: true, stateMachineVersion: true },
    })
    if (!iter) throw new ForbiddenException('Iteration not found')
    const partner = await this.prisma.partner.findUnique({ where: { id: requester.partnerId } })
    if (!partner) throw new ForbiddenException('Partner not found')

    // Partner-scope check reads the FROZEN workflow definition of
    // this iteration (not the live head), and is multi-partner aware.
    const sourceJson = iter.stateMachineVersion?.nodesJson ?? iter.machine?.nodesJson ?? '[]'
    const nodes = normalizeNodesJson(sourceJson)
    const ownsBy = (n: (typeof nodes)[number]) =>
      (n.responsiblePartnerIds ?? []).includes(partner.id) ||
      n.responsiblePartner === partner.name

    // Rule (a) — file produced by a node assigned to the partner.
    const ownNodeIds = new Set(nodes.filter(ownsBy).map((n) => n.id))
    if (file.nodeSourceId && ownNodeIds.has(file.nodeSourceId)) return

    // Rule (b) — file referenced as a PREDECESSOR input on one of partner's nodes.
    const fileOutputSlot = file.nodeOutputId ?? 'default'
    for (const n of nodes) {
      if (!ownsBy(n)) continue
      const inputs: any[] = Array.isArray(n.inputs)
        ? n.inputs
        : Array.isArray(n?.config?.inputs)
          ? n.config.inputs
          : []
      for (const inp of inputs) {
        const src = inp?.source
        if (src && typeof src === 'object' && src.kind === 'PREDECESSOR') {
          const fromNodeId = src.from?.nodeId
          const fromOutputId = src.from?.outputId ?? 'default'
          if (fromNodeId === file.nodeSourceId && fromOutputId === fileOutputSlot) {
            return
          }
        }
      }
    }

    throw new ForbiddenException(
      'PARTNER-classified file not accessible — neither produced by your partner nor declared as input on one of your nodes.',
    )
  }

  /**
   * Write-side partner-scope assertion for uploads. Verifies the target
   * iteration and node exist and that the requester may write to that node.
   * SUPERADMIN / OWNER bypass partner scope; an OPERATOR may only write to nodes
   * assigned to its own partner. Throws NotFound / Forbidden otherwise.
   *
   * When `nodeOutputId` is provided, resolves and returns the
   * declared file-extension whitelist for that output (or undefined if no
   * whitelist is declared). The caller is expected to gate the upload with
   * assertAcceptedExtension(filename, whitelist).
   */
  async assertWritable(
    iterationId: string,
    nodeId: string,
    requester: { id?: string; role: Role; partnerId?: string },
    nodeOutputId?: string,
  ): Promise<string[] | undefined> {
    if (!requester) throw new ForbiddenException('No authenticated user')

    const iter = await this.prisma.iteration.findUnique({
      where: { id: iterationId },
      include: { machine: true, stateMachineVersion: true },
    })
    if (!iter) throw new NotFoundException(`Iteration ${iterationId} not found`)

    // Write-scope check uses the iteration's frozen workflow.
    const sourceJson = iter.stateMachineVersion?.nodesJson ?? iter.machine.nodesJson ?? '[]'
    const nodes: any[] = JSON.parse(sourceJson || '[]')
    const node = nodes.find((n: any) => n.id === nodeId)
    if (!node) throw new NotFoundException(`Node ${nodeId} not found in iteration ${iterationId}`)

    // Resolve the output's accepted extensions (legacy nodes may carry the
    // whitelist under config.outputs[] or be missing it entirely).
    let acceptedExtensions: string[] | undefined
    if (nodeOutputId) {
      const outputs: any[] = Array.isArray(node.outputs)
        ? node.outputs
        : Array.isArray(node?.config?.outputs)
        ? node.config.outputs
        : []
      const out = outputs.find((o: any) => o?.id === nodeOutputId)
      if (out && Array.isArray(out.fileTypes) && out.fileTypes.length > 0) {
        acceptedExtensions = out.fileTypes.map((e: unknown) => String(e))
      }
    }

    if (requester.role === ROLE.SUPERADMIN || requester.role === ROLE.OWNER) return acceptedExtensions
    if (requester.role !== ROLE.OPERATOR) throw new ForbiddenException('Unknown role')

    if (!requester.partnerId) throw new ForbiddenException('OPERATOR user without partnerId')
    const partner = await this.prisma.partner.findUnique({ where: { id: requester.partnerId } })
    if (!partner) throw new ForbiddenException('Partner not found')
    // Multi-partner: accept the new responsiblePartnerIds[] array,
    // the legacy single responsiblePartnerId, or the legacy partner-name match.
    const ownByIds = Array.isArray(node.responsiblePartnerIds) && node.responsiblePartnerIds.includes(partner.id)
    const ownById = node.responsiblePartnerId && node.responsiblePartnerId === partner.id
    const ownByName = node.responsiblePartner && node.responsiblePartner === partner.name
    if (!ownByIds && !ownById && !ownByName) {
      throw new ForbiddenException('You may only upload to nodes assigned to your partner')
    }
    return acceptedExtensions
  }

  /**
   * Resolve the authoritative classification level for a given output slot of
   * a node within an iteration. Reads the iteration's FROZEN state-machine
   * version so subsequent edits to the live head do not retroactively
   * change classifications on already-running iterations. Falls back to
   * `INTERNAL` when no `defaultClassification` is declared.
   */
  async resolveDefaultClassification(
    iterationId: string,
    nodeId: string,
    nodeOutputId: string | undefined,
  ): Promise<string> {
    const iter = await this.prisma.iteration.findUnique({
      where: { id: iterationId },
      include: { machine: true, stateMachineVersion: true },
    })
    if (!iter) return 'INTERNAL'
    const sourceJson = iter.stateMachineVersion?.nodesJson ?? iter.machine.nodesJson ?? '[]'
    let nodes: any[] = []
    try { nodes = JSON.parse(sourceJson || '[]') } catch { nodes = [] }
    const node = nodes.find((n: any) => n.id === nodeId)
    if (!node) return 'INTERNAL'
    const outputs: any[] = Array.isArray(node.outputs)
      ? node.outputs
      : Array.isArray(node?.config?.outputs)
        ? node.config.outputs
        : []
    const slotId = nodeOutputId ?? 'default'
    const out = outputs.find((o: any) => o?.id === slotId)
    const cls = out?.defaultClassification
    if (typeof cls === 'string' && CLASSIFICATION_RANK[cls] !== undefined) return cls
    return 'INTERNAL'
  }

  /**
   * Check whether the requester has an active (APPROVED + not-expired) read
   * grant on the given file via the FileAccessRequest workflow. Used by
   * assertReadable to bypass the normal classification/scope gate when an
   * OWNER/SUPERADMIN has explicitly granted access.
   */
  private async hasActiveGrant(fileId: string, requesterId: string): Promise<boolean> {
    const now = new Date()
    const grant = await this.prisma.fileAccessRequest.findFirst({
      where: {
        fileId,
        requesterId,
        status: 'APPROVED',
        OR: [{ grantExpiresAt: null }, { grantExpiresAt: { gt: now } }],
      },
    })
    return grant !== null
  }

  async recordAccess(input: { userId: string; resourceId: string; action: 'VIEW' | 'DOWNLOAD' | 'EXPORT'; classification?: string }) {
    await this.prisma.accessLog.create({
      data: {
        userId: input.userId,
        resourceType: 'FileRecord',
        resourceId: input.resourceId,
        action: input.action,
        classification: input.classification,
      },
    })
  }
}
