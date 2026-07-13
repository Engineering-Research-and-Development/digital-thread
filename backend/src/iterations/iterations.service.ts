import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { WorkflowEngineService } from './workflow-engine.service'
import { normalizeNodesJson } from './normalize-node'
import type { NodeInputStatusesMap, NodeOutputsMap } from './types/flow-node'
import { ROLE } from '@/auth/roles'
import { v4 as uuidv4 } from 'uuid'

export interface IterationRequester {
  id: string
  role: string
  partnerId?: string | null
}

@Injectable()
export class IterationsService {
  private readonly logger = new Logger(IterationsService.name)

  constructor(
    private prisma: PrismaService,
    private engine: WorkflowEngineService,
  ) {}

  async findAll(opts: {
    machineId?: string
    productId?: string
    /** Filter by the iteration's component reference (URN) stored in metadataJson.componentRef. */
    componentRef?: string
    status?: string
    page?: number
    limit?: number
    requester?: IterationRequester
  } = {}) {
    const { machineId, productId, componentRef, status, requester } = opts
    // Clamp pagination so external callers can't break it: page < 1 would make
    // `skip` negative (Prisma errors; `slice(-n, 0)` silently returns []).
    const page = Math.max(1, Math.floor(opts.page ?? 1))
    const limit = Math.min(Math.max(1, Math.floor(opts.limit ?? 50)), 200)
    const where: any = {}
    if (machineId) where.machineId = machineId
    if (productId) where.productId = productId
    // componentRef lives inside the metadataJson string (JSON.stringify output,
    // no spaces). Match the exact `"componentRef":"<value>"` pair — the trailing
    // quote bounds it so `urn:x` does not also match `urn:x2`.
    if (componentRef) where.metadataJson = { contains: `"componentRef":"${componentRef}"` }
    // Filter by status BEFORE paginating (else a status filter applied to a
    // single page misses matching rows on other pages).
    if (status) where.status = status
    const skip = (page - 1) * limit
    const include = {
      machine: true,
      stateMachineVersion: true,
      ownerPartner: { select: { id: true, name: true, country: true } },
      product: { select: { id: true, urn: true, name: true } },
    } as const

    // Row scope for partner-bound roles (OWNER + OPERATOR): visible when their
    // partner OWNS the iteration OR is responsible on any node. SUPERADMIN sees
    // everything. The node-responsibility check reads the iteration's frozen
    // workflow version and lives in nodesJson, so it CANNOT be expressed in
    // SQL — for partner-scoped roles we must filter BEFORE paginating, else
    // pages get consumed by hidden rows and `total` is wrong.
    const isPartnerScoped = !!requester && requester.role !== ROLE.SUPERADMIN

    let items: any[]
    let total: number
    if (!isPartnerScoped) {
      const [rows, count] = await Promise.all([
        this.prisma.iteration.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' }, include }),
        this.prisma.iteration.count({ where }),
      ])
      items = rows
      total = count
    } else {
      const partner = requester!.partnerId
        ? await this.prisma.partner.findUnique({ where: { id: requester!.partnerId } })
        : null
      const partnerName = partner?.name
      const partnerId = partner?.id
      const all = await this.prisma.iteration.findMany({ where, orderBy: { createdAt: 'desc' }, include })
      const visible = all.filter((it) => {
        if (partnerId && it.ownerPartnerId === partnerId) return true
        const sourceJson = it.stateMachineVersion?.nodesJson ?? it.machine?.nodesJson ?? null
        const nodes = normalizeNodesJson(sourceJson)
        return nodes.some(
          (n) =>
            (partnerId != null && (n.responsiblePartnerIds ?? []).includes(partnerId)) ||
            n.responsiblePartner === partnerName,
        )
      })
      total = visible.length
      items = visible.slice(skip, skip + limit)
    }

    // Strip the heavy `machine` + `stateMachineVersion.nodesJson` payload from
    // the list response; the client refetches them via /iterations/:id when
    // needed. Keep a small version summary so the badge has data to render.
    const stripped = items.map(({ machine: _m, stateMachineVersion, ...rest }) => ({
      ...rest,
      version: stateMachineVersion
        ? {
            id: stateMachineVersion.id,
            versionNumber: stateMachineVersion.versionNumber,
            versionLabel: stateMachineVersion.versionLabel,
          }
        : null,
    }))
    return { items: stripped, total }
  }

