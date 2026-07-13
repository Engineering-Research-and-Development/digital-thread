import { useEffect, useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { WipOverlay } from '@/components/common/wip-overlay'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ShieldCheck, FileLock2, History, CheckCircle2, XCircle, GitBranch } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'

type FileAccessRow = Awaited<ReturnType<typeof api.governance.fileAccessRequests.list>>[number]

export function GovernanceDashboard() {
  const role = useAuthStore((s) => s.user?.role)
  const isSuper = role === ROLE.SUPERADMIN

  const [dash, setDash] = useState<any | null>(null)
  const [access, setAccess] = useState<any[]>([])
  const [fileRequests, setFileRequests] = useState<FileAccessRow[]>([])

  const refreshFileRequests = () => {
    // No status filter → backend returns the actionable queue + decision history,
    // scoped by role (SUPERADMIN: all; OWNER: pending + own decisions).
    api.governance.fileAccessRequests.list().then(setFileRequests).catch(() => setFileRequests([]))
  }

  useEffect(() => {
    refreshFileRequests()
    // SUPERADMIN-only platform sections (these endpoints 403 for OWNER).
    if (isSuper) {
      api.governance.dashboard().then(setDash).catch(() => {})
      api.governance.accessLog().then(setAccess).catch(() => {})
    }
  }, [isSuper])

  const { pending, history } = useMemo(() => {
    const p: FileAccessRow[] = []
    const h: FileAccessRow[] = []
    for (const r of fileRequests) (r.status === 'PENDING' ? p : h).push(r)
    return { pending: p, history: h }
  }, [fileRequests])

  const decideFileAccess = async (id: string, decision: 'APPROVE' | 'REJECT') => {
    await api.governance.fileAccessRequests.decide(id, { decision })
    refreshFileRequests()
    if (isSuper) api.governance.dashboard().then(setDash).catch(() => {})
  }

  return (
    <WipOverlay>
      <TopBar
        title={isSuper ? 'Governance Dashboard' : 'File Access Governance'}
        subtitle={isSuper ? 'Classifications, approvals, audit' : 'Approve file-access requests & review your decisions'}
      />
      <div className="p-6 space-y-6">
        {isSuper && (
          <div className="grid grid-cols-2 gap-4">
            <Kpi icon={<FileLock2 className="h-4 w-4" />} label="File access requests" value={dash?.pendingFileAccessRequests ?? '-'} />
            <Kpi icon={<ShieldCheck className="h-4 w-4" />} label="Downloads (24h)" value={dash?.recentDownloads24h ?? '-'} />
          </div>
        )}

        {/* ── File access requests - PENDING queue (SUPERADMIN + OWNER) ──────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <FileLock2 className="h-3.5 w-3.5 text-amber-400" />
              File access requests - pending
              {pending.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{pending.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead><TableHead>Class.</TableHead><TableHead>Requester</TableHead>
                  <TableHead>Reason</TableHead><TableHead>When</TableHead><TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[11px] max-w-[220px]">
                      <div className="font-semibold truncate" title={r.file?.filename}>{r.file?.filename ?? r.fileId}</div>
                      <div className="text-muted-foreground/70 truncate">{r.file?.nodeSourceLabel}</div>
                      <div className="flex items-center gap-2.5">
                        {/* The iteration where access was REQUESTED (context), not the
                            file's origin - they differ for files linked across iterations. */}
                        {(r.iterationId ?? r.file?.iterationId) && (
                          <Link to={`/iteration/${r.iterationId ?? r.file?.iterationId}`} className="text-[10px] text-blue-400 hover:underline">open iteration ↗</Link>
                        )}
                        <Link to={`/lineage/${r.fileId}`} className="text-[10px] text-violet-400 hover:underline inline-flex items-center gap-0.5" title="See where this file is used across all iterations">
                          <GitBranch className="h-2.5 w-2.5" />lineage
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{r.file?.classification ?? '-'}</Badge></TableCell>
                    <TableCell className="text-[11px]">
                      <div className="truncate" title={r.requester?.email}>{r.requester?.fullName ?? r.requester?.email ?? r.requesterId.slice(0, 8)}</div>
                      {r.requester?.partnerId && <div className="text-[10px] text-muted-foreground/70 font-mono">{r.requester.partnerId.slice(0, 8)}</div>}
                    </TableCell>
                    <TableCell className="text-[11px] max-w-[240px]"><span className="line-clamp-2">{r.reason ?? '-'}</span></TableCell>
                    <TableCell className="text-[11px] tabular-nums whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="flex gap-2 justify-end">
                      <Button size="sm" onClick={() => decideFileAccess(r.id, 'APPROVE')}>Approve</Button>
                      <Button size="sm" variant="outline" onClick={() => decideFileAccess(r.id, 'REJECT')}>Reject</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {pending.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-xs text-muted-foreground">No pending file access requests</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── File access requests - HISTORY (decided) ──────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              {isSuper ? 'Decision history (all)' : 'My decision history'}
              {history.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{history.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead><TableHead>Requester</TableHead><TableHead>Decision</TableHead>
                  <TableHead>Decided by</TableHead><TableHead>When</TableHead><TableHead>Grant expires</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[11px] max-w-[200px]">
                      <div className="font-semibold truncate" title={r.file?.filename}>{r.file?.filename ?? r.fileId}</div>
                      <div className="flex items-center gap-2.5">
                        {(r.iterationId ?? r.file?.iterationId) && (
                          <Link to={`/iteration/${r.iterationId ?? r.file?.iterationId}`} className="text-[10px] text-blue-400 hover:underline">open iteration ↗</Link>
                        )}
                        <Link to={`/lineage/${r.fileId}`} className="text-[10px] text-violet-400 hover:underline inline-flex items-center gap-0.5" title="See where this file is used across all iterations">
                          <GitBranch className="h-2.5 w-2.5" />lineage
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className="text-[11px] truncate max-w-[140px]" title={r.requester?.email}>{r.requester?.fullName ?? r.requester?.email ?? r.requesterId.slice(0, 8)}</TableCell>
                    <TableCell><DecisionBadge status={r.status} /></TableCell>
                    <TableCell className="text-[11px] truncate max-w-[140px]">{r.decidedBy?.fullName ?? r.decidedBy?.email ?? (r.status === 'CANCELLED' ? 'requester' : '-')}</TableCell>
                    <TableCell className="text-[11px] tabular-nums whitespace-nowrap">{r.decidedAt ? new Date(r.decidedAt).toLocaleString() : '-'}</TableCell>
                    <TableCell className="text-[11px] tabular-nums whitespace-nowrap text-muted-foreground">{r.grantExpiresAt ? new Date(r.grantExpiresAt).toLocaleDateString() : (r.status === 'APPROVED' ? 'never' : '-')}</TableCell>
                  </TableRow>
                ))}
                {history.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-xs text-muted-foreground">No decided requests yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {isSuper && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Access log (last 500)</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>When</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Resource</TableHead><TableHead>Classification</TableHead></TableRow></TableHeader>
                <TableBody>
                  {access.slice(0, 30).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-[11px]">{new Date(l.timestamp).toLocaleString()}</TableCell>
                      <TableCell className="font-mono text-[11px]">{l.userId.slice(0, 8)}</TableCell>
                      <TableCell><Badge variant="outline">{l.action}</Badge></TableCell>
                      <TableCell className="font-mono text-[11px]">{l.resourceType}:{l.resourceId.slice(0, 8)}</TableCell>
                      <TableCell>{l.classification ?? '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </WipOverlay>
  )
}

function DecisionBadge({ status }: { status: string }) {
  if (status === 'APPROVED') return <Badge className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />APPROVED</Badge>
  if (status === 'REJECTED') return <Badge className="text-[10px] bg-red-500/15 text-red-400 border-red-500/30"><XCircle className="h-3 w-3 mr-1" />REJECTED</Badge>
  return <Badge variant="outline" className="text-[10px]">{status}</Badge>
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: any }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">{icon}</div>
        <div>
          <p className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}
