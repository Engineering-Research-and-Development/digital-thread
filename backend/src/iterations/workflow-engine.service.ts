import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { EventBrokerService } from '@/events/event-broker.service'
import { ManifestService } from '@/files/manifest.service'
import { LineageService } from '@/lineage/lineage.service'
import { normalizeFlowNode } from './normalize-node'
import type {
  FlowEdgeDef,
  FlowNodeDef,
  NodeInputStatusesMap,
  NodeOutputsMap,
} from './types/flow-node'

export type NodeStatus = 'IDLE' | 'PENDING' | 'RUNNING' | 'COMPLETED' | 'ERROR' | 'SKIPPED'

// Local aliases for engine internals — accept loosely-typed JSON shapes and
// run them through normalizeFlowNode so the engine sees the canonical model.
type FlowNode = FlowNodeDef
type FlowEdge = Pick<FlowEdgeDef, 'source' | 'target' | 'label'>

function asNode(raw: any): FlowNodeDef { return normalizeFlowNode(raw) }

@Injectable()
export class WorkflowEngineService {
  private readonly logger = new Logger(WorkflowEngineService.name)
  constructor(
    private prisma: PrismaService,
    private broker: EventBrokerService,
    private manifest: ManifestService,
    private lineage: LineageService,
  ) {}

  /** Initialises NodeRuntimeState rows for all nodes in a new iteration */
  async initNodeStates(iterationId: string, nodes: any[]) {
    for (const raw of nodes) {
      const n = asNode(raw)
      await this.prisma.nodeRuntimeState.upsert({
        where: { iterationId_nodeId: { iterationId, nodeId: n.id } },
        update: {},
        create: { iterationId, nodeId: n.id, status: 'IDLE', logsJson: '[]' },
      })
    }
  }