  async findOne(id: string) {
    // Self-healing — if the global iteration status disagrees with the
    // per-node states (e.g. a stale COMPLETED flag with a PENDING node
    // left behind by a past bug), reconcile silently before serving the
    // response. Idempotent and cheap (one read + at most one write).
    await this.reconcileIterationStatus(id)

    const it = await this.prisma.iteration.findUnique({
      where: { id },
      include: {
        nodeStates: true,
        timelineEvents: { orderBy: { timestamp: 'asc' } },
        stateMachineVersion: true,
        ownerPartner: { select: { id: true, name: true, country: true } },
        product: { select: { id: true, urn: true, name: true } },
      },
    })
    if (!it) throw new NotFoundException(`Iteration ${id} not found`)
    // Surface the frozen workflow snapshot + version metadata so the frontend
    // renders the canvas from the iteration's own definition, never from the
    // live head. Strip the heavy raw JSON columns since we've already parsed
    // them into `snapshotNodes`/`snapshotEdges`.
    const { stateMachineVersion, ...rest } = it as any
    const versionSummary = stateMachineVersion
      ? {
          id: stateMachineVersion.id,
          versionNumber: stateMachineVersion.versionNumber,
          versionLabel: stateMachineVersion.versionLabel,
          createdAt: stateMachineVersion.createdAt,
        }
      : null
    const snapshotNodes = stateMachineVersion?.nodesJson
      ? this.tryParse(stateMachineVersion.nodesJson)
      : []
    const snapshotEdges = stateMachineVersion?.edgesJson
      ? this.tryParse(stateMachineVersion.edgesJson)
      : []
    // Surface the FROZEN visual groups so the iteration canvas can mirror the
    // editor's organisation (groups are traced with the version).
    const snapshotGroups = stateMachineVersion?.groupsJson
      ? this.tryParse(stateMachineVersion.groupsJson)
      : []
    return {
      ...rest,
      version: versionSummary,
      snapshotNodes,
      snapshotEdges,
      snapshotGroups,
    }
  }

  private tryParse(json: string): any[] {
    try {
      const v = JSON.parse(json)
      return Array.isArray(v) ? v : []
    } catch { return [] }
  }

  /**
   * Self-healing — re-derive `Iteration.status` from the current node
   * states + the iteration's frozen workflow snapshot. Rules:
   *   - If any node is in ERROR/SKIPPED/COMPLETED → terminal-only path: if ALL
   *     snapshot nodes are terminal, finalise as COMPLETED (or FAILED if any
   *     ERROR). Otherwise leave RUNNING.
   *   - If the iteration was wrongly marked COMPLETED but at least one snapshot
   *     node is still IDLE/PENDING/RUNNING, demote back to RUNNING.
   * Idempotent — running on a healthy iteration is a no-op.
   */
  private async reconcileIterationStatus(iterationId: string) {
    const it = await this.prisma.iteration.findUnique({
      where: { id: iterationId },
      include: { stateMachineVersion: true, machine: true },
    })
    if (!it) return

    const sourceJson = it.stateMachineVersion?.nodesJson ?? it.machine?.nodesJson
    if (!sourceJson) return
    let nodes: any[]
    try { nodes = JSON.parse(sourceJson) } catch { return }
    if (!Array.isArray(nodes) || nodes.length === 0) return

    const states = await this.prisma.nodeRuntimeState.findMany({
      where: { iterationId },
    })
    const stateByNodeId = new Map(states.map((s) => [s.nodeId, s.status]))

    // Only look at nodes that exist in the snapshot — orphan NodeRuntimeStates
    // from edits made before workflow-version pinning was introduced are ignored here.
    const snapshotStatuses = nodes.map((n: any) => stateByNodeId.get(n.id) ?? 'IDLE')
    const allTerminal = snapshotStatuses.every(
      (s) => s === 'COMPLETED' || s === 'SKIPPED' || s === 'ERROR',
    )
    const anyError = snapshotStatuses.includes('ERROR')

    const derived = allTerminal
      ? (anyError ? 'FAILED' : 'COMPLETED')
      : 'RUNNING'

    if (it.status === derived) return // healthy, nothing to do

    this.logger.warn(
      `Reconciling iteration ${iterationId}: status was "${it.status}", recomputed "${derived}" ` +
        `(snapshot nodes=${nodes.length}, terminal=${snapshotStatuses.filter((s) => s === 'COMPLETED' || s === 'SKIPPED' || s === 'ERROR').length})`,
    )
    await this.prisma.iteration.update({
      where: { id: iterationId },
      data: {
        status: derived,
        // Clear completedAt when demoting back to RUNNING; set it if newly terminal.
        completedAt:
          derived === 'RUNNING'
            ? null
            : (it.completedAt ?? new Date()),
      },
    })
  }

