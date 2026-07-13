import { useEffect, useState } from 'react'
import { Lock, User, Loader2, Eye, EyeOff, AlertCircle, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/stores/auth-store'
import { api } from '@/lib/api'

export function Login() {
  const { login, isLoading, error, clearError } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [oidc, setOidc] = useState<{ enabled: boolean; loginUrl: string | null; providerLabel: string } | null>(null)

  useEffect(() => {
    api.oidc.config().then(setOidc).catch(() => setOidc(null))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await login(email, password)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 px-4">
        {/* Logo / Title */}
        <div className="text-center space-y-3">
          <img
            src="/digital-thread-logo-no-bg.png"
            alt="Digital Thread"
            className="mx-auto h-32 w-auto"
          />
          <p className="text-sm text-muted-foreground">Digital Thread Platform</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Sign In</CardTitle>
            <CardDescription className="text-xs">
              Enter your credentials to access the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">
                  Email <span className="text-red-500" aria-hidden="true">*</span>
                  <span className="sr-only">required</span>
                </Label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="username"
                    className="pl-8 text-sm h-9"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearError() }}
                    placeholder="name@example.com"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'login-error' : undefined}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">
                  Password <span className="text-red-500" aria-hidden="true">*</span>
                  <span className="sr-only">required</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    className="pl-8 pr-9 text-sm h-9"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); clearError() }}
                    placeholder="••••••••"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? 'login-error' : undefined}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40 rounded p-0.5"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  id="login-error"
                  role="alert"
                  aria-live="polite"
                  className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2"
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <Button type="submit" className="w-full h-9" disabled={isLoading || !email || !password}>
                {isLoading ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" aria-hidden="true" />Signing in...</>
                ) : (
                  'Sign In'
                )}
              </Button>
            </form>

            {oidc?.enabled && oidc.loginUrl && (
              <>
                <div className="flex items-center gap-2 mt-4 mb-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-9"
                  onClick={() => { window.location.href = oidc.loginUrl! }}
                >
                  <KeyRound className="h-3.5 w-3.5 mr-2" />
                  Sign in with {oidc.providerLabel}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
