import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { setTokens } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

/**
 * Landing page after the OIDC identity provider redirects back. The backend
 * sends the Digital Thread session tokens via URL fragment; we parse,
 * persist, and bounce to the dashboard.
 */
export function OidcComplete() {
  const navigate = useNavigate()
  const checkAuth = useAuthStore((s) => s.checkAuth)

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '')
    const params = new URLSearchParams(hash)
    const access = params.get('access_token')
    const refresh = params.get('refresh_token')
    if (access && refresh) {
      setTokens(access, refresh)
      checkAuth().finally(() => {
        window.history.replaceState({}, '', '/')
        navigate('/', { replace: true })
      })
    } else {
      navigate('/login?oidc_error=no_tokens', { replace: true })
    }
  }, [checkAuth, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-2">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mx-auto" />
        <p className="text-sm text-muted-foreground">Completing sign-in…</p>
      </div>
    </div>
  )
}
