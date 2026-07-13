import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth-store'
import type { Role } from '@/lib/roles'
import { ShieldOff } from 'lucide-react'

interface RoleGuardProps {
  allow: Role[]
  redirectTo?: string
  children: React.ReactNode
  /** Render an inline forbidden message instead of redirecting */
  inline?: boolean
}

export function RoleGuard({ allow, redirectTo = '/', children, inline = false }: RoleGuardProps) {
  const user = useAuthStore((s) => s.user)
  if (!user || !allow.includes(user.role)) {
    if (inline) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldOff className="h-10 w-10 text-muted-foreground mb-2" />
          <h2 className="text-lg font-semibold">Insufficient permissions</h2>
          <p className="text-sm text-muted-foreground">
            Your role ({user?.role ?? 'guest'}) cannot access this page.
          </p>
        </div>
      )
    }
    return <Navigate to={redirectTo} replace />
  }
  return <>{children}</>
}
