import { create } from 'zustand'
import { api, setTokens, clearTokens, getAccessToken, isOidcSession } from '@/lib/api'
import type { Role } from '@/lib/roles'

export interface AuthPartner {
  id: string
  name: string
  fullName?: string
  /** Mandatory ISO 3166-1 alpha-2 country code. */
  country?: string
  color?: string
}

export interface AuthUser {
  id: string
  email: string
  role: Role
  fullName?: string
  partnerId?: string | null
  partner?: AuthPartner | null
  lastLoginAt?: string
}

interface AuthStore {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null

  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  clearError: () => void

  /** Convenience selectors — keep computed access centralised. */
  hasRole: (...roles: Role[]) => boolean
  partnerName: () => string | null
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null })
    try {
      const result = await api.auth.login(email, password)
      setTokens(result.access_token, result.refresh_token)
      set({ user: result.user, isAuthenticated: true, isLoading: false })
    } catch (e: any) {
      set({ isLoading: false, error: e.message ?? 'Login failed' })
      throw e
    }
  },

  logout: async () => {
    // Federated sessions log out through the IdP end_session endpoint (single
    // logout); local sessions just revoke server-side. Both clear local tokens.
    const viaOidc = isOidcSession()
    let redirectUrl: string | null = null
    try {
      if (viaOidc) redirectUrl = (await api.oidc.logout()).url
      else await api.auth.logout()
    } catch {}
    clearTokens()
    if (redirectUrl) {
      // Hand off to the IdP — full-page navigation, the SPA unloads.
      window.location.href = redirectUrl
      return
    }
    set({ user: null, isAuthenticated: false, error: null })
  },

  checkAuth: async () => {
    const token = getAccessToken()
    if (!token) {
      set({ isAuthenticated: false, user: null, isLoading: false })
      return
    }
    set({ isLoading: true })
    try {
      const user = await api.auth.me()
      set({ user, isAuthenticated: true, isLoading: false })
    } catch {
      clearTokens()
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },

  clearError: () => set({ error: null }),

  hasRole: (...roles: Role[]) => {
    const u = get().user
    return !!u && roles.includes(u.role)
  },

  partnerName: () => get().user?.partner?.name ?? null,
}))