  async create(
    data: {
      machineId: string
      metadata?: Record<string, string>
      classification?: string
      ownerPartnerId?: string
      productId?: string
    },
    requester: IterationRequester,
  ) {
    const machine = await this.prisma.stateMachine.findUnique({ where: { id: data.machineId } })
    if (!machine) throw new NotFoundException(`StateMachine ${data.machineId} not found`)

    // Every iteration is owned by a Partner. OWNER → own partner; SUPERADMIN →
    // must explicitly pick the owning partner.
    const ownerPartnerId = await this.resolveOwnerPartner(data.ownerPartnerId, requester)

    // Snapshot the LATEST version of the state machine. The iteration is
    // bound to this immutable row; subsequent edits to the parent create new
    // versions and do NOT affect this run.
    const latestVersion = await this.prisma.stateMachineVersion.findFirst({
      where: { stateMachineId: data.machineId },
      orderBy: { versionNumber: 'desc' },
    })
    if (!latestVersion) {
      throw new NotFoundException(
        `StateMachine ${data.machineId} has no versions — backfill required (see scripts/backfill-iteration-versions.ts).`,
      )
    }

    // Optional Product link. Must belong to the same owning partner. Its urn
    // is mirrored into metadata.componentRef so the legacy ComponentPassport/DPP
    // (componentRef-based) keep resolving.
    const metadata: Record<string, string> = { ...(data.metadata ?? {}) }
    let productId: string | null = null
    if (data.productId) {
      const product = await this.prisma.product.findUnique({ where: { id: data.productId } })
      if (!product) throw new BadRequestException(`Product ${data.productId} not found`)
      if (product.ownerPartnerId !== ownerPartnerId) {
        throw new BadRequestException('Product belongs to a different partner than the iteration owner')
      }
      productId = product.id
      if (!metadata.componentRef) metadata.componentRef = product.urn
    }

    const nodes = normalizeNodesJson(latestVersion.nodesJson)
    const edges = JSON.parse(latestVersion.edgesJson || '[]')
    const count = await this.prisma.iteration.count({ where: { machineId: data.machineId } })
    const displayId = `${machine.name.replace(/\s+/g, '-').toLowerCase()}-${String(count + 1).padStart(4, '0')}`

    const iteration = await this.prisma.iteration.create({
      data: {
        id: uuidv4(),
        displayId,
        machineId: data.machineId,
        machineName: machine.name,
        stateMachineVersionId: latestVersion.id,
        ownerPartnerId,
        productId,
        status: 'RUNNING',
        metadataJson: JSON.stringify(metadata),
        classification: data.classification ?? 'INTERNAL',
      },
    })

    await this.engine.initNodeStates(iteration.id, nodes)

    // Activate first nodes (TRIGGER or nodes with no predecessors)
    const targetNodeIds = new Set(edges.map((e: any) => e.target))
    const startNodes = nodes.filter((n: any) => !targetNodeIds.has(n.id))
    for (const n of startNodes) {
      await this.engine.updateNodeStatus(iteration.id, n.id, 'PENDING')
    }

    await this.engine.addTimelineEvent({
      iterationId: iteration.id,
      nodeId: 'system',
      nodeLabel: 'System',
      partner: 'System',
      action: 'ITERATION_STARTED',
      detail: `Iteration ${displayId} created against v${latestVersion.versionNumber}`,
    })

    return this.findOne(iteration.id)
  }

  /**
   * Resolve the owning Partner for a new iteration.
   *   OWNER       → forced to their own partner.
   *   SUPERADMIN  → must explicitly supply the owning partner.
   */
  private async resolveOwnerPartner(
    requested: string | undefined,
    requester: IterationRequester,
  ): Promise<string> {
    if (requester.role === ROLE.SUPERADMIN) {
      if (!requested) throw new BadRequestException('An owning partner (ownerPartnerId) is required')
      const p = await this.prisma.partner.findUnique({ where: { id: requested } })
      if (!p) throw new BadRequestException(`Owner partner ${requested} not found`)
      return requested
    }
    if (requester.role === ROLE.OWNER) {
      if (!requester.partnerId) throw new ForbiddenException('OWNER account must belong to a partner')
      return requester.partnerId
    }
    throw new ForbiddenException('Only SUPERADMIN or OWNER can start iterations')
  }

  /**
   * Load the workflow definition (nodes + edges) frozen for this iteration.
   * Reads from StateMachineVersion (immutable); never from the head
   * StateMachine row. Falls back to the head row only if the iteration has no
   * version pointer yet (legacy records predating version pinning — should be
   * 0 after backfill).
   */
  async loadIterationFlow(iterationId: string): Promise<{
    nodes: any[]
    edges: any[]
    versionNumber: number | null
    versionLabel: string | null
  }> {
    const iter = await this.prisma.iteration.findUnique({
      where: { id: iterationId },
      include: { stateMachineVersion: true, machine: true },
    })
    if (!iter) throw new NotFoundException(`Iteration ${iterationId} not found`)
    if (iter.stateMachineVersion) {
      return {
        nodes: normalizeNodesJson(iter.stateMachineVersion.nodesJson),
        edges: JSON.parse(iter.stateMachineVersion.edgesJson || '[]'),
        versionNumber: iter.stateMachineVersion.versionNumber,
        versionLabel: iter.stateMachineVersion.versionLabel,
      }
    }
    // Legacy fallback — should be cleared by the backfill script.
    if (!iter.machine) throw new NotFoundException('Machine not found')
    return {
      nodes: normalizeNodesJson(iter.machine.nodesJson),
      edges: JSON.parse(iter.machine.edgesJson || '[]'),
      versionNumber: null,
      versionLabel: null,
    }
  }

