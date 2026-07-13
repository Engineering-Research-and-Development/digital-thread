import { create } from 'zustand'
import type { Product } from '@/types/state-machine'
import { api } from '@/lib/api'

interface ProductStore {
  products: Product[]
  loading: boolean

  init: () => Promise<void>
  refresh: () => Promise<void>
  addProduct: (body: { urn: string; name: string; description?: string; ownerPartnerId?: string }) => Promise<Product>
  updateProduct: (
    id: string,
    body: { urn?: string; name?: string; description?: string | null; ownerPartnerId?: string },
  ) => Promise<Product>
  removeProduct: (id: string) => Promise<void>
}

export const useProductStore = create<ProductStore>((set) => ({
  products: [],
  loading: false,

  init: async () => {
    set({ loading: true })
    try {
      // Products API returns a plain array (not { items, total }).
      const list = (await api.products.list()) as Product[]
      set({ products: Array.isArray(list) ? list : [], loading: false })
    } catch (e) {
      console.warn('Failed to load products from API, using empty list:', e)
      set({ loading: false })
    }
  },

  refresh: async () => {
    try {
      const list = (await api.products.list()) as Product[]
      set({ products: Array.isArray(list) ? list : [] })
    } catch (e) {
      console.warn('Failed to refresh products from API:', e)
    }
  },

  addProduct: async (body) => {
    const created = (await api.products.create(body)) as Product
    set((s) => ({ products: [...s.products, created] }))
    return created
  },

  updateProduct: async (id, body) => {
    const updated = (await api.products.update(id, body)) as Product
    set((s) => ({ products: s.products.map((p) => (p.id === id ? updated : p)) }))
    return updated
  },

  removeProduct: async (id) => {
    await api.products.remove(id)
    set((s) => ({ products: s.products.filter((p) => p.id !== id) }))
  },
}))
