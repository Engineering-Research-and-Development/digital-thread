import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2, Users, UserCog, KeyRound, Database, Layers, Mail } from 'lucide-react'
import { NodeTemplatesTab } from '@/components/settings/node-templates-tab'
import { WipOverlay } from '@/components/common/wip-overlay'
import { CountrySelect } from '@/components/common/country-select'
import { countryLabel } from '@/data/countries'
import { usePartnerStore } from '@/stores/partner-store'
import { useDataSourceStore } from '@/stores/datasource-store'
import { useMachineStore } from '@/stores/machine-store'
import { DataSourceType, DataSourceProtocol } from '@/types/enums'
import type { Partner, DataSource } from '@/types/state-machine'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/sonner'
import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export function Settings() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage consortium partners, access accounts and data source configurations
        </p>
      </div>

      <Tabs defaultValue="partners">
        <TabsList>
          <TabsTrigger value="partners" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Partners
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5">
            <UserCog className="h-3.5 w-3.5" />
            Users
          </TabsTrigger>
          <TabsTrigger value="datasources" className="gap-1.5">
            <Database className="h-3.5 w-3.5" />
            Data Sources
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-1.5">
            <Layers className="h-3.5 w-3.5" />
            Node templates
          </TabsTrigger>
          <TabsTrigger value="smtp" className="gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Email (SMTP)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="partners" className="mt-4">
          <PartnersTab />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>
        <TabsContent value="datasources" className="mt-4">
          <WipOverlay variant="section">
            <DataSourcesTab />
          </WipOverlay>
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <WipOverlay variant="section">
            <NodeTemplatesTab />
          </WipOverlay>
        </TabsContent>
        <TabsContent value="smtp" className="mt-4">
          <WipOverlay variant="section">
            <SmtpTab />
          </WipOverlay>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============== SMTP / EMAIL TAB ==============
