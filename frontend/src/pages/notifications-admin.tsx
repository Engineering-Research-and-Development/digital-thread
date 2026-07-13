import { useEffect, useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { WipOverlay } from '@/components/common/wip-overlay'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Bell, Webhook, Mail, Plus, Pencil, Trash2, Send } from 'lucide-react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/sonner'
import { api } from '@/lib/api'

type EventDef = { key: string; label: string; description: string }
type AuthType = 'NONE' | 'API_KEY' | 'OAUTH2'

interface ChannelForm {
  id?: string
  kind: 'WEBHOOK' | 'EMAIL'
  label: string
  target: string
  eventTypes: string[]
  secret: string
  authType: AuthType
  headerName: string
  headerValue: string
  tokenUrl: string
  clientId: string
  clientSecret: string
  scope: string
  audience: string
}

const emptyForm = (): ChannelForm => ({
  kind: 'WEBHOOK',
  label: '',
  target: '',
  eventTypes: ['*'],
  secret: '',
  authType: 'NONE',
  headerName: '',
  headerValue: '',
  tokenUrl: '',
  clientId: '',
  clientSecret: '',
  scope: '',
  audience: '',
})

export function NotificationsAdmin() {
  const confirm = useConfirm()
  const [catalog, setCatalog] = useState<EventDef[]>([])
  const [subs, setSubs] = useState<any[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<ChannelForm>(emptyForm())
  const [saving, setSaving] = useState(false)

  const labelFor = useMemo(() => {
    const m = new Map(catalog.map((e) => [e.key, e.label]))
    return (key: string) => (key === '*' ? 'All relevant events' : (m.get(key) ?? key))
  }, [catalog])

  useEffect(() => {
    void refresh()
  }, [])

  const refresh = async () => {
    const [cat, list] = await Promise.all([
      api.notifications.events().catch(() => []),
      api.notifications.listSubscriptions().catch(() => []),
    ])
    setCatalog(cat)
    setSubs(list)
  }

  const openNew = () => {
    setForm(emptyForm())
    setDialogOpen(true)
  }

  const openEdit = (s: any) => {
    setForm({
      id: s.id,
      kind: s.kind,
      label: s.label ?? '',
      target: s.target,
      eventTypes: s.eventTypes ?? ['*'],
      secret: '',
      authType: (s.auth?.type as AuthType) ?? 'NONE',
      headerName: s.auth?.headerName ?? '',
      headerValue: '',
      tokenUrl: s.auth?.tokenUrl ?? '',
      clientId: s.auth?.clientId ?? '',
      clientSecret: '',
      scope: s.auth?.scope ?? '',
      audience: s.auth?.audience ?? '',
    })
    setDialogOpen(true)
  }

  const toggleEvent = (key: string) => {
    setForm((f) => {
      if (key === '*') return { ...f, eventTypes: ['*'] }
      const without = f.eventTypes.filter((x) => x !== '*' && x !== key)
      const has = f.eventTypes.includes(key)
      const next = has ? without : [...without, key]
      return { ...f, eventTypes: next.length ? next : ['*'] }
    })
  }

  const buildBody = (editing: boolean) => {
    const body: any = {
      kind: form.kind,
      label: form.label || undefined,
      target: form.target.trim(),
      eventTypes: form.eventTypes,
      secret: form.secret || undefined,
    }
    if (form.kind === 'WEBHOOK') {
      body.authType = form.authType
      if (form.authType === 'API_KEY') {
        body.authConfig = {
          headerName: form.headerName,
          ...(form.headerValue ? { headerValue: form.headerValue } : {}),
        }
        // On create the value is mandatory; on edit a blank value keeps the stored one.
        if (!editing && form.headerValue) body.authConfig.headerValue = form.headerValue
      } else if (form.authType === 'OAUTH2') {
        body.authConfig = {
          tokenUrl: form.tokenUrl,
          clientId: form.clientId,
          scope: form.scope || undefined,
          audience: form.audience || undefined,
          ...(form.clientSecret ? { clientSecret: form.clientSecret } : {}),
        }
      }
    }
    return body
  }

  const save = async () => {
    if (!form.target.trim()) {
      toast.error('Target is required')
      return
    }
    setSaving(true)
    try {
      if (form.id) {
        await api.notifications.updateSubscription(form.id, buildBody(true))
        toast.success('Channel updated')
      } else {
        await api.notifications.createSubscription(buildBody(false))
        toast.success('Channel created')
      }
      setDialogOpen(false)
      await refresh()
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save channel')
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (s: any) => {
    await api.notifications.updateSubscription(s.id, { enabled: !s.enabled })
    await refresh()
  }

  const remove = async (s: any) => {
    const ok = await confirm({
      title: 'Delete channel?',
      description: `This removes the ${s.kind.toLowerCase()} channel "${s.label ?? s.target}".`,
      confirmLabel: 'Delete',
    })
    if (!ok) return
    await api.notifications.removeSubscription(s.id)
    await refresh()
  }

  const test = async (s: any) => {
    try {
      await api.notifications.testSubscription(s.id)
      toast.success('Test notification sent')
    } catch (e: any) {
      toast.error(e?.message ?? 'Test delivery failed')
    }
  }

  return (
    <WipOverlay>
      <TopBar title="Notifications" subtitle="Your email & webhook channels and delivery history" />
      <div className="p-6">
        <Tabs defaultValue="channels">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="channels" className="gap-1.5">
                <Bell className="h-3.5 w-3.5" /> Channels
              </TabsTrigger>
              <TabsTrigger value="history" className="gap-1.5">
                <Send className="h-3.5 w-3.5" /> History
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="channels" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <Button size="sm" onClick={openNew} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> New channel
              </Button>
            </div>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">My channels</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Events</TableHead>
                      <TableHead>Auth</TableHead>
                      <TableHead>Enabled</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subs.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {s.kind === 'EMAIL' ? <Mail className="h-3.5 w-3.5 text-muted-foreground" /> : <Webhook className="h-3.5 w-3.5 text-muted-foreground" />}
                            <span className="text-xs font-medium">{s.label || s.kind}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-[11px] max-w-[220px] truncate">{s.target}</TableCell>
                        <TableCell className="text-[11px] max-w-[260px]">
                          <div className="flex flex-wrap gap-1">
                            {(s.eventTypes ?? []).map((k: string) => (
                              <Badge key={k} variant="outline" className="text-[10px]">{labelFor(k)}</Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell className="text-[11px]">
                          {s.kind === 'WEBHOOK' ? (s.auth?.type ?? 'NONE') : '-'}
                        </TableCell>
                        <TableCell>{s.enabled ? '✓' : '-'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => test(s)} title="Send test"><Send className="h-3 w-3" /></Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openEdit(s)} title="Edit"><Pencil className="h-3 w-3" /></Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => toggleEnabled(s)}>{s.enabled ? 'Disable' : 'Enable'}</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => remove(s)} title="Delete"><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {subs.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-xs text-muted-foreground py-6 text-center">No channels yet - add an email or webhook to start receiving notifications.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <HistoryTab catalog={catalog} labelFor={labelFor} />
          </TabsContent>
        </Tabs>
      </div>

      <ChannelDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        setForm={setForm}
        catalog={catalog}
        toggleEvent={toggleEvent}
        onSave={save}
        saving={saving}
      />
    </WipOverlay>
  )
}

// ─── Channel create/edit dialog ───────────────────────────────────────────────

function ChannelDialog(props: {
  open: boolean
  onOpenChange: (v: boolean) => void
  form: ChannelForm
  setForm: React.Dispatch<React.SetStateAction<ChannelForm>>
  catalog: EventDef[]
  toggleEvent: (k: string) => void
  onSave: () => void
  saving: boolean
}) {
  const { form, setForm, catalog, toggleEvent } = props
  const editing = !!form.id
  const set = (patch: Partial<ChannelForm>) => setForm((f) => ({ ...f, ...patch }))

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit channel' : 'New channel'}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] pr-3">
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={form.kind} onValueChange={(v) => set({ kind: v as any })}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="WEBHOOK">Webhook (HTTP POST)</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Label</Label>
              <Input className="h-8 text-xs" placeholder="My Slack hook" value={form.label} onChange={(e) => set({ label: e.target.value })} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">{form.kind === 'EMAIL' ? 'Email address' : 'Webhook URL'}</Label>
              <Input className="h-8 text-xs font-mono" placeholder={form.kind === 'EMAIL' ? 'me@example.com' : 'https://hooks.example.com/dt'} value={form.target} onChange={(e) => set({ target: e.target.value })} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Events</Label>
              <div className="flex flex-wrap gap-1.5">
                <EventChip active={form.eventTypes.includes('*')} label="All relevant" onClick={() => toggleEvent('*')} />
                {catalog.map((e) => (
                  <EventChip key={e.key} active={form.eventTypes.includes(e.key)} label={e.label} title={e.description} onClick={() => toggleEvent(e.key)} />
                ))}
              </div>
            </div>

            {form.kind === 'WEBHOOK' && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Authentication</Label>
                  <Select value={form.authType} onValueChange={(v) => set({ authType: v as AuthType })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">None</SelectItem>
                      <SelectItem value="API_KEY">API key (header)</SelectItem>
                      <SelectItem value="OAUTH2">OAuth2 (client credentials)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {form.authType === 'API_KEY' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Header name</Label>
                      <Input className="h-8 text-xs font-mono" placeholder="X-API-Key" value={form.headerName} onChange={(e) => set({ headerName: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Header value{editing && <span className="text-muted-foreground"> (blank = keep)</span>}</Label>
                      <Input className="h-8 text-xs font-mono" type="password" placeholder={editing ? '•••• unchanged' : 'secret-key'} value={form.headerValue} onChange={(e) => set({ headerValue: e.target.value })} />
                    </div>
                  </div>
                )}

                {form.authType === 'OAUTH2' && (
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Token URL</Label>
                      <Input className="h-8 text-xs font-mono" placeholder="https://idp.example.com/oauth/token" value={form.tokenUrl} onChange={(e) => set({ tokenUrl: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Client ID</Label>
                        <Input className="h-8 text-xs font-mono" value={form.clientId} onChange={(e) => set({ clientId: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Client secret{editing && <span className="text-muted-foreground"> (blank = keep)</span>}</Label>
                        <Input className="h-8 text-xs font-mono" type="password" placeholder={editing ? '•••• unchanged' : ''} value={form.clientSecret} onChange={(e) => set({ clientSecret: e.target.value })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Scope (optional)</Label>
                        <Input className="h-8 text-xs font-mono" value={form.scope} onChange={(e) => set({ scope: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Audience (optional)</Label>
                        <Input className="h-8 text-xs font-mono" value={form.audience} onChange={(e) => set({ audience: e.target.value })} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-1">
                  <Label className="text-xs">HMAC signing secret (optional)</Label>
                  <Input className="h-8 text-xs font-mono" placeholder="adds X-DT-Signature header" value={form.secret} onChange={(e) => set({ secret: e.target.value })} />
                </div>
              </>
            )}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => props.onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={props.onSave} disabled={props.saving}>{props.saving ? 'Saving…' : editing ? 'Save' : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EventChip(props: { active: boolean; label: string; title?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      className={`text-[10px] px-2 py-0.5 rounded border ${props.active ? 'bg-blue-500/20 border-blue-500/40' : 'border-border text-muted-foreground'}`}
    >
      {props.label}
    </button>
  )
}

// ─── History tab ───────────────────────────────────────────────────────────────

function HistoryTab(props: { catalog: EventDef[]; labelFor: (k: string) => string }) {
  const PAGE = 25
  const [items, setItems] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [status, setStatus] = useState<string>('all')
  const [eventKey, setEventKey] = useState<string>('all')
  const [detail, setDetail] = useState<any | null>(null)

  const load = async () => {
    const res = await api.notifications.history({
      limit: PAGE,
      offset,
      status: status === 'all' ? undefined : status,
      eventKey: eventKey === 'all' ? undefined : eventKey,
    })
    setItems(res.items)
    setTotal(res.total)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, status, eventKey])

  const resetAndReload = (fn: () => void) => { setOffset(0); fn() }

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">Notification history ({total})</CardTitle>
        <div className="flex gap-2">
          <Select value={status} onValueChange={(v) => resetAndReload(() => setStatus(v))}>
            <SelectTrigger className="h-7 text-xs w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="OK">OK</SelectItem>
              <SelectItem value="ERROR">Error</SelectItem>
              <SelectItem value="PENDING">Pending</SelectItem>
            </SelectContent>
          </Select>
          <Select value={eventKey} onValueChange={(v) => resetAndReload(() => setEventKey(v))}>
            <SelectTrigger className="h-7 text-xs w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All events</SelectItem>
              {props.catalog.map((e) => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tries</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="text-[11px] whitespace-nowrap">{new Date(d.sentAt).toLocaleString()}</TableCell>
                <TableCell className="text-[11px]">{d.eventKey ? props.labelFor(d.eventKey) : d.eventType}</TableCell>
                <TableCell className="text-[11px]">{d.subscription?.kind ?? '-'}</TableCell>
                <TableCell className="font-mono text-[11px] max-w-[200px] truncate">{d.subscription?.target ?? '-'}</TableCell>
                <TableCell><Badge variant={d.status === 'OK' ? 'default' : d.status === 'PENDING' ? 'outline' : 'destructive'}>{d.status}</Badge></TableCell>
                <TableCell className="text-[11px]">{d.attempt}{d.httpStatus ? ` · ${d.httpStatus}` : ''}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => setDetail(d)}>View</Button>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-xs text-muted-foreground py-6 text-center">No notifications yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
        {total > PAGE && (
          <div className="flex items-center justify-end gap-2 mt-3 text-xs">
            <Button size="sm" variant="outline" className="h-7" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Prev</Button>
            <span className="text-muted-foreground">{offset + 1}–{Math.min(offset + PAGE, total)} of {total}</span>
            <Button size="sm" variant="outline" className="h-7" disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
          </div>
        )}
      </CardContent>

      <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="text-sm">{detail?.summary ?? 'Notification detail'}</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-2 text-xs">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
                <span>Event: <span className="text-foreground">{detail.eventKey ?? detail.eventType}</span></span>
                <span>Channel: <span className="text-foreground">{detail.subscription?.kind}</span></span>
                <span>Status: <span className="text-foreground">{detail.status}</span></span>
                <span>Attempts: <span className="text-foreground">{detail.attempt}</span></span>
                {detail.errorMsg && <span>Error: <span className="text-red-400">{detail.errorMsg}</span></span>}
              </div>
              <ScrollArea className="max-h-[50vh] rounded border border-border bg-muted/30 p-3">
                <pre className="text-[11px] whitespace-pre-wrap break-all">{prettyJson(detail.payloadJson)}</pre>
              </ScrollArea>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}