  async remove(id: string) {
    await this.findOne(id)
    await this.prisma.iteration.delete({ where: { id } })
  }

  /**
   * Fork a NEW iteration starting at `fromNodeId`. The source iteration is
   * left UNTOUCHED. The new iteration inherits the source's frozen
   * StateMachineVersion and pre-populates the runtime states of all
   * predecessors of `fromNodeId` with the source's values — including
   * `outputsJson` (which carries the FileRecord ids produced upstream).
   * `fromNodeId` is set to PENDING; its successors stay IDLE. The new
   * iteration tracks its origin via `parentIterationId` + `restartFromNodeId`.
   *
   * No FileRecord rows are duplicated — the new iteration's predecessor
   * states reference the source iteration's files directly, so the partner
   * downloading them sees the same artefacts (and partner-scope access still
   * resolves because both iterations share the same frozen workflow).
   */
  async restart(id: string, fromNodeId: string) {
    const source = await this.prisma.iteration.findUnique({
      where: { id },
      include: { stateMachineVersion: true, machine: true },
    })
    if (!source) throw new NotFoundException(`Iteration ${id} not found`)

    const { nodes, edges } = await this.loadIterationFlow(id)
    if (!nodes.find((n: any) => n.id === fromNodeId)) {
      throw new BadRequestException(`Node ${fromNodeId} not found in iteration's frozen workflow`)
    }

    // The "reset" set — the restart node itself + its full descendant set.
    // Everything else is an upstream predecessor whose state is inherited.
    const resetSet = new Set(this.collectSuccessors(fromNodeId, nodes, edges))
    const sourceStates = await this.prisma.nodeRuntimeState.findMany({
      where: { iterationId: id },
    })
    const sourceStateMap = new Map(sourceStates.map((s) => [s.nodeId, s]))

    // Derive a unique displayId for the fork using the same scheme as create().
    const existingCount = await this.prisma.iteration.count({
      where: { machineId: source.machineId },
    })
    const displayId = `${source.machineName.replace(/\s+/g, '-').toLowerCase()}-${String(existingCount + 1).padStart(4, '0')}`

    const newIterationId = uuidv4()
    const newIteration = await this.prisma.iteration.create({
      data: {
        id: newIterationId,
        displayId,
        machineId: source.machineId,
        machineName: source.machineName,
        stateMachineVersionId: source.stateMachineVersionId,
        status: 'RUNNING',
        // A fork inherits the source iteration's owner + product.
        ownerPartnerId: source.ownerPartnerId,
        productId: source.productId,
        metadataJson: source.metadataJson,
        classification: source.classification,
        parentIterationId: source.id,
        restartFromNodeId: fromNodeId,
      },
    })

    // Materialise NodeRuntimeState rows: inherit for predecessors, fresh IDLE
    // for the restart node + descendants.
    for (const raw of nodes) {
      const nodeId = (raw as any).id as string
      const src = sourceStateMap.get(nodeId)
      if (!resetSet.has(nodeId) && src) {
        // Inherit upstream state — including outputsJson so PREDECESSOR
        // inputs of the restart node resolve to the same FileRecord ids.
        await this.prisma.nodeRuntimeState.create({
          data: {
            iterationId: newIterationId,
            nodeId,
            status: src.status,
            startedAt: src.startedAt,
            completedAt: src.completedAt,
            logsJson: src.logsJson,
            outputsJson: src.outputsJson,
            outputFilePath: src.outputFilePath,
            errorMessage: src.errorMessage,
            progress: src.progress,
            claimedBy: src.claimedBy,
            inputFileStatusesJson: src.inputFileStatusesJson,
            handlerName: src.handlerName,
            handlerVersion: src.handlerVersion,
            executionParamsJson: src.executionParamsJson,
            provenanceAgentId: src.provenanceAgentId,
          },
        })
      } else {
        await this.prisma.nodeRuntimeState.create({
          data: { iterationId: newIterationId, nodeId, status: 'IDLE', logsJson: '[]' },
        })
      }
    }

    // Activate the restart node through the engine so its
    // inputFileStatusesJson is pre-populated from the inherited predecessor
    // outputs (resolvePredecessorInputs). If the restart node has no
    // predecessors (it IS a start node), set it PENDING directly.
    const restartNode = nodes.find((n: any) => n.id === fromNodeId)!
    const restartInEdges = edges.filter((e: any) => e.target === fromNodeId)
    if (restartInEdges.length === 0) {
      await this.engine.updateNodeStatus(newIterationId, fromNodeId, 'PENDING')
    } else {
      // tryActivate(fromNodeId) runs via advanceWorkflow on any predecessor
      // (they're all COMPLETED in the new iteration's inherited state).
      await this.engine.advanceWorkflow(newIterationId, restartInEdges[0].source, nodes, edges)
    }

    const restartNodeName = (restartNode as any).name ?? (restartNode as any).label ?? fromNodeId
    await this.engine.addTimelineEvent({
      iterationId: newIterationId,
      nodeId: 'system',
      nodeLabel: 'System',
      partner: 'System',
      action: 'ITERATION_FORKED',
      detail: `Forked from ${source.displayId} at node ${restartNodeName}`,
    })
    // Mirror the event on the source iteration so its thread reflects the
    // branch that left from it.
    await this.engine.addTimelineEvent({
      iterationId: source.id,
      nodeId: fromNodeId,
      nodeLabel: restartNodeName,
      partner: 'System',
      action: 'ITERATION_FORK_INITIATED',
      detail: `New iteration ${newIteration.displayId} forked from this point`,
    })

    return this.findOne(newIteration.id)
  }

