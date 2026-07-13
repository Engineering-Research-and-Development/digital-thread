import { create } from 'zustand'
import type { DataSource } from '@/types/state-machine'
import { api } from '@/lib/api'

interface DataSourceStore {
  sources: Record<string, DataSource>
  loading: boolean
  init: () => Promise<void>
  addSource: (source: DataSource) => Promise<void>
  updateSource: (id: string, updates: Partial<DataSource>) => Promise<void>
  deleteSource: (id: string) => Promise<void>
}

function toDataSource(raw: any): DataSource {
  return {
    id: raw.id,
    name: raw.name,
    type: raw.type,
    protocol: raw.protocol ?? undefined,
    endpoint: raw.endpoint,
    description: raw.description ?? undefined,
  }
}

export const useDataSourceStore = create<DataSourceStore>((set) => ({
  sources: {},
  loading: false,

  init: async () => {
    set({ loading: true })
    try {
      const result = await api.datasources.list()
      const items: any[] = Array.isArray(result) ? result : (result?.items ?? [])
      const sources: Record<string, DataSource> = {}
      for (const ds of items) {
        sources[ds.id] = toDataSource(ds)
      }
      set({ sources })
    } catch {
      // Keep empty on error
    } finally {
      set({ loading: false })
    }
  },

  addSource: async (source) => {
    try {
      const created = await api.datasources.create({
        name: source.name,
        type: source.type,
        protocol: source.protocol,
        endpoint: source.endpoint,
        description: source.description,
      })
      set((s) => ({ sources: { ...s.sources, [created.id]: toDataSource(created) } }))
    } catch {
      // Optimistic fallback
      set((s) => ({ sources: { ...s.sources, [source.id]: source } }))
    }
  },

  updateSource: async (id, updates) => {
    set((s) => ({
      sources: { ...s.sources, [id]: { ...s.sources[id], ...updates } },
    }))
    try {
      await api.datasources.update(id, updates)
    } catch {
      // Best-effort
    }
  },

  deleteSource: async (id) => {
    set((s) => {
      const { [id]: _, ...rest } = s.sources
      return { sources: rest }
    })
    try {
      await api.datasources.delete(id)
    } catch {
      // Best-effort
    }
  },
}))
