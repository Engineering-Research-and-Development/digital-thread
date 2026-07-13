import { useCallback, useEffect, useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { WipOverlay } from '@/components/common/wip-overlay'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Table as TableEl,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import {
  Activity,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  KeyRound,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import {
  api,
  type AccessLogEntry,
  type AdminAuditEntry,
  type AuditSummary,
  type LoginAuditEntry,
  type PaginatedAudit,
  type ParsedMetric,
  type ParsedMetricsSnapshot,
} from '@/lib/api'

const PAGE_SIZE = 50

/**
 * Audit Console - SUPERADMIN-only system-wide visibility into who did what.
 *
 * Four read-only tabs over append-only data:
 *   - System-wide actions: every mutating HTTP request by ANY role
 *   - File access: read audit (VIEW/DOWNLOAD/EXPORT)
 *   - Logins: success + failure with reason and IP
 *   - Metrics: parsed Prometheus snapshot from the in-process registry
 */
export function AuditAdmin() {
  const [summary, setSummary] = useState<AuditSummary | null>(null)
  const refresh = useCallback(() => {
    api.audit.summary().then(setSummary).catch(() => setSummary(null))
  }, [])
  useEffect(() => { refresh() }, [refresh])

  return (
    <WipOverlay>
      <TopBar
        title="Audit"
        subtitle="System-wide audit log and metrics"
        actions={
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        }
      />
      <div className="p-6 space-y-4">
        <SummaryCards summary={summary} />
        <Tabs defaultValue="admin">
          <TabsList>
            <TabsTrigger value="admin" className="gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Admin actions
            </TabsTrigger>
            <TabsTrigger value="access" className="gap-1.5">
              <Eye className="h-3.5 w-3.5" /> File access
            </TabsTrigger>
            <TabsTrigger value="logins" className="gap-1.5">
              <KeyRound className="h-3.5 w-3.5" /> Logins
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-1.5">
              <Activity className="h-3.5 w-3.5" /> Metrics
            </TabsTrigger>
          </TabsList>
          <TabsContent value="admin"><AdminAuditTab /></TabsContent>
          <TabsContent value="access"><AccessLogTab /></TabsContent>
          <TabsContent value="logins"><LoginAuditTab /></TabsContent>
          <TabsContent value="metrics"><MetricsTab /></TabsContent>
        </Tabs>
      </div>
    </WipOverlay>
  )
}

// ─── Summary header ──────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: AuditSummary | null }) {
  if (!summary) {
    return (
      <Card>
        <CardContent className="p-4 text-xs text-muted-foreground">Loading summary…</CardContent>
      </Card>
    )
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat
        title="System-wide actions (24h)"
        value={summary.adminAudit.last24h}
        sub={`${summary.adminAudit.total.toLocaleString()} all-time`}
        icon={Shield}
      />
      <Stat
        title="File access (24h)"
        value={summary.accessLog.last24h}
        sub={`${summary.accessLog.total.toLocaleString()} all-time`}
        icon={Eye}
      />
      <Stat
        title="Successful logins (24h)"
        value={summary.login.last24hSuccess}
        sub={`${summary.login.last24hFailed} failed`}
        icon={KeyRound}
        tone={summary.login.last24hFailed > 0 ? 'warn' : 'normal'}
      />
      <Stat
        title="Actions by role (24h)"
        value={summary.adminActionsByRoleLast24h.reduce((a, b) => a + b.count, 0)}
        sub={summary.adminActionsByRoleLast24h.map((b) => `${b.role}: ${b.count}`).join(' · ') || 'no actions'}
        icon={ShieldCheck}
      />
    </div>
  )
}

function Stat({
  title,
  value,
  sub,
  icon: Icon,
  tone = 'normal',
}: {
  title: string
  value: number
  sub: string
  icon: typeof Shield
  tone?: 'normal' | 'warn'
}) {
  return (
    <Card>
      <CardContent className="p-3 space-y-1">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          <Icon className={`h-3 w-3 ${tone === 'warn' ? 'text-amber-400' : ''}`} />
          {title}
        </div>
        <div className="text-2xl font-semibold">{value.toLocaleString()}</div>
        <div className="text-[11px] text-muted-foreground truncate" title={sub}>{sub}</div>
      </CardContent>
    </Card>
  )
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
}

const ROLE_COLOR: Record<string, string> = {
  SUPERADMIN: 'text-red-300 bg-red-500/10 border-red-500/30',
  OWNER: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  OPERATOR: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
  // Legacy 'PARTNER' actor-role rows (from before the role was renamed to OPERATOR) fall back to the default colour.
}

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return <span className="text-[11px] text-muted-foreground italic">unknown</span>
  const cls = ROLE_COLOR[role] ?? 'text-slate-300 bg-slate-500/10 border-slate-500/30'
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${cls}`}>{role}</span>
}

function MethodBadge({ action }: { action: string }) {
  const method = action.split(' ')[0]
  const color: Record<string, string> = {
    POST:   'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    PUT:    'bg-blue-500/15 text-blue-300 border-blue-500/30',
    PATCH:  'bg-blue-500/15 text-blue-300 border-blue-500/30',
    DELETE: 'bg-red-500/15 text-red-300 border-red-500/30',
  }
  const cls = color[method] ?? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border font-mono ${cls}`}>{method}</span>
}