  async getNodeStates(id: string) {
    const states = await this.prisma.nodeRuntimeState.findMany({ where: { iterationId: id } })
    return { nodeStates: states }
  }

  async claimNode(iterationId: string, nodeId: string, claimedBy: string) {
    const state = await this.getNodeState(iterationId, nodeId)
    if (state.status !== 'PENDING') throw new BadRequestException('Node is not in PENDING state')
    return this.engine.updateNodeStatus(iterationId, nodeId, 'RUNNING', {
      claimedBy,
      startedAt: new Date(),
    })
  }

  async completeNode(iterationId: string, nodeId: string, outputFilePath?: string) {
    await this.findOne(iterationId)

    // A node must be claimed (RUNNING) before it can be completed.
    const state = await this.getNodeState(iterationId, nodeId)
    if (state.status !== 'RUNNING') {
      throw new BadRequestException(
        `Node must be claimed (RUNNING) before completion — current status: ${state.status}`,
      )
    }

    // Refuse completion if any required output has no recorded file. Reads
    // the workflow from the iteration's frozen version (not the live state
    // machine).
    const { nodes, edges } = await this.loadIterationFlow(iterationId)
    const targetNode = nodes.find((n) => n.id === nodeId)
    if (targetNode && targetNode.outputs.length > 0) {
      const outputs: NodeOutputsMap = state.outputsJson
        ? (() => { try { return JSON.parse(state.outputsJson!) } catch { return {} } })()
        : {}
      const missing = targetNode.outputs
        .filter((o: any) => o.required && (!outputs[o.id] || outputs[o.id].length === 0))
        // legacy single-file fallback: outputFilePath fulfils the `default` output
        .filter((o: any) => !(o.id === 'default' && (outputFilePath || state.outputFilePath)))
      if (missing.length > 0) {
        throw new BadRequestException(
          `Required output(s) missing: ${missing.map((o: any) => o.id).join(', ')}`,
        )
      }
    }

    await this.engine.updateNodeStatus(iterationId, nodeId, 'COMPLETED', {
      completedAt: new Date(),
      outputFilePath,
    })

    // Node completion has succeeded and is durable. Workflow advancement is
    // best-effort: if it fails the node stays COMPLETED and the iteration is
    // recoverable via POST /iterations/:id/repair, so a transient error never
    // leaves the run permanently stuck.
    try {
      await this.engine.advanceWorkflow(iterationId, nodeId, nodes, edges)
    } catch (e: any) {
      this.logger.error(
        `advanceWorkflow failed for iteration ${iterationId} node ${nodeId}: ${e?.message}. ` +
          `Node is COMPLETED — run POST /iterations/${iterationId}/repair to recover.`,
      )
    }

    return this.getNodeState(iterationId, nodeId)
  }

