import { create } from 'zustand'
import { api, type NodeTemplate } from '@/lib/api'

interface NodeTemplateStore {
  templates: NodeTemplate[]
  loading: boolean
  loaded: boolean
  init: () => Promise<void>
  refresh: () => Promise<void>
  upsertLocal: (t: NodeTemplate) => void
  removeLocal: (id: string) => void
  create: (body: Partial<NodeTemplate>) => Promise<NodeTemplate>
  update: (id: string, body: Partial<NodeTemplate>) => Promise<NodeTemplate>
  remove: (id: string) => Promise<void>
  getBySlug: (slug: string) => NodeTemplate | undefined
}

export const useNodeTemplateStore = create<NodeTemplateStore>((set, get) => ({
  templates: [],
  loading: false,
  loaded: false,

  init: async () => {
    if (get().loaded || get().loading) return
    set({ loading: true })
    try {
      const templates = await api.nodeTemplates.list()
      set({ templates, loaded: true, loading: false })
    } catch (e) {
      console.error('Failed to load node templates:', e)
      set({ loading: false })
    }
  },

  refresh: async () => {
    set({ loading: true })
    try {
      const templates = await api.nodeTemplates.list()
      set({ templates, loaded: true, loading: false })
    } catch (e) {
      console.error('Failed to refresh node templates:', e)
      set({ loading: false })
    }
  },

  upsertLocal: (t) => {
    set((s) => {
      const i = s.templates.findIndex((x) => x.id === t.id)
      const next = [...s.templates]
      if (i >= 0) next[i] = t
      else next.push(t)
      next.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
      return { templates: next }
    })
  },

  removeLocal: (id) => {
    set((s) => ({ templates: s.templates.filter((t) => t.id !== id) }))
  },

  create: async (body) => {
    const t = await api.nodeTemplates.create(body)
    get().upsertLocal(t)
    return t
  },

  update: async (id, body) => {
    const t = await api.nodeTemplates.update(id, body)
    get().upsertLocal(t)
    return t
  },

  remove: async (id) => {
    await api.nodeTemplates.remove(id)
    get().removeLocal(id)
  },

  getBySlug: (slug) => get().templates.find((t) => t.slug === slug),
}))