  /**
   * Resolve PREDECESSOR-sourced inputs for a node by reading the upstream
   * NodeRuntimeState.outputsJson maps. Idempotent — call when a node enters
   * PENDING so the operator immediately sees the files they must download.
   */
  private async resolvePredecessorInputs(
    iterationId: string,
    target: FlowNodeDef,
  ): Promise<NodeInputStatusesMap> {
    const statuses: NodeInputStatusesMap = {}
    const upstreamIds = new Set<string>()
    for (const input of target.inputs) {
      if (input.source.kind === 'PREDECESSOR' && input.source.from.nodeId) {
        upstreamIds.add(input.source.from.nodeId)
      }
    }
    if (upstreamIds.size === 0) return statuses

    const upstreamStates = await this.prisma.nodeRuntimeState.findMany({
      where: { iterationId, nodeId: { in: Array.from(upstreamIds) } },
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

    for (const input of target.inputs) {
      if (input.source.kind !== 'PREDECESSOR') continue
      const { nodeId, outputId } = input.source.from
      if (!nodeId || !outputId) {
        // Binding declared but not yet resolved — leave the input as not-provided.
        statuses[input.id] = { provided: false, resolvedFrom: 'PREDECESSOR', fileIds: [] }
        continue
      }
      const upstreamOutputs = outputsByNode.get(nodeId) ?? {}
      let fileIds = upstreamOutputs[outputId]
      // Legacy fallback: if upstream has not been migrated yet, its single
      // outputFilePath maps to the implicit `default` output. FileRecord.id is
      // unknown here, so we record the path string in `filePath` only.
      const legacyPath = legacyByNode.get(nodeId)
      if ((!fileIds || fileIds.length === 0) && outputId === 'default' && legacyPath) {
        statuses[input.id] = {
          provided: true,
          resolvedFrom: 'PREDECESSOR',
          fileIds: [],
          filePath: legacyPath,
        }
        continue
      }
      statuses[input.id] = {
        provided: Boolean(fileIds && fileIds.length > 0),
        resolvedFrom: 'PREDECESSOR',
        fileIds: fileIds ?? [],
      }
    }
    return statuses
  }

  /**
   * Record a file as the (or one of the) output(s) of `outputId` for a running
   * node. Merges into NodeRuntimeState.outputsJson without clobbering other
   * outputs. Cardinality is checked best-effort: ONE outputs are overwritten,
   * MANY outputs are appended.
   */
  async recordNodeOutput(
    iterationId: string,
    nodeId: string,
    outputId: string,
    fileRecordId: string,
    cardinality: 'ONE' | 'MANY' = 'ONE',
  ) {
    const state = await this.prisma.nodeRuntimeState.findUnique({
      where: { iterationId_nodeId: { iterationId, nodeId } },
    })
    let outputs: NodeOutputsMap = {}
    if (state?.outputsJson) {
      try { outputs = JSON.parse(state.outputsJson) } catch { outputs = {} }
    }
    const current = outputs[outputId] ?? []
    outputs[outputId] = cardinality === 'MANY'
      ? Array.from(new Set([...current, fileRecordId]))
      : [fileRecordId]
    await this.prisma.nodeRuntimeState.update({
      where: { iterationId_nodeId: { iterationId, nodeId } },
      data: { outputsJson: JSON.stringify(outputs) },
    })
    return outputs
  }

  /**
   * Evaluate which nodes become PENDING after a node completes.
   * For GATEWAY successors, evaluates the gate logic (AND/OR/XOR) against
   * predecessor statuses and either auto-COMPLETEs (pass) or marks SKIPPED (fail),
   * recursively cascading the result downstream. Gateway nodes have no handler
   * to invoke and no human to claim them — the engine evaluates them itself.
   */
  async advanceWorkflow(iterationId: string, completedNodeId: string, nodes: any[], edges: FlowEdge[]) {
    const successors = edges.filter((e) => e.source === completedNodeId).map((e) => e.target)

    for (const targetId of successors) {
      await this.tryActivate(iterationId, targetId, nodes, edges)
    }

    await this.checkIterationComplete(iterationId, nodes)
  }

  /**
   * Attempt to activate a node:
   *  - if any predecessor is ERROR/SKIPPED and target is not a gateway with OR/XOR semantics → SKIP
   *  - if all predecessors COMPLETED:
   *      - GATEWAY: evaluate gate immediately (AND/OR/XOR), then COMPLETE or SKIP
   *      - other:   mark PENDING (handlers / claims will progress it)
   *  - otherwise: leave as IDLE
   */
  private async tryActivate(iterationId: string, targetId: string, nodes: any[], edges: FlowEdge[]) {
    const rawTarget = nodes.find((n) => n.id === targetId)
    if (!rawTarget) return
    const targetNode = asNode(rawTarget)

    const states = await this.prisma.nodeRuntimeState.findMany({ where: { iterationId } })
    const stateMap = Object.fromEntries(states.map((s) => [s.nodeId, s.status as NodeStatus]))
    if (stateMap[targetId] !== 'IDLE') return

    const prereqs = edges.filter((e) => e.target === targetId).map((e) => e.source)
    const prereqStatuses = prereqs.reduce<Record<string, NodeStatus>>((acc, p) => {
      acc[p] = stateMap[p] ?? 'IDLE'
      return acc
    }, {})

    const isGateway = targetNode.kind === 'GATEWAY'
    const stillRunning = prereqs.some((p) => ['IDLE', 'PENDING', 'RUNNING'].includes(stateMap[p] ?? 'IDLE'))
    if (stillRunning) return

    if (isGateway) {
      const logic = targetNode.gateway?.logic ?? 'AND'
      // A GATEWAY with PREDECESSOR-bound inputs evaluates on the
      // FILES it received (AND = every input received ≥1 file; OR = any did) and,
      // on pass, FORWARDS those files as its outputs (outputs mirror inputs).
      // Gateways WITHOUT file inputs (legacy / frozen iterations) fall back to
      // the original predecessor-STATUS gate so existing runs are unaffected.
      const fileInputs = (targetNode.inputs ?? []).filter(
        (i: any) => i?.source?.kind === 'PREDECESSOR' && i?.source?.from?.nodeId,
      )
      let passes: boolean
      let forwarded: Record<string, string[]> = {}

      if (fileInputs.length > 0) {
        const resolved = await this.resolvePredecessorInputs(iterationId, targetNode)
        const received = (inputId: string) => resolved[inputId]?.provided === true
        passes = logic === 'OR'
          ? targetNode.inputs.some((i) => received(i.id))
          : targetNode.inputs.every((i) => received(i.id))
        if (passes) {
          for (const inp of targetNode.inputs) {
            const fileIds = resolved[inp.id]?.fileIds ?? []
            if (fileIds.length > 0) forwarded[inp.id] = fileIds
          }
        }
        // Record what the gate saw (parity with task nodes; powers the UI).
        await this.prisma.nodeRuntimeState.update({
          where: { iterationId_nodeId: { iterationId, nodeId: targetId } },
          data: { inputFileStatusesJson: JSON.stringify(resolved) },
        })
      } else {
        passes = this.evaluateGateway(targetNode, prereqStatuses)
      }

      if (passes) {
        // Forward received inputs as this gate's outputs so successors resolve them.
        if (Object.keys(forwarded).length > 0) {
          await this.prisma.nodeRuntimeState.update({
            where: { iterationId_nodeId: { iterationId, nodeId: targetId } },
            data: { outputsJson: JSON.stringify(forwarded) },
          })
        }
        await this.updateNodeStatus(iterationId, targetId, 'COMPLETED', {
          startedAt: new Date(),
          completedAt: new Date(),
          log: `Gateway ${targetNode.name} (${logic}) passed${fileInputs.length ? ` — forwarded ${Object.keys(forwarded).length} input(s)` : ''}`,
        })
        await this.addTimelineEvent({
          iterationId, nodeId: targetId, nodeLabel: targetNode.name,
          partner: 'System', action: 'GATEWAY_PASSED',
          detail: `gateType=${logic}`,
        })
        for (const next of edges.filter((e) => e.source === targetId).map((e) => e.target)) {
          await this.tryActivate(iterationId, next, nodes, edges)
        }
      } else {
        await this.updateNodeStatus(iterationId, targetId, 'SKIPPED', {
          completedAt: new Date(),
          log: `Gateway ${targetNode.name} (${logic}) did not pass`,
        })
        await this.addTimelineEvent({
          iterationId, nodeId: targetId, nodeLabel: targetNode.name,
          partner: 'System', action: 'GATEWAY_BLOCKED',
          detail: `Inputs did not satisfy ${logic} gate`,
        })
        // Cascade SKIPPED to downstream
        await this.cascadeSkip(iterationId, targetId, nodes, edges)
      }
      return
    }

    const allOk = prereqs.every((p) => stateMap[p] === 'COMPLETED' || stateMap[p] === 'SKIPPED')
    if (!allOk) return

    const anyHardFail = prereqs.some((p) => stateMap[p] === 'ERROR')
    if (anyHardFail) {
      await this.updateNodeStatus(iterationId, targetId, 'SKIPPED', {
        completedAt: new Date(),
        log: 'Predecessor in ERROR — node skipped',
      })
      await this.cascadeSkip(iterationId, targetId, nodes, edges)
      return
    }

    // Pre-populate inputFileStatusesJson with predecessor resolutions so the
    // operator immediately sees what is downloadable and what is still pending.
    const resolved = await this.resolvePredecessorInputs(iterationId, targetNode)
    if (Object.keys(resolved).length > 0) {
      const current = states.find((s) => s.nodeId === targetId)
      const existing: NodeInputStatusesMap = current?.inputFileStatusesJson
        ? (() => { try { return JSON.parse(current.inputFileStatusesJson!) } catch { return {} } })()
        : {}
      const merged = { ...existing, ...resolved }
      await this.prisma.nodeRuntimeState.update({
        where: { iterationId_nodeId: { iterationId, nodeId: targetId } },
        data: { inputFileStatusesJson: JSON.stringify(merged) },
      })
    }

    await this.updateNodeStatus(iterationId, targetId, 'PENDING')
  }

  private async cascadeSkip(iterationId: string, fromId: string, nodes: any[], edges: FlowEdge[]) {
    const visited = new Set<string>([fromId])
    const queue = edges.filter((e) => e.source === fromId).map((e) => e.target)
    while (queue.length) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const state = await this.prisma.nodeRuntimeState.findUnique({
        where: { iterationId_nodeId: { iterationId, nodeId: id } },
      })
      if (state && state.status === 'IDLE') {
        await this.updateNodeStatus(iterationId, id, 'SKIPPED', {
          completedAt: new Date(),
          log: 'Cascaded SKIP from upstream gateway/error',
        })
        for (const next of edges.filter((e) => e.source === id).map((e) => e.target)) {
          queue.push(next)
        }
      }
    }
  }

  private async checkIterationComplete(iterationId: string, nodes: any[]) {
    const states = await this.prisma.nodeRuntimeState.findMany({ where: { iterationId } })
    const map = Object.fromEntries(states.map((s) => [s.nodeId, s.status]))
    const allTerminal = nodes.every((n) => {
      const s = map[n.id]
      return s === 'COMPLETED' || s === 'SKIPPED' || s === 'ERROR'
    })
    if (!allTerminal) return
    const anyError = nodes.some((n) => map[n.id] === 'ERROR')
    const finalStatus = anyError ? 'FAILED' : 'COMPLETED'
    await this.prisma.iteration.update({
      where: { id: iterationId },
      data: { status: finalStatus, completedAt: new Date() },
    })
    // Fire-and-forget MANIFEST.json generation for the completed iteration.
    if (finalStatus === 'COMPLETED') {
      this.manifest.generateManifest(iterationId).catch((e) =>
        this.logger.warn(`Manifest generation failed for ${iterationId}: ${e?.message}`),
      )
    }
    this.broker.emit({ type: 'iteration_status', iterationId, payload: { status: finalStatus } })
  }

  async updateNodeStatus(
    iterationId: string,
    nodeId: string,
    status: NodeStatus,
    extra: Partial<{
      startedAt: Date
      completedAt: Date
      errorMessage: string
      outputFilePath: string
      progress: number
      claimedBy: string
      log: string
    }> = {},
  ) {
    const update: any = { status }
    if (extra.startedAt) update.startedAt = extra.startedAt
    if (extra.completedAt) update.completedAt = extra.completedAt
    if (extra.errorMessage !== undefined) update.errorMessage = extra.errorMessage
    if (extra.outputFilePath) update.outputFilePath = extra.outputFilePath
    if (extra.progress !== undefined) update.progress = extra.progress
    if (extra.claimedBy) update.claimedBy = extra.claimedBy

    if (extra.log) {
      const current = await this.prisma.nodeRuntimeState.findUnique({
        where: { iterationId_nodeId: { iterationId, nodeId } },
      })
      const logs = current?.logsJson ? JSON.parse(current.logsJson) : []
      logs.push(`[${new Date().toISOString()}] ${extra.log}`)
      update.logsJson = JSON.stringify(logs)
    }

    const state = await this.prisma.nodeRuntimeState.update({
      where: { iterationId_nodeId: { iterationId, nodeId } },
      data: update,
    })

    // When a node completes, derive WAS_DERIVED_FROM lineage edges from
    // declared inputs to outputs. Idempotent + best-effort.
    if (status === 'COMPLETED') {
      this.lineage
        .recordEdgesForNode({ iterationId, nodeId, handlerName: state.handlerName ?? undefined, handlerVersion: state.handlerVersion ?? undefined })
        .catch((e) => this.logger.warn(`Lineage edge creation failed for ${nodeId}: ${e?.message}`))
    }

    this.broker.emit({
      type: 'node_status_changed',
      iterationId,
      payload: { nodeId, status, ...extra },
    })

    if (extra.progress !== undefined) {
      this.broker.emit({ type: 'node_progress', iterationId, payload: { nodeId, progress: extra.progress } })
    }

    return state
  }

  async appendLog(iterationId: string, nodeId: string, message: string) {
    const current = await this.prisma.nodeRuntimeState.findUnique({
      where: { iterationId_nodeId: { iterationId, nodeId } },
    })
    const logs = current?.logsJson ? JSON.parse(current.logsJson) : []
    logs.push(`[${new Date().toISOString()}] ${message}`)
    await this.prisma.nodeRuntimeState.update({
      where: { iterationId_nodeId: { iterationId, nodeId } },
      data: { logsJson: JSON.stringify(logs) },
    })
    this.broker.emit({ type: 'node_log', iterationId, payload: { nodeId, message } })
  }

  async addTimelineEvent(params: {
    iterationId: string
    nodeId: string
    nodeLabel: string
    partner: string
    action: string
    detail?: string
    filePath?: string
  }) {
    const event = await this.prisma.timelineEvent.create({
      data: { ...params, timestamp: new Date() },
    })
    this.broker.emit({ type: 'timeline_event', iterationId: params.iterationId, payload: event as any })
    return event
  }

  /**
   * Evaluate a GATEWAY node — returns whether the gate passes.
   * Accepts either a canonical FlowNodeDef (preferred) or a legacy
   * nodeConfig object with `gateType`.
   */
  evaluateGateway(
    nodeOrConfig: FlowNodeDef | { gateType?: string } | any,
    inputStatuses: Record<string, NodeStatus>,
  ): boolean {
    const gateType: string =
      nodeOrConfig?.gateway?.logic ?? nodeOrConfig?.gateType ?? nodeOrConfig?.config?.gateType ?? 'AND'
    const values = Object.values(inputStatuses)
    switch (gateType) {
      case 'OR': return values.some((s) => s === 'COMPLETED')
      case 'XOR': return values.filter((s) => s === 'COMPLETED').length === 1
      case 'AND':
      default: return values.every((s) => s === 'COMPLETED')
    }
  }
}