  /**
   * Recover an iteration whose workflow advancement failed mid-way: re-run
   * advancement for every COMPLETED node that still has IDLE successors.
   * Idempotent — tryActivate only promotes IDLE nodes.
   */
  async repair(id: string) {
    // Repair operates against the iteration's frozen version.
    await this.findOne(id)
    const { nodes, edges } = await this.loadIterationFlow(id)
    const states = await this.prisma.nodeRuntimeState.findMany({ where: { iterationId: id } })
    const statusByNode: Record<string, string> = Object.fromEntries(
      states.map((s) => [s.nodeId, s.status]),
    )

    let advanced = 0
    for (const state of states) {
      if (state.status !== 'COMPLETED') continue
      const successors = edges
        .filter((e: any) => e.source === state.nodeId)
        .map((e: any) => e.target as string)
      const hasIdleSuccessor = successors.some(
        (t: string) => (statusByNode[t] ?? 'IDLE') === 'IDLE',
      )
      if (!hasIdleSuccessor) continue
      await this.engine.advanceWorkflow(id, state.nodeId, nodes, edges)
      advanced++
    }
    if (advanced > 0) {
      this.logger.log(`Repaired iteration ${id}: re-advanced ${advanced} node(s)`)
    }
    return { repaired: advanced, iteration: await this.findOne(id) }
  }

  async setInputFile(
    iterationId: string,
    nodeId: string,
    inputId: string,
    filePathOrFileIds: string | string[],
  ) {
    const state = await this.getNodeState(iterationId, nodeId)
    const inputStatuses: NodeInputStatusesMap = state.inputFileStatusesJson
      ? (() => { try { return JSON.parse(state.inputFileStatusesJson!) } catch { return {} } })()
      : {}
    const fileIds = Array.isArray(filePathOrFileIds) ? filePathOrFileIds : []
    const filePath = typeof filePathOrFileIds === 'string' ? filePathOrFileIds : undefined
    inputStatuses[inputId] = {
      provided: true,
      resolvedFrom: 'MANUAL',
      ...(fileIds.length ? { fileIds } : {}),
      ...(filePath ? { filePath } : {}),
    }

    await this.prisma.nodeRuntimeState.update({
      where: { iterationId_nodeId: { iterationId, nodeId } },
      data: { inputFileStatusesJson: JSON.stringify(inputStatuses) },
    })
    return this.getNodeState(iterationId, nodeId)
  }

  /**
   * For a node in an iteration, return the list of declared inputs of source
   * kind PREDECESSOR together with the files currently available from the
   * upstream output. Used by the runtime UI to render the "files to
   * download" panel for the responsible partner.
   */
  async listPredecessorOutputs(iterationId: string, nodeId: string) {
    // Read the frozen workflow definition of THIS iteration.
    await this.findOne(iterationId)
    const { nodes } = await this.loadIterationFlow(iterationId)
    const target = nodes.find((n: any) => n.id === nodeId)
    if (!target) throw new NotFoundException(`Node ${nodeId} not found`)

    const predecessorBindings = (target.inputs as any[]).filter(
      (i) => i?.source?.kind === 'PREDECESSOR',
    )
    if (predecessorBindings.length === 0) return { iterationId, nodeId, inputs: [] as any[] }

    const upstreamNodeIds: string[] = Array.from(
      new Set(predecessorBindings.map((i: any) => String(i.source.from.nodeId))),
    )
    const upstreamStates = await this.prisma.nodeRuntimeState.findMany({
      where: { iterationId, nodeId: { in: upstreamNodeIds } },
    })
    const outputsByNode = new Map<string, NodeOutputsMap>()
    const legacyByNode = new Map<string, string | undefined>()
    for (const s of upstreamStates) {
      let parsed: NodeOutputsMap = {}
      if (s.outputsJson) {
        try { parsed = JSON.parse(s.outputsJson) } catch { parsed = {} }
      }
      outputsByNode.set(s.nodeId, parsed)
      legacyByNode.set(s.nodeId, s.outputFilePath ?? undefined)
    }

    const allFileIds = Array.from(
      new Set(
        Array.from(outputsByNode.values()).flatMap((m) => Object.values(m).flat()),
      ),
    )
    const files = allFileIds.length
      ? await this.prisma.fileRecord.findMany({ where: { id: { in: allFileIds } } })
      : []
    const fileById = new Map(files.map((f) => [f.id, f]))

    return {
      iterationId,
      nodeId,
      inputs: predecessorBindings.map((input) => {
        const from = (input.source as any).from as { nodeId: string; outputId: string }
        const upstreamNode = nodes.find((n) => n.id === from.nodeId)
        const upstreamOutput = upstreamNode?.outputs.find((o) => o.id === from.outputId)
        const fileIds = outputsByNode.get(from.nodeId)?.[from.outputId] ?? []
        const legacyPath = legacyByNode.get(from.nodeId)
        const fileEntries = fileIds
          .map((id) => fileById.get(id))
          .filter((f): f is NonNullable<typeof f> => Boolean(f))
          .map((f) => ({
            id: f.id,
            filename: f.filename,
            version: f.version,
            sizeBytes: f.sizeBytes,
            contentType: f.contentType,
            contentHash: f.contentHash,
            timestamp: f.timestamp,
            classification: f.classification,
          }))
        return {
          inputId: input.id,
          inputName: input.name,
          required: input.required,
          cardinality: input.cardinality,
          fileTypes: input.fileTypes,
          from,
          upstreamNodeName: upstreamNode?.name ?? upstreamNode?.label,
          upstreamOutputName: upstreamOutput?.name,
          files: fileEntries,
          // legacy fallback path — exposed for round-trip with pre-migration data
          legacyFilePath: fileEntries.length === 0 && from.outputId === 'default' ? legacyPath : undefined,
        }
      }),
    }
  }

