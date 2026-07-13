import { create } from 'zustand'
import type { Partner } from '@/types/state-machine'
import { api } from '@/lib/api'

// Fallback seed colors for known partner names (used if backend doesn't provide color)
const PARTNER_COLORS: Record<string, string> = {
  CAI: '#60A5FA',
  AIMPLAS: '#34D399',
  ENS: '#A78BFA',
  AIM: '#F97316',
  MSQ: '#F59E0B',
  IMD: '#EC4899',
  IDK: '#14B8A6',
  NTNU: '#6366F1',
  IPT: '#84CC16',
}

interface PartnerStore {
  partners: Record<string, Partner>
  loading: boolean

  init: () => Promise<void>
  addPartner: (partner: Partner) => void
  updatePartner: (id: string, updates: Partial<Partner>) => void
  deletePartner: (id: string) => void
  getPartnerColor: (name: string) => string
}

export const usePartnerStore = create<PartnerStore>((set, get) => ({
  partners: {},
  loading: false,

  init: async () => {
    set({ loading: true })
    try {
      const result = await api.partners.list()
      // API returns array directly
      const list: Partner[] = Array.isArray(result) ? result : (result?.items ?? [])
      const partners: Record<string, Partner> = {}
      for (const p of list) {
        partners[p.id] = p
      }
      set({ partners, loading: false })
    } catch (e) {
      console.warn('Failed to load partners from API, using empty list:', e)
      set({ loading: false })
    }
  },

  addPartner: async (partner) => {
    try {
      const created = await api.partners.create({
        name: partner.name,
        fullName: partner.fullName,
        // Country is mandatory; forward it so creation persists it.
        country: partner.country,
        color: partner.color,
        role: partner.role,
      })
      set((s) => ({ partners: { ...s.partners, [created.id]: created } }))
    } catch {
      // Optimistic fallback
      set((s) => ({ partners: { ...s.partners, [partner.id]: partner } }))
    }
  },

  updatePartner: async (id, updates) => {
    set((s) => ({
      partners: { ...s.partners, [id]: { ...s.partners[id], ...updates } },
    }))
    try {
      await api.partners.update(id, updates)
    } catch {
      // Best-effort
    }
  },

  deletePartner: async (id) => {
    set((s) => {
      const { [id]: _, ...rest } = s.partners
      void _
      return { partners: rest }
    })
    try {
      await api.partners.delete(id)
    } catch {
      // Best-effort
    }
  },

  getPartnerColor: (name) => {
    const partners = get().partners
    const match = Object.values(partners).find((p) => p.name === name || name.includes(p.name))
    if (match?.color) return match.color
    // Fallback: check by partial name
    for (const [key, color] of Object.entries(PARTNER_COLORS)) {
      if (name.includes(key)) return color
    }
    return '#94A3B8'
  },
}))
