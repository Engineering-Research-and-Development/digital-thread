import { create } from 'zustand'
import type { Iteration, NodeRuntimeState, TimelineEvent } from '@/types/state-machine'
import { IterationStatus, NodeStatus } from '@/types/enums'
import { api } from '@/lib/api'
import { useMachineStore } from './machine-store'

// ─── Data converters (backend → frontend format) ──────────────────────────────

function toIteration(raw: any): Iteration {
  const timeline: TimelineEvent[] = (raw.timelineEvents ?? []).map((e: any) => ({
    id: e.id,
    timestamp: typeof e.timestamp === 'string' ? e.timestamp : new Date(e.timestamp).toISOString(),
    nodeId: e.nodeId,
    nodeLabel: e.nodeLabel,
    partner: e.partner,
    action: e.action,
    detail: e.detail ?? '',
    filePath: e.filePath,
  }))

  return {
    id: raw.id,
    displayId: raw.displayId ?? raw.id,
    machineId: raw.machineId,
    machineName: raw.machineName,
    status: raw.status as IterationStatus,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date(raw.createdAt).toISOString(),
    completedAt: raw.completedAt
      ? (typeof raw.completedAt === 'string' ? raw.completedAt : new Date(raw.completedAt).toISOString())
      : undefined,
    metadata: raw.metadataJson ? (typeof raw.metadataJson === 'string' ? JSON.parse(raw.metadataJson) : raw.metadataJson) : {},
    parentIterationId: raw.parentIterationId ?? undefined,
    restartFromNodeId: raw.restartFromNodeId ?? undefined,
    // Owning partner + attached product.
    ownerPartnerId: raw.ownerPartnerId ?? undefined,
    ownerPartner: raw.ownerPartner ?? undefined,
    productId: raw.productId ?? undefined,
    product: raw.product ?? undefined,
    timeline,
    // Frozen state-machine version + snapshot, populated by the backend on the
    // single-iteration response. The list endpoint exposes only the `version`
    // summary (no snapshot) — that's fine for badges.
    version: raw.version ?? null,
    snapshotNodes: Array.isArray(raw.snapshotNodes) ? raw.snapshotNodes : undefined,
    snapshotEdges: Array.isArray(raw.snapshotEdges) ? raw.snapshotEdges : undefined,
    snapshotGroups: Array.isArray(raw.snapshotGroups) ? raw.snapshotGroups : undefined,
  }
}