  /**
   * Resolve the files bound to a node's declared OUTPUT slots, for the iteration
   * panel's "Outputs" section. Unlike `GET /files?iterationId&nodeId` (which
   * filters by `FileRecord.iterationId`), this reads the node's authoritative
   * `NodeRuntimeState.outputsJson` and resolves each referenced file **by id** —
   * so files attached from ANOTHER iteration via "link existing" (which keep
   * their origin `iterationId`, see `attachExistingOutput`) AND locked
   * (CONFIDENTIAL/RESTRICTED) files are still surfaced. Without this they vanish
   * from the panel and the partner can never raise a FileAccessRequest on them.
   *
   * The result is unioned with the FileRecords physically attributed to this
   * iteration+node (legacy/normal uploads that may predate outputsJson), deduped
   * by file id. Metadata only — no storage `path` / uploader `sourceInfo` (same
   * minimal shape as `listPredecessorOutputs`). The bytes stay gated by
   * `FilesService.assertReadable` on download; the UI renders "Request access".
   */
  async listNodeOutputs(
    iterationId: string,
    nodeId: string,
    requester?: { role: string; partnerId?: string | null },
  ) {
    const iter = await this.prisma.iteration.findUnique({
      where: { id: iterationId },
      include: { machine: true, stateMachineVersion: true },
    })
    if (!iter) throw new NotFoundException(`Iteration ${iterationId} not found`)

    // ITERATION-level partner scope (NOT node-level): an OPERATOR/OWNER may view
    // a node's outputs as long as their partner is involved in the iteration —
    // INCLUDING nodes owned by OTHER partners. That is the whole point here:
    // requesting access to a previous (not-theirs) node's files. SUPERADMIN
    // bypasses. (PartnerScopeGuard is intentionally NOT used on this route — its
    // :nodeId branch enforces node OWNERSHIP, which would wrongly 403 the viewer.)
    if (requester && requester.role !== ROLE.SUPERADMIN) {
      if (!requester.partnerId) throw new ForbiddenException(`${requester.role} user must have a partnerId`)
      const partner = await this.prisma.partner.findUnique({ where: { id: requester.partnerId } })
      if (!partner) throw new ForbiddenException('Partner not found')
      const frozen = iter.stateMachineVersion?.nodesJson ?? iter.machine?.nodesJson ?? '[]'
      const involved =
        iter.ownerPartnerId === partner.id ||
        normalizeNodesJson(frozen).some(
          (n) =>
            (n.responsiblePartnerIds ?? []).includes(partner.id) ||
            n.responsiblePartner === partner.name,
        )
      if (!involved) throw new ForbiddenException('This iteration is not visible to your partner')
    }

    const state = await this.prisma.nodeRuntimeState.findUnique({
      where: { iterationId_nodeId: { iterationId, nodeId } },
    })
    let outputs: NodeOutputsMap = {}
    if (state?.outputsJson) {
      try { outputs = JSON.parse(state.outputsJson) } catch { outputs = {} }
    }

    const referencedIds = Array.from(
      new Set(
        Object.values(outputs)
          .flat()
          .filter((x): x is string => typeof x === 'string'),
      ),
    )
    const [referenced, direct] = await Promise.all([
      referencedIds.length
        ? this.prisma.fileRecord.findMany({ where: { id: { in: referencedIds } } })
        : Promise.resolve([]),
      this.prisma.fileRecord.findMany({ where: { iterationId, nodeSourceId: nodeId } }),
    ])

    // A referenced file is grouped under its outputsJson slot key; a direct file
    // falls back to its own nodeOutputId (or 'default').
    const slotByFile = new Map<string, string>()
    for (const [slot, ids] of Object.entries(outputs)) {
      for (const id of Array.isArray(ids) ? ids : []) slotByFile.set(id, slot)
    }

    const byId = new Map<string, (typeof direct)[number]>()
    for (const f of [...direct, ...referenced]) byId.set(f.id, f)

    const filesBySlot: Record<string, Array<{
      id: string; filename: string; version: number; sizeBytes: number
      contentType: string; contentHash: string | null; timestamp: Date
      classification: string; nodeOutputId: string
    }>> = {}
    for (const f of byId.values()) {
      const slot = slotByFile.get(f.id) ?? f.nodeOutputId ?? 'default'
      ;(filesBySlot[slot] ||= []).push({
        id: f.id,
        filename: f.filename,
        version: f.version,
        sizeBytes: f.sizeBytes,
        contentType: f.contentType,
        contentHash: f.contentHash,
        timestamp: f.timestamp,
        classification: f.classification,
        nodeOutputId: slot,
      })
    }
    for (const k of Object.keys(filesBySlot)) {
      filesBySlot[k].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    }

    return { iterationId, nodeId, filesBySlot }
  }

