import { useEffect, useState } from 'react'
import {
  Building2, Loader2, Save, ShieldCheck, UserCircle,
  KeyRound, Copy, Check, RefreshCcw, Trash2, ExternalLink,
} from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { WipOverlay } from '@/components/common/wip-overlay'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { CountrySelect } from '@/components/common/country-select'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { ROLE } from '@/lib/roles'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

interface ProfilePartner {
  id: string
  name: string
  fullName?: string | null
  country?: string | null
  color?: string | null
}

interface ProfileUser {
  id: string
  email: string
  role: string
  fullName?: string | null
  partnerId?: string | null
  partner?: ProfilePartner | null
}

export function Profile() {
  const { user: authUser } = useAuthStore()
  const [profile, setProfile] = useState<ProfileUser | null>(null)
  const [loading, setLoading] = useState(true)

  // ── Editable fields ─────────────────────────────────────────────────────
  const [fullName, setFullName] = useState('')
  const [partnerFullName, setPartnerFullName] = useState('')
  const [partnerCountry, setPartnerCountry] = useState('')

  const [savingAccount, setSavingAccount] = useState(false)
  const [savingPartner, setSavingPartner] = useState(false)

  useEffect(() => {
    let active = true
    api.users
      .me()
      .then((me: ProfileUser) => {
        if (!active) return
        setProfile(me)
        setFullName(me.fullName ?? '')
        setPartnerFullName(me.partner?.fullName ?? '')
        setPartnerCountry(me.partner?.country ?? '')
      })
      .catch((e: any) => {
        toast.error(e?.message ?? 'Failed to load profile')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const hasPartner = !!profile?.partner

  async function saveAccount() {
    if (savingAccount) return
    setSavingAccount(true)
    try {
      await api.users.updateProfile({ fullName: fullName.trim() })
      toast.success('Account updated')
      await useAuthStore.getState().checkAuth()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to update account')
    } finally {
      setSavingAccount(false)
    }
  }

  async function savePartner() {
    if (savingPartner) return
    setSavingPartner(true)
    try {
      await api.users.updateProfile({
        partnerFullName: partnerFullName.trim(),
        partnerCountry: partnerCountry || undefined,
      })
      toast.success('Partner details updated')
      await useAuthStore.getState().checkAuth()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to update partner details')
    } finally {
      setSavingPartner(false)
    }
  }

  const accountDirty = (profile?.fullName ?? '') !== fullName
  const partnerDirty =
    (profile?.partner?.fullName ?? '') !== partnerFullName ||
    (profile?.partner?.country ?? '') !== partnerCountry

  return (
    <>
      <TopBar
        title="Profile"
        subtitle="Manage your account and partner details"
      />

      <div className="p-6 max-w-2xl mx-auto space-y-6">
        {loading ? (
          <>
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </>
        ) : (
          <>
            {/* ── Account ─────────────────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <UserCircle className="h-4 w-4 text-blue-400" />
                  Account
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <Input value={profile?.email ?? ''} readOnly disabled className="font-mono text-xs" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Role</Label>
                    <div className="flex h-9 items-center">
                      <Badge variant="secondary" className="gap-1.5">
                        <ShieldCheck className="h-3 w-3" />
                        {profile?.role}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="profile-full-name" className="text-xs">
                    Full name
                  </Label>
                  <Input
                    id="profile-full-name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your display name"
                  />
                </div>

                <div className="flex justify-end">
                  <Button size="sm" onClick={saveAccount} disabled={savingAccount || !accountDirty}>
                    {savingAccount ? (
                      <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-1.5" />
                    )}
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* ── Partner ─────────────────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-violet-400" />
                  Partner
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {hasPartner ? (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Partner code</Label>
                      <Input value={profile?.partner?.name ?? ''} readOnly disabled className="font-mono text-xs" />
                      <p className="text-[10px] text-muted-foreground">
                        The short partner code is a fixed identifier and cannot be changed.
                      </p>
                    </div>

                    <Separator />

                    <div className="space-y-1.5">
                      <Label htmlFor="profile-partner-name" className="text-xs">
                        Partner display name
                      </Label>
                      <Input
                        id="profile-partner-name"
                        value={partnerFullName}
                        onChange={(e) => setPartnerFullName(e.target.value)}
                        placeholder="Full organisation name"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="profile-partner-country" className="text-xs">
                        Country
                      </Label>
                      <CountrySelect
                        id="profile-partner-country"
                        value={partnerCountry}
                        onChange={setPartnerCountry}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button size="sm" onClick={savePartner} disabled={savingPartner || !partnerDirty}>
                        {savingPartner ? (
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-1.5" />
                        )}
                        Save
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground py-2">
                    Your account ({authUser?.role ?? profile?.role}) is not bound to a partner, so there
                    are no partner details to manage.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── API access (OPERATOR/OWNER) ─────────────────────────── */}
            {(profile?.role === ROLE.OPERATOR || profile?.role === ROLE.OWNER) && (
              <WipOverlay variant="section">
                <ApiAccessCard />
              </WipOverlay>
            )}
          </>
        )}
      </div>
    </>
  )
}

// ── Copyable read-only field ───────────────────────────────────────────────
function CopyField({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Copy failed - clipboard not available')
    }
  }
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="flex gap-2">
        <Input value={value} readOnly className={mono ? 'font-mono text-xs' : 'text-xs'} />
        <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  )
}

// ── API access card ────────────────────────────────────────────────────────
// External REST API key - generate / regenerate / revoke + the header, base
// URL and Swagger link needed to call /api/v1/ext.
function ApiAccessCard() {
  const confirm = useConfirm()
  const [meta, setMeta] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [newToken, setNewToken] = useState<string | null>(null)
  const [copiedToken, setCopiedToken] = useState(false)

  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const baseUrl = meta?.basePath ? `${origin}${meta.basePath}` : ''
  const docsUrl = meta?.docsPath ? `${origin}${meta.docsPath}` : ''

  const refresh = async () => {
    try {
      setMeta(await api.users.apiKey.get())
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to load API key')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void refresh() }, [])

  const generate = async () => {
    if (meta?.exists) {
      const ok = await confirm({
        title: 'Regenerate API key?',
        description: 'The current key will stop working immediately. Any external system using it must be updated with the new key.',
        confirmLabel: 'Regenerate',
      })
      if (!ok) return
    }
    setBusy(true)
    try {
      const res = await api.users.apiKey.generate()
      setNewToken(res.token)
      toast.success('API key generated - copy it now, it is shown only once')
      await refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to generate API key')
    } finally {
      setBusy(false)
    }
  }

  const revoke = async () => {
    const ok = await confirm({
      title: 'Revoke API key?',
      description: 'The current key will stop working immediately. You can generate a new one later.',
      confirmLabel: 'Revoke',
    })
    if (!ok) return
    setBusy(true)
    try {
      await api.users.apiKey.revoke()
      setNewToken(null)
      toast.success('API key revoked')
      await refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to revoke API key')
    } finally {
      setBusy(false)
    }
  }

  const copyToken = async () => {
    if (!newToken) return
    try {
      await navigator.clipboard.writeText(newToken)
      setCopiedToken(true)
      setTimeout(() => setCopiedToken(false), 1500)
    } catch {
      toast.error('Copy failed - clipboard not available')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-amber-400" />
          API access
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Call the Digital Thread <strong>external REST API</strong> from your own systems using a personal API key.
          Send it in the <code className="font-mono">{meta?.headerName ?? 'X-API-Key'}</code> header on every request.
        </p>

        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <>
            {/* Freshly generated token - shown ONCE */}
            {newToken && (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
                <p className="text-[11px] text-amber-300 font-medium">
                  Copy your new key now - it will not be shown again.
                </p>
                <div className="flex gap-2">
                  <Input value={newToken} readOnly className="font-mono text-xs" />
                  <Button size="sm" variant="outline" className="h-9 shrink-0" onClick={copyToken}>
                    {copiedToken ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            )}

            {/* Status */}
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div className="text-xs">
                {meta?.exists ? (
                  <>
                    <span className="text-foreground font-mono">{meta.prefix}</span>
                    <span className="text-muted-foreground">
                      {' '}· created {meta.createdAt ? new Date(meta.createdAt).toLocaleString() : '-'}
                      {' '}· last used {meta.lastUsedAt ? new Date(meta.lastUsedAt).toLocaleString() : 'never'}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">No API key yet.</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={generate} disabled={busy}>
                  <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
                  {meta?.exists ? 'Regenerate' : 'Generate'}
                </Button>
                {meta?.exists && (
                  <Button size="sm" variant="ghost" onClick={revoke} disabled={busy} title="Revoke">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Connection info */}
            <CopyField label="Header name" value={meta?.headerName ?? 'X-API-Key'} />
            <CopyField label="Base URL" value={baseUrl} />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Interactive API documentation (Swagger)</p>
              <Button size="sm" variant="outline" asChild>
                <a href={docsUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                  Open API docs
                </a>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
