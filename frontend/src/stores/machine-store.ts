import { create } from 'zustand'
import type { StateMachine, FlowNodeDef, FlowEdgeDef, FlowGroupDef } from '@/types/state-machine'
import { normalizeGroups } from '@/lib/normalize-node'
import { api } from '@/lib/api'

interface MachineStore {
  machines: Record<string, StateMachine>
  loading: boolean

  init: () => Promise<void>
  addMachine: (data: Partial<StateMachine>) => Promise<StateMachine>
  updateMachine: (id: string, updates: Partial<StateMachine>) => Promise<void>
  deleteMachine: (id: string) => Promise<void>
  // `groups` (visual node groups) are persisted alongside nodes/edges
  // and frozen per version by the backend. They are optional for callers that
  // don't manage groups.
  updateMachineGraph: (
    id: string,
    nodes: FlowNodeDef[],
    edges: FlowEdgeDef[],
    groups?: FlowGroupDef[],
  ) => Promise<void>
  getMachine: (id: string) => StateMachine | undefined
}

export const useMachineStore = create<MachineStore>((set, get) => ({
  machines: {},
  loading: false,

  init: async () => {
    set({ loading: true })
    try {
      const { items } = await api.machines.list(1, 100)
      const machines: Record<string, StateMachine> = {}
      for (const m of items) {
        machines[m.id] = deserializeMachine(m)
      }
      set({ machines, loading: false })
    } catch (e) {
      console.error('Failed to load machines:', e)
      set({ loading: false })
    }
  },

  addMachine: async (data) => {
    const machine = await api.machines.create(data)
    const deserialized = deserializeMachine(machine)
    set((s) => ({ machines: { ...s.machines, [deserialized.id]: deserialized } }))
    return deserialized
  },

  updateMachine: async (id, updates) => {
    const machine = await api.machines.update(id, updates)
    const deserialized = deserializeMachine(machine)
    set((s) => ({ machines: { ...s.machines, [id]: deserialized } }))
  },

  deleteMachine: async (id) => {
    await api.machines.delete(id)
    set((s) => {
      const { [id]: _, ...rest } = s.machines
      void _
      return { machines: rest }
    })
  },

  updateMachineGraph: async (id, nodes, edges, groups) => {
    const machine = await api.machines.updateGraph(id, nodes, edges, groups)
    const deserialized = deserializeMachine(machine)
    set((s) => ({ machines: { ...s.machines, [id]: deserialized } }))
  },

  getMachine: (id) => get().machines[id],
}))

// The backend may return nodes/edges/groups already parsed (deserialize handles both)
function deserializeMachine(m: any): StateMachine {
  // Groups may arrive as an array or a JSON string (groupsJson).
  const rawGroups = Array.isArray(m.groups)
    ? m.groups
    : typeof m.groupsJson === 'string'
    ? safeParse(m.groupsJson)
    : []
  return {
    ...m,
    nodes: Array.isArray(m.nodes) ? m.nodes : (typeof m.nodesJson === 'string' ? JSON.parse(m.nodesJson) : []),
    edges: Array.isArray(m.edges) ? m.edges : (typeof m.edgesJson === 'string' ? JSON.parse(m.edgesJson) : []),
    groups: normalizeGroups(rawGroups),
    tags: Array.isArray(m.tags) ? m.tags : (typeof m.tags === 'string' ? JSON.parse(m.tags) : []),
    nodesJson: undefined,
    edgesJson: undefined,
    groupsJson: undefined,
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return []
  }
}