  /**
   * Attach an EXISTING FileRecord (e.g. a RAW upload or a file from a
   * previous iteration) as one of this node's outputs, instead of uploading a
   * fresh copy. Appends the fileId to NodeRuntimeState.outputsJson[outputId].
   * No bytes are copied — the same FileRecord is referenced. Records the
   * uploader as a USER provenance agent (real uploader attribution).
   */
  async attachExistingOutput(
    iterationId: string,
    nodeId: string,
    outputId: string,
    fileId: string,
    requesterEmail?: string,
  ) {
    const file = await this.prisma.fileRecord.findUnique({ where: { id: fileId } })
    if (!file) throw new NotFoundException(`File ${fileId} not found`)

    const state = await this.getNodeState(iterationId, nodeId)
    const slot = outputId || 'default'
    let outputs: NodeOutputsMap = {}
    if (state.outputsJson) {
      try { outputs = JSON.parse(state.outputsJson) } catch { outputs = {} }
    }
    const current = outputs[slot] ?? []
    outputs[slot] = Array.from(new Set([...current, fileId]))
    await this.prisma.nodeRuntimeState.update({
      where: { iterationId_nodeId: { iterationId, nodeId } },
      data: { outputsJson: JSON.stringify(outputs) },
    })

    // Re-parent a RAW (unattached) file onto this iteration/node so every
    // node-scoped reader treats it as a first-class output: file lists
    // (where nodeSourceId=nodeId), assertReadable rule (a) (node ownership),
    // lineage edge recording, and PROV-O export (no more `iter:null`). FileRecord
    // is a normal mutable table (no append-only trigger). Files that already
    // belong to another iteration are NOT re-parented (that would steal the
    // origin) — they remain readable via their own node-scope / grant flow.
    if (!file.iterationId) {
      await this.prisma.fileRecord.update({
        where: { id: fileId },
        data: { iterationId, nodeSourceId: nodeId, nodeOutputId: slot, attachmentKind: 'NODE' },
      })
    }

    // Provenance — record the human who linked the file (find-then-create USER agent).
    if (requesterEmail && !state.provenanceAgentId) {
      try {
        let agent = await this.prisma.provenanceAgent.findUnique({
          where: { name_version: { name: requesterEmail, version: 'human' } },
        })
        if (!agent) {
          try {
            agent = await this.prisma.provenanceAgent.create({
              data: { agentType: 'USER', name: requesterEmail, version: 'human' },
            })
          } catch {
            agent = await this.prisma.provenanceAgent.findUnique({
              where: { name_version: { name: requesterEmail, version: 'human' } },
            })
          }
        }
        if (agent) {
          await this.prisma.nodeRuntimeState.update({
            where: { iterationId_nodeId: { iterationId, nodeId } },
            data: {
              provenanceAgentId: agent.id,
              transformationLabel: `Linked existing file by ${requesterEmail}`,
            },
          })
        }
      } catch {
        // best-effort — never block the attach
      }
    }

    await this.engine.addTimelineEvent({
      iterationId,
      nodeId,
      nodeLabel: nodeId,
      partner: requesterEmail ?? 'System',
      action: 'FILE_LINKED',
      detail: `Linked existing file ${file.filename} to output ${slot}`,
    })

    return this.getNodeState(iterationId, nodeId)
  }

  async getTimeline(iterationId: string) {
    const events = await this.prisma.timelineEvent.findMany({
      where: { iterationId },
      orderBy: { timestamp: 'asc' },
    })
    return { events }
  }

  private async getNodeState(iterationId: string, nodeId: string) {
    const s = await this.prisma.nodeRuntimeState.findUnique({
      where: { iterationId_nodeId: { iterationId, nodeId } },
    })
    if (!s) throw new NotFoundException(`Node state ${nodeId} not found in iteration ${iterationId}`)
    return s
  }

  private collectSuccessors(startId: string, nodes: any[], edges: any[]): string[] {
    const visited = new Set<string>()
    const queue = [startId]
    while (queue.length) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)
      const nexts = edges.filter((e: any) => e.source === current).map((e: any) => e.target)
      queue.push(...nexts)
    }
    return Array.from(visited)
  }
}