function Pagination({
  total,
  limit,
  offset,
  onOffsetChange,
}: {
  total: number
  limit: number
  offset: number
  onOffsetChange: (n: number) => void
}) {
  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil(total / limit))
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">
        {total === 0 ? 'No rows' : `Showing ${offset + 1}–${Math.min(offset + limit, total)} of ${total.toLocaleString()}`}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" disabled={offset === 0} onClick={() => onOffsetChange(Math.max(0, offset - limit))}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <span className="px-2">{page} / {pages}</span>
        <Button variant="ghost" size="sm" disabled={offset + limit >= total} onClick={() => onOffsetChange(offset + limit)}>
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ─── System-wide actions tab ───────────────────────────────────────────────────────

function AdminAuditTab() {
  const [data, setData] = useState<PaginatedAudit<AdminAuditEntry> | null>(null)
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [role, setRole] = useState<string>('ALL')
  const [target, setTarget] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api.audit
      .admin({
        limit: PAGE_SIZE,
        offset,
        search: search.trim() || undefined,
        actorRole: role === 'ALL' ? undefined : role,
        targetType: target.trim() || undefined,
      })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [offset, search, role, target])

  useEffect(() => { load() }, [load])

  // Reset to page 0 when filters change.
  useEffect(() => { setOffset(0) }, [search, role, target])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Shield className="h-4 w-4" /> System-wide actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input placeholder="Search action / target / detail…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs" />
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All roles</SelectItem>
              <SelectItem value="SUPERADMIN">SUPERADMIN</SelectItem>
              <SelectItem value="OWNER">OWNER</SelectItem>
              <SelectItem value="OPERATOR">OPERATOR</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Target type (e.g. users, partners…)" value={target} onChange={(e) => setTarget(e.target.value)} className="h-8 text-xs" />
          <div className="text-[11px] text-muted-foreground self-center">
            {loading ? 'Loading…' : data ? `${data.total.toLocaleString()} entries match` : ''}
          </div>
        </div>

        <div className="rounded border border-border overflow-x-auto">
          <TableEl>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">When</TableHead>
                <TableHead className="text-xs">Actor</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs">Method</TableHead>
                <TableHead className="text-xs">Action</TableHead>
                <TableHead className="text-xs">Target</TableHead>
                <TableHead className="text-xs">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((row) => (
                <>
                  <TableRow
                    key={row.id}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  >
                    <TableCell className="text-xs whitespace-nowrap">{fmtTime(row.timestamp)}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{row.actor?.fullName ?? row.actor?.email ?? row.actorUserId.slice(0, 8)}</div>
                      <div className="text-[10px] text-muted-foreground">{row.actor?.email}</div>
                    </TableCell>
                    <TableCell><RoleBadge role={row.actorRole ?? row.actor?.role ?? null} /></TableCell>
                    <TableCell><MethodBadge action={row.action} /></TableCell>
                    <TableCell className="text-xs font-mono">{row.action.split(' ').slice(1).join(' ')}</TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono text-muted-foreground">{row.targetType}</span>
                      {row.targetId ? <span className="text-[10px] ml-1">{row.targetId.slice(0, 8)}…</span> : null}
                    </TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">{row.ip ?? '-'}</TableCell>
                  </TableRow>
                  {expanded === row.id && row.detail && (
                    <TableRow key={`${row.id}-detail`} className="bg-muted/20">
                      <TableCell colSpan={7} className="p-2">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Request body (scrubbed, truncated)</div>
                        <pre className="text-[11px] font-mono whitespace-pre-wrap break-words bg-background/40 rounded p-2">
                          {prettyJson(row.detail)}
                        </pre>
                      </TableCell>
                    </TableRow>
                  )}
                </>
              ))}
              {!loading && data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground italic">
                    No system-wide actions match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableEl>
        </div>

        {data && <Pagination total={data.total} limit={data.limit} offset={data.offset} onOffsetChange={setOffset} />}
      </CardContent>
    </Card>
  )
}

function prettyJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
}

// ─── File access tab ─────────────────────────────────────────────────────────

const ACCESS_ACTION_COLOR: Record<string, string> = {
  VIEW: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  DOWNLOAD: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  EXPORT: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
}

function AccessLogTab() {
  const [data, setData] = useState<PaginatedAudit<AccessLogEntry> | null>(null)
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const [resourceType, setResourceType] = useState<string>('ALL')
  const [action, setAction] = useState<string>('ALL')
  const [classification, setClassification] = useState<string>('ALL')

  const load = useCallback(() => {
    setLoading(true)
    api.audit
      .access({
        limit: PAGE_SIZE,
        offset,
        resourceType: resourceType === 'ALL' ? undefined : resourceType,
        action: action === 'ALL' ? undefined : action,
        classification: classification === 'ALL' ? undefined : classification,
      })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [offset, resourceType, action, classification])

  useEffect(() => { load() }, [load])
  useEffect(() => { setOffset(0) }, [resourceType, action, classification])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Eye className="h-4 w-4" /> File access (read audit)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Select value={resourceType} onValueChange={setResourceType}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Resource type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All resources</SelectItem>
              <SelectItem value="FileRecord">FileRecord</SelectItem>
              <SelectItem value="Iteration">Iteration</SelectItem>
              <SelectItem value="TimelineEvent">TimelineEvent</SelectItem>
              <SelectItem value="Manifest">Manifest</SelectItem>
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All actions</SelectItem>
              <SelectItem value="VIEW">VIEW</SelectItem>
              <SelectItem value="DOWNLOAD">DOWNLOAD</SelectItem>
              <SelectItem value="EXPORT">EXPORT</SelectItem>
            </SelectContent>
          </Select>
          <Select value={classification} onValueChange={setClassification}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Classification" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All classifications</SelectItem>
              <SelectItem value="PUBLIC">PUBLIC</SelectItem>
              <SelectItem value="INTERNAL">INTERNAL</SelectItem>
              <SelectItem value="OPERATOR">OPERATOR</SelectItem>
              <SelectItem value="CONFIDENTIAL">CONFIDENTIAL</SelectItem>
              <SelectItem value="RESTRICTED">RESTRICTED</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-[11px] text-muted-foreground self-center">
            {loading ? 'Loading…' : data ? `${data.total.toLocaleString()} entries match` : ''}
          </div>
        </div>

        <div className="rounded border border-border overflow-x-auto">
          <TableEl>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">When</TableHead>
                <TableHead className="text-xs">User</TableHead>
                <TableHead className="text-xs">Role</TableHead>
                <TableHead className="text-xs">Action</TableHead>
                <TableHead className="text-xs">Resource</TableHead>
                <TableHead className="text-xs">Classification</TableHead>
                <TableHead className="text-xs">IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((row) => {
                const cls = ACCESS_ACTION_COLOR[row.action] ?? 'bg-slate-500/15 text-slate-300 border-slate-500/30'
                return (
                  <TableRow key={row.id}>
                    <TableCell className="text-xs whitespace-nowrap">{fmtTime(row.timestamp)}</TableCell>
                    <TableCell className="text-xs">
                      <div className="font-medium">{row.user?.fullName ?? row.user?.email ?? row.userId.slice(0, 8)}</div>
                      <div className="text-[10px] text-muted-foreground">{row.user?.email}</div>
                    </TableCell>
                    <TableCell><RoleBadge role={row.user?.role ?? null} /></TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border font-mono ${cls}`}>
                        {row.action}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono text-muted-foreground">{row.resourceType}</span>
                      <span className="text-[10px] ml-1">{row.resourceId.slice(0, 12)}…</span>
                    </TableCell>
                    <TableCell>{row.classification ? <Badge variant="outline" className="text-[10px]">{row.classification}</Badge> : '-'}</TableCell>
                    <TableCell className="text-[10px] font-mono text-muted-foreground">{row.ip ?? '-'}</TableCell>
                  </TableRow>
                )
              })}
              {!loading && data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground italic">
                    No access events match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableEl>
        </div>

        {data && <Pagination total={data.total} limit={data.limit} offset={data.offset} onOffsetChange={setOffset} />}
      </CardContent>
    </Card>
  )
}

// ─── Login audit tab ─────────────────────────────────────────────────────────

function LoginAuditTab() {
  const [data, setData] = useState<PaginatedAudit<LoginAuditEntry> | null>(null)
  const [loading, setLoading] = useState(false)
  const [offset, setOffset] = useState(0)
  const [emailFilter, setEmailFilter] = useState('')
  const [outcome, setOutcome] = useState<string>('ALL')

  const load = useCallback(() => {
    setLoading(true)
    api.audit
      .logins({
        limit: PAGE_SIZE,
        offset,
        email: emailFilter.trim() || undefined,
        success: outcome === 'ALL' ? undefined : outcome === 'SUCCESS',
      })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [offset, emailFilter, outcome])

  useEffect(() => { load() }, [load])
  useEffect(() => { setOffset(0) }, [emailFilter, outcome])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> Login attempts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <Input placeholder="Email…" value={emailFilter} onChange={(e) => setEmailFilter(e.target.value)} className="h-8 text-xs" />
          <Select value={outcome} onValueChange={setOutcome}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Outcome" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All outcomes</SelectItem>
              <SelectItem value="SUCCESS">Successful</SelectItem>
              <SelectItem value="FAILURE">Failed</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-[11px] text-muted-foreground self-center">
            {loading ? 'Loading…' : data ? `${data.total.toLocaleString()} entries match` : ''}
          </div>
        </div>

        <div className="rounded border border-border overflow-x-auto">
          <TableEl>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">When</TableHead>
                <TableHead className="text-xs">Email</TableHead>
                <TableHead className="text-xs">User</TableHead>
                <TableHead className="text-xs">Outcome</TableHead>
                <TableHead className="text-xs">Reason</TableHead>
                <TableHead className="text-xs">IP</TableHead>
                <TableHead className="text-xs">User-Agent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="text-xs whitespace-nowrap">{fmtTime(row.timestamp)}</TableCell>
                  <TableCell className="text-xs font-mono">{row.email}</TableCell>
                  <TableCell className="text-xs">
                    {row.user ? (
                      <>
                        <div>{row.user.fullName ?? row.user.email}</div>
                        <RoleBadge role={row.user.role} />
                      </>
                    ) : (
                      <span className="text-muted-foreground italic">unknown user</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.success ? (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                        <ShieldCheck className="h-3 w-3" /> success
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border bg-red-500/15 text-red-300 border-red-500/30">
                        <ShieldAlert className="h-3 w-3" /> failed
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-[10px] text-muted-foreground">{row.reason ?? '-'}</TableCell>
                  <TableCell className="text-[10px] font-mono text-muted-foreground">{row.ip ?? '-'}</TableCell>
                  <TableCell className="text-[10px] text-muted-foreground truncate max-w-[180px]" title={row.userAgent ?? ''}>
                    {row.userAgent ?? '-'}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && data?.items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground italic">
                    No login attempts match.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableEl>
        </div>

        {data && <Pagination total={data.total} limit={data.limit} offset={data.offset} onOffsetChange={setOffset} />}
      </CardContent>
    </Card>
  )
}

// ─── Metrics tab ─────────────────────────────────────────────────────────────

function MetricsTab() {
  const [snap, setSnap] = useState<ParsedMetricsSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    api.audit.metrics().then(setSnap).catch(() => setSnap(null)).finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (!snap) return []
    const q = search.trim().toLowerCase()
    if (!q) return snap.metrics
    return snap.metrics.filter((m) => m.name.toLowerCase().includes(q))
  }, [snap, search])

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Activity className="h-4 w-4" /> Prometheus metrics
            <span className="text-xs text-muted-foreground font-normal">
              {snap ? `snapshot ${new Date(snap.generatedAt).toLocaleTimeString()}` : ''}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? 'Hide raw' : 'Show raw'}
            </Button>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
            </Button>
            {snap && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const blob = new Blob([snap.raw], { type: 'text/plain' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `metrics-${new Date().toISOString()}.txt`
                  document.body.appendChild(a); a.click(); document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                }}
              >
                <Download className="h-3.5 w-3.5 mr-1" /> Raw
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Parsed snapshot of the in-process Prometheus registry (same source as <span className="font-mono">GET /metrics</span>).
          Counters and gauges show their current values; histograms/summaries collapse to total count + sum.
        </p>
        <Input placeholder="Filter by metric name…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs max-w-sm" />
        {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
        {!loading && filtered.length === 0 && (
          <div className="text-xs text-muted-foreground italic flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" /> No metrics found.
          </div>
        )}
        <div className="grid md:grid-cols-2 gap-3">
          {filtered.map((m) => <MetricCard key={m.name} metric={m} />)}
        </div>
        {showRaw && snap && (
          <pre className="text-[10px] font-mono whitespace-pre-wrap break-words bg-muted/40 rounded p-3 max-h-[400px] overflow-auto">
            {snap.raw}
          </pre>
        )}
      </CardContent>
    </Card>
  )
}

function MetricCard({ metric }: { metric: ParsedMetric }) {
  const grouped = useMemo(() => {
    if (metric.type !== 'summary') return null
    // Pair _count/_sum samples by label set to display a single row per series.
    const byKey = new Map<string, { labels: Record<string, string>; count?: number; sum?: number }>()
    for (const s of metric.samples) {
      const key = JSON.stringify(s.labels)
      const row = byKey.get(key) ?? { labels: s.labels }
      if (s.suffix === 'count') row.count = s.value
      else if (s.suffix === 'sum') row.sum = s.value
      byKey.set(key, row)
    }
    return Array.from(byKey.values())
  }, [metric])

  return (
    <Card>
      <CardHeader className="pb-1.5">
        <CardTitle className="text-xs font-mono flex items-center justify-between">
          <span className="truncate">{metric.name}</span>
          <Badge variant="outline" className="text-[9px] uppercase">{metric.type}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-[11px] space-y-1.5">
        {metric.type === 'summary' && grouped ? (
          grouped.length === 0 ? (
            <div className="text-muted-foreground italic">No samples.</div>
          ) : (
            grouped.map((g, i) => {
              const avg = g.count && g.sum ? g.sum / g.count : null
              return (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground truncate" title={labelsText(g.labels)}>{labelsText(g.labels)}</span>
                  <span className="font-mono">
                    {g.count ?? 0}× · sum {fmtNumber(g.sum ?? 0)}
                    {avg != null ? ` · avg ${fmtNumber(avg)}` : ''}
                  </span>
                </div>
              )
            })
          )
        ) : metric.samples.length === 0 ? (
          <div className="text-muted-foreground italic">No samples.</div>
        ) : (
          metric.samples.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground truncate" title={labelsText(s.labels)}>{labelsText(s.labels) || '-'}</span>
              <span className="font-mono">{fmtNumber(s.value)}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}

function labelsText(labels: Record<string, string>): string {
  const entries = Object.entries(labels)
  if (entries.length === 0) return ''
  return entries.map(([k, v]) => `${k}=${v}`).join(' · ')
}

function fmtNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString()
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 1 })
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 })
}