function toNodeState(raw: any): NodeRuntimeState {
  // Parse the per-output file map (outputsJson on the backend).
  let outputs: Record<string, string[]> | undefined
  if (raw.outputsJson) {
    try {
      outputs = typeof raw.outputsJson === 'string' ? JSON.parse(raw.outputsJson) : raw.outputsJson
    } catch {
      outputs = undefined
    }
  } else if (raw.outputs && typeof raw.outputs === 'object') {
    outputs = raw.outputs
  }
  return {
    nodeId: raw.nodeId,
    status: raw.status as NodeStatus,
    startedAt: raw.startedAt ? (typeof raw.startedAt === 'string' ? raw.startedAt : new Date(raw.startedAt).toISOString()) : undefined,
    completedAt: raw.completedAt ? (typeof raw.completedAt === 'string' ? raw.completedAt : new Date(raw.completedAt).toISOString()) : undefined,
    logs: raw.logsJson ? (typeof raw.logsJson === 'string' ? JSON.parse(raw.logsJson) : raw.logsJson) : [],
    outputFilePath: raw.outputFilePath ?? undefined,
    outputs,
    errorMessage: raw.errorMessage ?? undefined,
    progress: raw.progress ?? undefined,
    claimedBy: raw.claimedBy ?? undefined,
    inputFileStatuses: raw.inputFileStatusesJson
      ? (typeof raw.inputFileStatusesJson === 'string' ? JSON.parse(raw.inputFileStatusesJson) : raw.inputFileStatusesJson)
      : undefined,
  }
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface IterationStore {
  iterations: Record<string, Iteration>
  nodeStatuses: Record<string, Record<string, NodeRuntimeState>>
  loading: boolean

  // API-backed operations
  init: () => Promise<void>
  loadIteration: (id: string) => Promise<void>
  createIteration: (
    machineId: string,
    opts?: { metadata?: Record<string, string>; ownerPartnerId?: string; productId?: string },
  ) => Promise<string>
  createIterationFromNode: (sourceIterationId: string, restartNodeId: string) => Promise<string>

  // Local state mutations (also used for optimistic updates + SSE events)
  setNodeStatus: (iterationId: string, nodeId: string, status: NodeStatus, extra?: Partial<NodeRuntimeState>) => void
  setNodeProgress: (iterationId: string, nodeId: string, progress: number) => void
  addNodeLog: (iterationId: string, nodeId: string, log: string) => void
  addTimelineEvent: (iterationId: string, event: Omit<TimelineEvent, 'id' | 'timestamp'>) => void
  setIterationStatus: (iterationId: string, status: IterationStatus) => void
  getNodeState: (iterationId: string, nodeId: string) => NodeRuntimeState | undefined
  getUnlockedNodes: (iterationId: string) => string[]
  getIteration: (iterationId: string) => Iteration | undefined
  resetDownstreamNodes: (iterationId: string, fromNodeId: string) => void
  setInputFileStatus: (iterationId: string, nodeId: string, inputId: string, filePath: string) => void
  /** Append an uploaded FileRecord.id to the per-output slot map. */
  recordNodeOutput: (iterationId: string, nodeId: string, outputId: string, fileRecordId: string, cardinality?: 'ONE' | 'MANY') => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useIterationStore = create<IterationStore>((set, get) => ({
  iterations: {},
  nodeStatuses: {},
  loading: false,

  // ── Load all iterations ────────────────────────────────────────────────────
  init: async () => {
    set({ loading: true })
    try {
      const { items } = await api.iterations.list(undefined, { page: 1, limit: 100 })
      const iterations: Record<string, Iteration> = {}
      for (const raw of items) {
        const iter = toIteration(raw)
        iterations[iter.id] = iter
      }
      set({ iterations, loading: false })
    } catch (e) {
      console.error('Failed to load iterations:', e)
      set({ loading: false })
    }
  },

  // ── Load a single iteration with node states ───────────────────────────────
  loadIteration: async (id: string) => {
    try {
      const [raw, nodeStatesRes] = await Promise.all([
        api.iterations.get(id),
        api.iterations.getNodeStates(id),
      ])

      const iter = toIteration(raw)
      const nodeStatuses: Record<string, NodeRuntimeState> = {}
      for (const ns of (nodeStatesRes.nodeStates ?? [])) {
        nodeStatuses[ns.nodeId] = toNodeState(ns)
      }

      set((s) => ({
        iterations: { ...s.iterations, [id]: iter },
        nodeStatuses: { ...s.nodeStatuses, [id]: nodeStatuses },
      }))
    } catch (e) {
      console.error(`Failed to load iteration ${id}:`, e)
    }
  },

  // ── Create iteration ───────────────────────────────────────────────────────
  createIteration: async (machineId, opts) => {
    const raw = await api.iterations.create(machineId, opts)
    const iter = toIteration(raw)

    // Build initial node states from included nodeStates
    const nodeStatuses: Record<string, NodeRuntimeState> = {}
    for (const ns of (raw.nodeStates ?? [])) {
      nodeStatuses[ns.nodeId] = toNodeState(ns)
    }

    set((s) => ({
      iterations: { ...s.iterations, [iter.id]: iter },
      nodeStatuses: { ...s.nodeStatuses, [iter.id]: nodeStatuses },
    }))

    return iter.id
  },

  // ── Fork iteration from a node ────────────────────────────────────────────
  // The backend forks a NEW iteration that inherits all predecessor
  // NodeRuntimeStates (including their outputsJson file references) and leaves
  // the restart node PENDING. Source iteration is untouched.
  createIterationFromNode: async (sourceIterationId, restartNodeId) => {
    const raw = await api.iterations.restart(sourceIterationId, restartNodeId)
    const iter = toIteration(raw)

    const nodeStatesRes = await api.iterations.getNodeStates(iter.id)
    const nodeStatuses: Record<string, NodeRuntimeState> = {}
    for (const ns of (nodeStatesRes.nodeStates ?? [])) {
      nodeStatuses[ns.nodeId] = toNodeState(ns)
    }

    set((s) => ({
      iterations: { ...s.iterations, [iter.id]: iter },
      nodeStatuses: { ...s.nodeStatuses, [iter.id]: nodeStatuses },
    }))

    return iter.id
  },

  // ── Local/optimistic state mutations ──────────────────────────────────────

  setNodeStatus: (iterationId, nodeId, status, extra) =>
    set((state) => {
      const iterNodes = state.nodeStatuses[iterationId] || {}
      const existing = iterNodes[nodeId] || { nodeId, status: NodeStatus.IDLE, logs: [] }
      return {
        nodeStatuses: {
          ...state.nodeStatuses,
          [iterationId]: {
            ...iterNodes,
            [nodeId]: {
              ...existing,
              status,
              ...(status === NodeStatus.RUNNING ? { startedAt: new Date().toISOString() } : {}),
              ...(status === NodeStatus.COMPLETED || status === NodeStatus.ERROR
                ? { completedAt: new Date().toISOString() }
                : {}),
              ...extra,
            },
          },
        },
      }
    }),

  setNodeProgress: (iterationId, nodeId, progress) =>
    set((state) => {
      const iterNodes = state.nodeStatuses[iterationId] || {}
      const existing = iterNodes[nodeId] || { nodeId, status: NodeStatus.IDLE, logs: [] }
      return {
        nodeStatuses: {
          ...state.nodeStatuses,
          [iterationId]: {
            ...iterNodes,
            [nodeId]: { ...existing, progress },
          },
        },
      }
    }),

  addNodeLog: (iterationId, nodeId, log) =>
    set((state) => {
      const iterNodes = state.nodeStatuses[iterationId] || {}
      const existing = iterNodes[nodeId] || { nodeId, status: NodeStatus.IDLE, logs: [] }
      return {
        nodeStatuses: {
          ...state.nodeStatuses,
          [iterationId]: {
            ...iterNodes,
            [nodeId]: {
              ...existing,
              logs: [...existing.logs, `[${new Date().toLocaleTimeString()}] ${log}`],
            },
          },
        },
      }
    }),

  addTimelineEvent: (iterationId, event) =>
    set((state) => {
      const iter = state.iterations[iterationId]
      if (!iter) return state
      const newEvent: TimelineEvent = {
        ...event,
        id: `te-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        timestamp: new Date().toISOString(),
      }
      return {
        iterations: {
          ...state.iterations,
          [iterationId]: {
            ...iter,
            timeline: [...iter.timeline, newEvent],
          },
        },
      }
    }),

  setIterationStatus: (iterationId, status) =>
    set((state) => {
      const existing = state.iterations[iterationId]
      if (!existing) return state
      return {
        iterations: {
          ...state.iterations,
          [iterationId]: {
            ...existing,
            status,
            ...(status === IterationStatus.COMPLETED || status === IterationStatus.FAILED
              ? { completedAt: new Date().toISOString() }
              : {}),
          },
        },
      }
    }),

  getNodeState: (iterationId, nodeId) => get().nodeStatuses[iterationId]?.[nodeId],

  getUnlockedNodes: (iterationId) => {
    const iteration = get().iterations[iterationId]
    if (!iteration) return []

    const machine = useMachineStore.getState().machines[iteration.machineId]
    if (!machine) return []

    const statuses = get().nodeStatuses[iterationId] || {}

    return machine.nodes
      .filter((node) => {
        const nodeState = statuses[node.id]
        if (nodeState && nodeState.status !== NodeStatus.IDLE && nodeState.status !== NodeStatus.PENDING) {
          return false
        }
        const incomingEdges = machine.edges.filter((e) => e.target === node.id)
        if (incomingEdges.length === 0) return true
        return incomingEdges.every((edge) => {
          const predecessorState = statuses[edge.source]
          return predecessorState?.status === NodeStatus.COMPLETED
        })
      })
      .map((n) => n.id)
  },

  getIteration: (iterationId) => get().iterations[iterationId],

  setInputFileStatus: (iterationId, nodeId, inputId, filePath) =>
    set((state) => {
      const iterNodes = state.nodeStatuses[iterationId] || {}
      const existing = iterNodes[nodeId] || { nodeId, status: NodeStatus.IDLE, logs: [] }
      const inputFileStatuses = { ...(existing.inputFileStatuses || {}), [inputId]: { provided: true, filePath } }
      return {
        nodeStatuses: {
          ...state.nodeStatuses,
          [iterationId]: {
            ...iterNodes,
            [nodeId]: { ...existing, inputFileStatuses },
          },
        },
      }
    }),

  recordNodeOutput: (iterationId, nodeId, outputId, fileRecordId, cardinality = 'ONE') =>
    set((state) => {
      const iterNodes = state.nodeStatuses[iterationId] || {}
      const existing = iterNodes[nodeId] || { nodeId, status: NodeStatus.IDLE, logs: [] }
      const currentOutputs = existing.outputs ?? {}
      const currentList = currentOutputs[outputId] ?? []
      const nextList =
        cardinality === 'MANY'
          ? Array.from(new Set([...currentList, fileRecordId]))
          : [fileRecordId]
      return {
        nodeStatuses: {
          ...state.nodeStatuses,
          [iterationId]: {
            ...iterNodes,
            [nodeId]: {
              ...existing,
              outputs: { ...currentOutputs, [outputId]: nextList },
            },
          },
        },
      }
    }),

  resetDownstreamNodes: (iterationId, fromNodeId) => {
    const iteration = get().iterations[iterationId]
    if (!iteration) return

    const machine = useMachineStore.getState().machines[iteration.machineId]
    if (!machine) return

    const visited = new Set<string>()
    const queue = [fromNodeId]
    while (queue.length > 0) {
      const current = queue.shift()!
      const outEdges = machine.edges.filter((e) => e.source === current)
      for (const edge of outEdges) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target)
          queue.push(edge.target)
        }
      }
    }

    set((state) => {
      const iterNodes = { ...state.nodeStatuses[iterationId] }
      for (const nid of visited) {
        iterNodes[nid] = {
          nodeId: nid,
          status: NodeStatus.IDLE,
          logs: [`[${new Date().toLocaleTimeString()}] Reset — upstream node changed`],
        }
      }
      iterNodes[fromNodeId] = {
        nodeId: fromNodeId,
        status: NodeStatus.PENDING,
        logs: [`[${new Date().toLocaleTimeString()}] Awaiting new input`],
      }
      return {
        nodeStatuses: { ...state.nodeStatuses, [iterationId]: iterNodes },
      }
    })
  },
}))