// SUPERADMIN-editable SMTP relay used to deliver email notifications. Persisted
// (encrypted) server-side; overrides the legacy SMTP_URL env var.
function SmtpTab() {
  const [cfg, setCfg] = useState({
    host: '',
    port: 587,
    secure: false,
    username: '',
    password: '',
    fromAddress: '',
    fromName: '',
  })
  const [source, setSource] = useState<'db' | 'env' | 'none'>('none')
  const [hasPassword, setHasPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testTo, setTestTo] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const current = await api.notifications.getSmtp()
        if (current) {
          setSource(current.source ?? 'none')
          setHasPassword(!!current.hasPassword)
          if (current.source === 'db') {
            setCfg({
              host: current.host ?? '',
              port: current.port ?? 587,
              secure: !!current.secure,
              username: current.username ?? '',
              password: '',
              fromAddress: current.fromAddress ?? '',
              fromName: current.fromName ?? '',
            })
          }
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const body: any = {
        host: cfg.host,
        port: Number(cfg.port),
        secure: cfg.secure,
        username: cfg.username || undefined,
        fromAddress: cfg.fromAddress,
        fromName: cfg.fromName || undefined,
      }
      if (cfg.password) body.password = cfg.password
      const res = await api.notifications.saveSmtp(body)
      setSource('db')
      setHasPassword(!!res?.hasPassword)
      setCfg((c) => ({ ...c, password: '' }))
      toast.success('SMTP configuration saved')
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to save SMTP config')
    } finally {
      setSaving(false)
    }
  }

  const sendTest = async () => {
    if (!testTo.trim()) {
      toast.error('Enter a recipient address')
      return
    }
    try {
      await api.notifications.testSmtp(testTo.trim())
      toast.success(`Test email sent to ${testTo}`)
    } catch (e: any) {
      toast.error(e?.message ?? 'Test email failed')
    }
  }

  if (loading) return <p className="text-xs text-muted-foreground">Loading…</p>

  return (
    <div className="max-w-xl space-y-4">
      <p className="text-xs text-muted-foreground">
        SMTP relay used to deliver email notifications. Credentials are stored encrypted.
        {source === 'env' && ' Currently using the SMTP_URL environment variable - saving here overrides it.'}
        {source === 'none' && ' No SMTP configured yet - email notifications will not be sent until you set this up.'}
        {source === 'db' && ' Active source: saved configuration.'}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1 col-span-2">
          <Label className="text-xs">Host</Label>
          <Input className="h-8 text-xs" placeholder="smtp.example.com" value={cfg.host} onChange={(e) => setCfg({ ...cfg, host: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Port</Label>
          <Input className="h-8 text-xs" type="number" value={cfg.port} onChange={(e) => setCfg({ ...cfg, port: Number(e.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">TLS</Label>
          <Select value={cfg.secure ? 'true' : 'false'} onValueChange={(v) => setCfg({ ...cfg, secure: v === 'true' })}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="false">STARTTLS / none (e.g. 587)</SelectItem>
              <SelectItem value="true">Implicit TLS (e.g. 465)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Username</Label>
          <Input className="h-8 text-xs" autoComplete="off" value={cfg.username} onChange={(e) => setCfg({ ...cfg, username: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Password{hasPassword && <span className="text-muted-foreground"> (blank = keep)</span>}</Label>
          <Input className="h-8 text-xs" type="password" autoComplete="new-password" placeholder={hasPassword ? '•••• unchanged' : ''} value={cfg.password} onChange={(e) => setCfg({ ...cfg, password: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From address</Label>
          <Input className="h-8 text-xs" placeholder="noreply@digital-thread.local" value={cfg.fromAddress} onChange={(e) => setCfg({ ...cfg, fromAddress: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">From name (optional)</Label>
          <Input className="h-8 text-xs" placeholder="Digital Thread" value={cfg.fromName} onChange={(e) => setCfg({ ...cfg, fromName: e.target.value })} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>

      <div className="border-t border-border pt-4 space-y-2">
        <Label className="text-xs">Send a test email</Label>
        <div className="flex gap-2">
          <Input className="h-8 text-xs flex-1" placeholder="recipient@example.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          <Button size="sm" variant="outline" onClick={sendTest}>Send test</Button>
        </div>
      </div>
    </div>
  )
}

// ============== PARTNERS TAB ==============

function PartnersTab() {
  const { partners, addPartner, updatePartner, deletePartner } = usePartnerStore()
  const { machines } = useMachineStore()
  const confirm = useConfirm()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Partner | null>(null)

  const partnerList = Object.values(partners)

  const countPartnerUsage = (partner: Partner): number => {
    let count = 0
    for (const m of Object.values(machines)) {
      for (const n of m.nodes) {
        if (n.responsiblePartner === partner.name) count++
      }
    }
    return count
  }

  const handleAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const handleEdit = (p: Partner) => {
    setEditing(p)
    setDialogOpen(true)
  }

  const handleDelete = async (p: Partner) => {
    const usage = countPartnerUsage(p)
    const ok = await confirm({
      title: `Delete partner "${p.name}"?`,
      description: usage > 0 ? (
        <>
          This partner is assigned to <strong>{usage} node{usage === 1 ? '' : 's'}</strong> across your state machines.
          Those nodes will lose their assignment and may need to be reconfigured.
        </>
      ) : (
        <>This partner has no active assignments. This action cannot be undone.</>
      ),
      confirmLabel: 'Delete partner',
      destructive: true,
    })
    if (!ok) return
    try {
      await deletePartner(p.id)
      toast.success(`Partner "${p.name}" deleted`)
    } catch (e: any) {
      toast.error(`Failed to delete partner: ${e?.message ?? 'unknown error'}`)
    }
  }

  const handleSave = async (data: Omit<Partner, 'id'>) => {
    try {
      if (editing) {
        await updatePartner(editing.id, data)
        toast.success(`Partner "${data.name}" updated`)
      } else {
        await addPartner({ id: `p-${Date.now()}`, ...data })
        toast.success(`Partner "${data.name}" added`)
      }
      setDialogOpen(false)
    } catch (e: any) {
      toast.error(`Failed to save partner: ${e?.message ?? 'unknown error'}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Define the consortium partners who participate in the digital thread workflow.
        </p>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Partner
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">Color</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Country</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {partnerList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <Users className="h-6 w-6 opacity-50" />
                    <span>No partners defined yet</span>
                    <Button size="sm" variant="outline" onClick={handleAdd}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add first partner
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              partnerList.map((p) => {
                const usage = countPartnerUsage(p)
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="w-5 h-5 rounded-full border" style={{ backgroundColor: p.color }} aria-label={`Color ${p.color}`} />
                    </TableCell>
                    <TableCell className="font-semibold text-sm">
                      <div className="flex items-center gap-2">
                        <span>{p.name}</span>
                        {usage > 0 && (
                          <Badge variant="secondary" className="text-[10px]" title={`Assigned to ${usage} node${usage === 1 ? '' : 's'}`}>
                            {usage} in use
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.fullName}</TableCell>
                    <TableCell>
                      {p.country ? (
                        <Badge variant="secondary" className="text-[10px] font-mono" title={countryLabel(p.country)}>
                          {p.country.toUpperCase()}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.role && <Badge variant="outline" className="text-[10px]">{p.role}</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(p)}
                          aria-label={`Edit partner ${p.name}`}
                          title="Edit"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(p)}
                          aria-label={`Delete partner ${p.name}`}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <PartnerDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initial={editing}
      />
    </div>
  )
}

function PartnerDialog({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Omit<Partner, 'id'>) => void
  initial: Partner | null
}) {
  const [name, setName] = useState('')
  const [fullName, setFullName] = useState('')
  const [country, setCountry] = useState('')
  const [role, setRole] = useState('')
  const [color, setColor] = useState('#60A5FA')

  // Repopulate the form every time the dialog opens. The dialog is controlled
  // by the parent (`open` prop set in handleEdit/handleAdd), so Radix's
  // onOpenChange does NOT fire on programmatic open - a useEffect on `open` is
  // the reliable place to seed the fields (otherwise Edit shows a blank form).
  useEffect(() => {
    if (!open) return
    setName(initial?.name || '')
    setFullName(initial?.fullName || '')
    setCountry(initial?.country || '')
    setRole(initial?.role || '')
    setColor(initial?.color || '#60A5FA')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const canSubmit = !!name.trim() && !!fullName.trim() && !!country

  const handleSubmit = () => {
    if (!canSubmit) return
    onSave({ name: name.trim(), fullName: fullName.trim(), country, role: role.trim() || undefined, color })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Partner' : 'Add Partner'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Short Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CAI" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Centro Aeronautico Italiano" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              Country <span className="text-red-500" aria-hidden="true">*</span>
            </Label>
            <CountrySelect value={country} onChange={setCountry} placeholder="Select country…" />
            {!country && (
              <p className="text-[10px] text-red-400">A partner must have a country.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Design Authority" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-8 w-8 rounded cursor-pointer border border-border"
              />
              <Input value={color} onChange={(e) => setColor(e.target.value)} className="w-28 font-mono text-xs" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {initial ? 'Update' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============== DATA SOURCES TAB ==============

const DS_TYPE_LABELS: Record<string, string> = {
  [DataSourceType.API]: 'API',
  [DataSourceType.DATABASE]: 'Database',
  [DataSourceType.FILE_SYSTEM]: 'File System',
  [DataSourceType.SENSOR]: 'Sensor',
}

const DS_PROTOCOL_LABELS: Record<string, string> = {
  [DataSourceProtocol.HTTP]: 'HTTP',
  [DataSourceProtocol.MQTT]: 'MQTT',
  [DataSourceProtocol.KAFKA]: 'Kafka',
  [DataSourceProtocol.OPC_UA]: 'OPC UA',
}

const DS_TYPE_COLORS: Record<string, string> = {
  [DataSourceType.API]: 'text-blue-400 border-blue-500/30',
  [DataSourceType.DATABASE]: 'text-violet-400 border-violet-500/30',
  [DataSourceType.FILE_SYSTEM]: 'text-emerald-400 border-emerald-500/30',
  [DataSourceType.SENSOR]: 'text-amber-400 border-amber-500/30',
}

function DataSourcesTab() {
  const { sources, addSource, updateSource, deleteSource } = useDataSourceStore()
  const { machines } = useMachineStore()
  const confirm = useConfirm()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DataSource | null>(null)

  const sourceList = Object.values(sources)

  const countSourceUsage = (s: DataSource): number => {
    let count = 0
    for (const m of Object.values(machines)) {
      for (const n of m.nodes) {
        for (const input of n.config?.inputs ?? []) {
          if (input.dataSourceId === s.id) count++
        }
      }
    }
    return count
  }

  const handleAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const handleEdit = (s: DataSource) => {
    setEditing(s)
    setDialogOpen(true)
  }

  const handleDelete = async (s: DataSource) => {
    const usage = countSourceUsage(s)
    const ok = await confirm({
      title: `Delete data source "${s.name}"?`,
      description: usage > 0 ? (
        <>
          This data source is referenced by <strong>{usage} node input{usage === 1 ? '' : 's'}</strong>.
          Those inputs will become orphaned and will need to be reconfigured.
        </>
      ) : (
        <>This data source is not referenced by any node. This action cannot be undone.</>
      ),
      confirmLabel: 'Delete data source',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteSource(s.id)
      toast.success(`Data source "${s.name}" deleted`)
    } catch (e: any) {
      toast.error(`Failed to delete data source: ${e?.message ?? 'unknown error'}`)
    }
  }

  const handleSave = async (data: Omit<DataSource, 'id'>) => {
    try {
      if (editing) {
        await updateSource(editing.id, data)
        toast.success(`Data source "${data.name}" updated`)
      } else {
        await addSource({ id: `ds-${Date.now()}`, ...data })
        toast.success(`Data source "${data.name}" added`)
      }
      setDialogOpen(false)
    } catch (e: any) {
      toast.error(`Failed to save data source: ${e?.message ?? 'unknown error'}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure automatic data sources available for state machine node connections.
        </p>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add Data Source
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Protocol</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sourceList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <Database className="h-6 w-6 opacity-50" />
                    <span>No data sources configured yet</span>
                    <Button size="sm" variant="outline" onClick={handleAdd}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add first data source
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              sourceList.map((s) => {
                const usage = countSourceUsage(s)
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-semibold text-sm">
                      <div className="flex items-center gap-2">
                        <span>{s.name}</span>
                        {usage > 0 && (
                          <Badge variant="secondary" className="text-[10px]" title={`Referenced by ${usage} input${usage === 1 ? '' : 's'}`}>
                            {usage} in use
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${DS_TYPE_COLORS[s.type] || ''}`}>
                        {DS_TYPE_LABELS[s.type] || s.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {s.protocol ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {DS_PROTOCOL_LABELS[s.protocol] || s.protocol}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground truncate max-w-[200px]" title={s.endpoint}>
                      {s.endpoint}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={s.description}>
                      {s.description}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(s)}
                          aria-label={`Edit data source ${s.name}`}
                          title="Edit"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(s)}
                          aria-label={`Delete data source ${s.name}`}
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <DataSourceDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initial={editing}
      />
    </div>
  )
}

function DataSourceDialog({
  open,
  onClose,
  onSave,
  initial,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: Omit<DataSource, 'id'>) => void
  initial: DataSource | null
}) {
  const [name, setName] = useState('')
  const [type, setType] = useState<string>(DataSourceType.API)
  const [protocol, setProtocol] = useState<string>('')
  const [endpoint, setEndpoint] = useState('')
  const [description, setDescription] = useState('')

  const showProtocol = type === DataSourceType.API || type === DataSourceType.SENSOR

  // Repopulate on open (controlled dialog - see PartnerDialog note: Radix's
  // onOpenChange does not fire on programmatic open, so Edit would be blank).
  useEffect(() => {
    if (!open) return
    setName(initial?.name || '')
    setType(initial?.type || DataSourceType.API)
    setProtocol(initial?.protocol || '')
    setEndpoint(initial?.endpoint || '')
    setDescription(initial?.description || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleSubmit = () => {
    if (!name.trim() || !endpoint.trim()) return
    onSave({
      name: name.trim(),
      type: type as DataSource['type'],
      protocol: showProtocol && protocol ? (protocol as DataSource['protocol']) : undefined,
      endpoint: endpoint.trim(),
      description: description.trim() || undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Data Source' : 'Add Data Source'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. MinIO CAD Storage" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DataSourceType.API}>API</SelectItem>
                <SelectItem value={DataSourceType.DATABASE}>Database</SelectItem>
                <SelectItem value={DataSourceType.FILE_SYSTEM}>File System</SelectItem>
                <SelectItem value={DataSourceType.SENSOR}>Sensor</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {showProtocol && (
            <div className="space-y-1.5">
              <Label className="text-xs">Protocol</Label>
              <Select value={protocol || '__none'} onValueChange={(v) => setProtocol(v === '__none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select protocol..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">None</SelectItem>
                  <SelectItem value={DataSourceProtocol.HTTP}>HTTP</SelectItem>
                  <SelectItem value={DataSourceProtocol.MQTT}>MQTT</SelectItem>
                  <SelectItem value={DataSourceProtocol.KAFKA}>Kafka</SelectItem>
                  <SelectItem value={DataSourceProtocol.OPC_UA}>OPC UA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Endpoint</Label>
            <Input value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="e.g. https://api.example.com/v1" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !endpoint.trim()}>
            {initial ? 'Update' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ============== USERS TAB ==============

interface AppUser {
  id: string
  email: string
  fullName?: string | null
  role: string
  partnerId?: string | null
  partner?: { id: string; name: string } | null
  isActive: boolean
  lastLoginAt?: string | null
}

interface UserFormData {
  email: string
  password?: string
  fullName?: string
  role: string
  partnerId: string | null
  isActive: boolean
}

const ROLE_LABELS: Record<string, string> = {
  [ROLE.SUPERADMIN]: 'Super-admin',
  [ROLE.OWNER]: 'Owner',
  [ROLE.OPERATOR]: 'Operator',
}

const ROLE_BADGE_COLORS: Record<string, string> = {
  [ROLE.SUPERADMIN]: 'text-rose-400 border-rose-500/30',
  [ROLE.OWNER]: 'text-blue-400 border-blue-500/30',
  [ROLE.OPERATOR]: 'text-emerald-400 border-emerald-500/30',
}

function UsersTab() {
  const { partners, init: initPartners } = usePartnerStore()
  const currentUser = useAuthStore((s) => s.user)
  const confirm = useConfirm()
  const [users, setUsers] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [pwDialogOpen, setPwDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [pwTarget, setPwTarget] = useState<AppUser | null>(null)

  const partnerList = Object.values(partners)

  const load = async () => {
    setLoading(true)
    try {
      const result = await api.users.list()
      setUsers(Array.isArray(result) ? (result as AppUser[]) : [])
    } catch (e: any) {
      toast.error(`Failed to load users: ${e?.message ?? 'unknown error'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (Object.keys(partners).length === 0) initPartners()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAdd = () => { setEditing(null); setDialogOpen(true) }
  const handleEdit = (u: AppUser) => { setEditing(u); setDialogOpen(true) }
  const handleResetPassword = (u: AppUser) => { setPwTarget(u); setPwDialogOpen(true) }

  const handleDelete = async (u: AppUser) => {
    const ok = await confirm({
      title: `Delete user "${u.email}"?`,
      description: (
        <>This permanently removes the access account and revokes its active sessions. This action cannot be undone.</>
      ),
      confirmLabel: 'Delete user',
      destructive: true,
    })
    if (!ok) return
    try {
      await api.users.remove(u.id)
      toast.success(`User "${u.email}" deleted`)
      load()
    } catch (e: any) {
      toast.error(`Failed to delete user: ${e?.message ?? 'unknown error'}`)
    }
  }

  const handleSave = async (data: UserFormData) => {
    try {
      if (editing) {
        await api.users.update(editing.id, {
          fullName: data.fullName,
          role: data.role,
          partnerId: data.partnerId,
          isActive: data.isActive,
        })
        toast.success(`User "${editing.email}" updated`)
      } else {
        await api.users.create({
          email: data.email,
          password: data.password!,
          fullName: data.fullName,
          role: data.role,
          partnerId: data.partnerId,
        })
        toast.success(`User "${data.email}" created`)
      }
      setDialogOpen(false)
      load()
    } catch (e: any) {
      toast.error(`Failed to save user: ${e?.message ?? 'unknown error'}`)
    }
  }

  const handleSavePassword = async (newPassword: string) => {
    if (!pwTarget) return
    try {
      await api.users.changePassword(pwTarget.id, newPassword)
      toast.success(`Password updated for "${pwTarget.email}"`)
      setPwDialogOpen(false)
    } catch (e: any) {
      toast.error(`Failed to update password: ${e?.message ?? 'unknown error'}`)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Create and manage platform access accounts. An <strong>Operator</strong> account is bound to a
          consortium partner and only sees its own nodes.
        </p>
        <Button size="sm" onClick={handleAdd}>
          <Plus className="h-3.5 w-3.5 mr-1" />
          Add User
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Full Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Partner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[130px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  Loading users…
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-8">
                  <div className="flex flex-col items-center gap-2">
                    <UserCog className="h-6 w-6 opacity-50" />
                    <span>No users yet</span>
                    <Button size="sm" variant="outline" onClick={handleAdd}>
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add first user
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => {
                const isSelf = u.id === currentUser?.id
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-semibold text-sm">
                      <div className="flex items-center gap-2">
                        <span>{u.email}</span>
                        {isSelf && <Badge variant="secondary" className="text-[10px]">you</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.fullName || '-'}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${ROLE_BADGE_COLORS[u.role] || ''}`}>
                        {ROLE_LABELS[u.role] || u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.partner?.name ? (
                        <Badge variant="secondary" className="text-[10px]">{u.partner.name}</Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {u.isActive ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleResetPassword(u)}
                          aria-label={`Reset password for ${u.email}`}
                          title="Reset / set password"
                        >
                          <KeyRound className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleEdit(u)}
                          aria-label={`Edit user ${u.email}`}
                          title="Edit"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(u)}
                          disabled={isSelf}
                          aria-label={`Delete user ${u.email}`}
                          title={isSelf ? 'You cannot delete your own account' : 'Delete'}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <UserDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initial={editing}
        partners={partnerList}
      />
      <PasswordResetDialog
        open={pwDialogOpen}
        onClose={() => setPwDialogOpen(false)}
        onSave={handleSavePassword}
        user={pwTarget}
      />
    </div>
  )
}

function UserDialog({
  open,
  onClose,
  onSave,
  initial,
  partners,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: UserFormData) => void
  initial: AppUser | null
  partners: Partner[]
}) {
  const isEdit = !!initial
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState<string>(ROLE.OPERATOR)
  const [partnerId, setPartnerId] = useState<string>('')
  const [isActive, setIsActive] = useState(true)

  // Repopulate the form every time the dialog opens.
  useEffect(() => {
    if (!open) return
    setEmail(initial?.email ?? '')
    setPassword('')
    setFullName(initial?.fullName ?? '')
    setRole(initial?.role ?? ROLE.OPERATOR)
    setPartnerId(initial?.partnerId ?? '')
    setIsActive(initial?.isActive ?? true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const requiresPartner = role === ROLE.OPERATOR
  const forbidsPartner = role === ROLE.SUPERADMIN
  const effectivePartnerId = forbidsPartner ? '' : partnerId

  const emailValid = /\S+@\S+\.\S+/.test(email.trim())
  const passwordValid = password.length >= 8
  const canSubmit =
    (isEdit || (emailValid && passwordValid)) &&
    !(requiresPartner && !effectivePartnerId)

  const handleSubmit = () => {
    if (!canSubmit) return
    onSave({
      email: email.trim(),
      password: isEdit ? undefined : password,
      fullName: fullName.trim() || undefined,
      role,
      partnerId: forbidsPartner ? null : (partnerId || null),
      isActive,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit User' : 'Add User'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@partner.eu"
              disabled={isEdit}
              className={isEdit ? 'opacity-70' : undefined}
            />
            {isEdit && <p className="text-[10px] text-muted-foreground">Email cannot be changed.</p>}
          </div>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs">Initial Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
              {password.length > 0 && !passwordValid && (
                <p className="text-[10px] text-red-400">Password must be at least 8 characters.</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jane Doe" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ROLE.SUPERADMIN}>Super-admin</SelectItem>
                <SelectItem value={ROLE.OWNER}>Owner</SelectItem>
                <SelectItem value={ROLE.OPERATOR}>Operator</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">
              Partner {requiresPartner && <span className="text-red-500" aria-hidden="true">*</span>}
            </Label>
            <Select
              value={effectivePartnerId || '__none'}
              onValueChange={(v) => setPartnerId(v === '__none' ? '' : v)}
              disabled={forbidsPartner}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select partner..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">None</SelectItem>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} - {p.fullName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {forbidsPartner && (
              <p className="text-[10px] text-muted-foreground">Super-admin accounts are not bound to a partner.</p>
            )}
            {requiresPartner && !effectivePartnerId && (
              <p className="text-[10px] text-red-400">A partner account must be linked to a partner.</p>
            )}
          </div>

          {isEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs">Status</Label>
              <Select value={isActive ? 'active' : 'inactive'} onValueChange={(v) => setIsActive(v === 'active')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive (cannot sign in)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isEdit ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PasswordResetDialog({
  open,
  onClose,
  onSave,
  user,
}: {
  open: boolean
  onClose: () => void
  onSave: (newPassword: string) => void
  user: AppUser | null
}) {
  const [pw, setPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!open) return
    setPw('')
    setConfirmPw('')
    setShow(false)
  }, [open])

  const tooShort = pw.length > 0 && pw.length < 8
  const mismatch = confirmPw.length > 0 && pw !== confirmPw
  const canSubmit = pw.length >= 8 && pw === confirmPw

  const handleSubmit = () => { if (canSubmit) onSave(pw) }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set new password</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            Set a new password for <strong className="text-foreground">{user?.email}</strong>.
            Their active sessions will be revoked and they will need to sign in again.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">New Password</Label>
            <Input
              type={show ? 'text' : 'password'}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="At least 8 characters"
            />
            {tooShort && <p className="text-[10px] text-red-400">Password must be at least 8 characters.</p>}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Confirm Password</Label>
            <Input
              type={show ? 'text' : 'password'}
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Repeat the password"
            />
            {mismatch && <p className="text-[10px] text-red-400">Passwords do not match.</p>}
          </div>
          <label className="flex items-center gap-2 text-[11px] text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Show password
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>Update password</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
