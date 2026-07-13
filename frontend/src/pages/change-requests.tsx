import { Fragment, useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'

type CR = {
  id: string; title: string; description?: string | null
  targetType: string; targetId: string; status: string
  impactJson?: string | null; raisedBy: string; createdAt: string; updatedAt: string
}
type NC = {
  id: string; title: string; description: string
  iterationId?: string | null; nodeId?: string | null; fileRecordId?: string | null
  rootCauseCategory: string; rootCauseDetail?: string | null
  severity: string; status: string; reportedBy: string
  createdAt: string; resolvedAt?: string | null
}
type MachineOpt = { id: string; name: string }
type IterOpt = { id: string; displayId?: string; machineName?: string; status?: string }
type FileRec = { id: string; filename: string }

type ArtefactRef = { id: string; filename?: string; displayId?: string; machineName?: string; status?: string }
type ImpactShape = {
  note?: string
  downstreamCount?: number
  downstreamFiles?: ArtefactRef[]
  total?: number
  running?: number
  iterations?: ArtefactRef[]
  fileCount?: number
  manifestCount?: number
}
type AffectedShape = { downstreamFiles?: ArtefactRef[]; iterations?: ArtefactRef[] }

const CR_STATUS = ['OPEN', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'CLOSED']
const NC_STATUS = ['OPEN', 'INVESTIGATING', 'RESOLVED', 'CLOSED']
const SEVERITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
const ROOT_CAUSE = ['DESIGN', 'MATERIAL', 'PROCESS', 'INSPECTION', 'HUMAN', 'ENVIRONMENTAL', 'UNKNOWN']
const TARGET_TYPES = ['StateMachine', 'Iteration', 'FileRecord']

const cellSelect = 'rounded-md border border-border bg-background text-xs h-7 px-1.5'
const formSelect = 'w-full rounded-md border border-border bg-background text-xs h-8 px-2'

const emptyCR = { title: '', description: '', targetType: 'StateMachine', targetId: '', fileIterId: '' }
const emptyNC = {
  title: '', description: '', severity: 'MEDIUM',
  rootCauseCategory: 'UNKNOWN', rootCauseDetail: '', iterationId: '', fileRecordId: '',
}

export function ChangeRequests() {
  const [crs, setCRs] = useState<CR[]>([])
  const [ncs, setNCs] = useState<NC[]>([])
  const [machines, setMachines] = useState<MachineOpt[]>([])
  const [iters, setIters] = useState<IterOpt[]>([])
  const [filesByIter, setFilesByIter] = useState<Record<string, FileRec[]>>({})

  const [crForm, setCRForm] = useState(emptyCR)
  const [ncForm, setNCForm] = useState(emptyNC)

  const [openImpact, setOpenImpact] = useState<string | null>(null)
  const [openAffected, setOpenAffected] = useState<string | null>(null)
  const [affectedById, setAffectedById] = useState<Record<string, AffectedShape | null>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => { refresh() }, [])
  const refresh = async () => {
    const [crList, ncList, mRes, iRes] = await Promise.all([
      api.changeMgmt.listCRs(),
      api.changeMgmt.listNCs(),
      api.machines.list(1, 200).catch(() => ({ items: [] })),
      api.iterations.list(undefined, { page: 1, limit: 200 }).catch(() => ({ items: [] })),
    ])
    setCRs(crList as CR[])
    setNCs(ncList as NC[])
    const mItems = (mRes as { items?: MachineOpt[] })?.items ?? []
    const iItems = (iRes as { items?: IterOpt[] })?.items ?? []
    setMachines(mItems.map((m) => ({ id: m.id, name: m.name })))
    setIters(iItems.map((it) => ({
      id: it.id, displayId: it.displayId, machineName: it.machineName, status: it.status,
    })))
  }

  const loadFiles = async (iterationId: string) => {
    if (!iterationId || filesByIter[iterationId]) return
    const res = await api.files.list(iterationId).catch(() => [])
    const list: FileRec[] = Array.isArray(res) ? res : ((res as { items?: FileRec[] })?.items ?? [])
    setFilesByIter((prev) => ({ ...prev, [iterationId]: list }))
  }

  // ── ChangeRequest actions ─────────────────────────────────────────────────
  const submitCR = async () => {
    if (!crForm.title || !crForm.targetId) return
    setBusy(true)
    try {
      await api.changeMgmt.createCR({
        title: crForm.title,
        description: crForm.description || undefined,
        targetType: crForm.targetType,
        targetId: crForm.targetId,
      })
      setCRForm(emptyCR)
      await refresh()
    } finally { setBusy(false) }
  }

  const changeCRStatus = async (id: string, status: string) => {
    setBusy(true)
    try { await api.changeMgmt.updateCRStatus(id, status); await refresh() }
    finally { setBusy(false) }
  }

  const recompute = async (id: string) => {
    setBusy(true)
    try { await api.changeMgmt.recomputeImpact(id); await refresh() }
    finally { setBusy(false) }
  }

  // ── NonConformance actions ────────────────────────────────────────────────
  const submitNC = async () => {
    if (!ncForm.title || !ncForm.description) return
    setBusy(true)
    try {
      await api.changeMgmt.createNC({
        title: ncForm.title,
        description: ncForm.description,
        severity: ncForm.severity,
        rootCauseCategory: ncForm.rootCauseCategory,
        rootCauseDetail: ncForm.rootCauseDetail || undefined,
        iterationId: ncForm.iterationId || undefined,
        fileRecordId: ncForm.fileRecordId || undefined,
      })
      setNCForm(emptyNC)
      await refresh()
    } finally { setBusy(false) }
  }

  const patchNC = async (id: string, patch: Record<string, string>) => {
    setBusy(true)
    try { await api.changeMgmt.updateNC(id, patch); await refresh() }
    finally { setBusy(false) }
  }

  const toggleAffected = async (nc: NC) => {
    if (openAffected === nc.id) { setOpenAffected(null); return }
    setOpenAffected(nc.id)
    if (!affectedById[nc.id]) {
      const res = await api.changeMgmt.ncAffected(nc.id).catch(() => null)
      setAffectedById((p) => ({ ...p, [nc.id]: res as AffectedShape | null }))
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const iterLabel = (id?: string | null) => {
    if (!id) return ''
    const it = iters.find((x) => x.id === id)
    return it ? (it.displayId ?? it.id.slice(0, 8)) : id.slice(0, 8)
  }

  const parseImpact = (json?: string | null): ImpactShape | null => {
    if (!json) return null
    try { return JSON.parse(json) as ImpactShape } catch { return null }
  }

  const renderImpact = (impact: ImpactShape | null) => {
    if (!impact) return <span className="text-xs text-muted-foreground">No impact computed yet - press Recompute.</span>
    if (impact.note) return <span className="text-xs text-muted-foreground">{impact.note}</span>
    if (typeof impact.downstreamCount === 'number') {
      return (
        <div className="text-xs space-y-1">
          <p><b>{impact.downstreamCount}</b> downstream file(s) derive from this target.</p>
          <ul className="list-disc pl-5 text-[11px] text-muted-foreground">
            {(impact.downstreamFiles ?? []).slice(0, 20).map((f) => <li key={f.id}>{f.filename ?? f.id}</li>)}
          </ul>
        </div>
      )
    }
    if (typeof impact.total === 'number' && impact.iterations) {
      return (
        <div className="text-xs space-y-1">
          <p><b>{impact.total}</b> iteration(s) use this state machine - <b>{impact.running}</b> currently RUNNING.</p>
          <ul className="list-disc pl-5 text-[11px] text-muted-foreground">
            {impact.iterations.slice(0, 20).map((it) => (
              <li key={it.id}>{(it.displayId ?? it.id.slice(0, 8))} · {it.status}</li>
            ))}
          </ul>
        </div>
      )
    }
    if (typeof impact.fileCount === 'number') {
      return (
        <p className="text-xs">
          <b>{impact.fileCount}</b> file(s) and <b>{impact.manifestCount}</b> manifest(s) belong to this iteration.
        </p>
      )
    }
    return <pre className="text-[10px] overflow-auto">{JSON.stringify(impact, null, 2)}</pre>
  }

  const renderAffected = (data: AffectedShape | null | undefined) => {
    if (data === undefined) return <span className="text-xs text-muted-foreground">Loading…</span>
    if (!data) return <span className="text-xs text-muted-foreground">Could not load affected artefacts.</span>
    const files = data.downstreamFiles ?? []
    const its = data.iterations ?? []
    if (files.length === 0 && its.length === 0) {
      return (
        <span className="text-xs text-muted-foreground">
          No downstream artefacts - link this NC to a file to enable impact tracing.
        </span>
      )
    }
    return (
      <div className="text-xs grid grid-cols-2 gap-4">
        <div>
          <p className="font-medium">{files.length} downstream file(s)</p>
          <ul className="list-disc pl-5 text-[11px] text-muted-foreground">
            {files.slice(0, 20).map((f) => <li key={f.id}>{f.filename ?? f.id}</li>)}
          </ul>
        </div>
        <div>
          <p className="font-medium">{its.length} iteration(s) to re-qualify</p>
          <ul className="list-disc pl-5 text-[11px] text-muted-foreground">
            {its.map((it) => (
              <li key={it.id}>{(it.displayId ?? it.id.slice(0, 8))} · {it.machineName} · {it.status}</li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  const crFiles = filesByIter[crForm.fileIterId] ?? []
  const ncFiles = filesByIter[ncForm.iterationId] ?? []

  return (
    <>
      <TopBar title="Change & Non-conformance" subtitle="Change requests, non-conformances, root cause & impact analysis" />
      <div className="p-6 space-y-6">

        {/* ── Change Requests ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-6">
          <Card className="col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Change Requests</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Impact</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {crs.map((cr) => (
                    <Fragment key={cr.id}>
                      <TableRow>
                        <TableCell>
                          <div className="font-medium">{cr.title}</div>
                          {cr.description && <div className="text-[11px] text-muted-foreground">{cr.description}</div>}
                        </TableCell>
                        <TableCell className="font-mono text-[11px]">{cr.targetType}:{cr.targetId.slice(0, 8)}</TableCell>
                        <TableCell>
                          <select
                            className={cellSelect}
                            value={cr.status}
                            disabled={busy}
                            onChange={(e) => changeCRStatus(cr.id, e.target.value)}
                          >
                            {CR_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setOpenImpact(openImpact === cr.id ? null : cr.id)}
                          >
                            {openImpact === cr.id ? 'Hide' : 'View'}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {openImpact === cr.id && (
                        <TableRow>
                          <TableCell colSpan={4} className="bg-muted/40">
                            <div className="space-y-2 p-1">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium">Impact analysis</p>
                                <Button size="sm" variant="outline" disabled={busy} onClick={() => recompute(cr.id)}>
                                  Recompute
                                </Button>
                              </div>
                              {renderImpact(parseImpact(cr.impactJson))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                  {crs.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-xs text-muted-foreground">No change requests</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">New change request</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Title"
                value={crForm.title}
                onChange={(e) => setCRForm({ ...crForm, title: e.target.value })}
              />
              <Textarea
                placeholder="Description (optional)"
                value={crForm.description}
                onChange={(e) => setCRForm({ ...crForm, description: e.target.value })}
              />
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Target type</label>
                <select
                  className={formSelect}
                  value={crForm.targetType}
                  onChange={(e) => setCRForm({ ...crForm, targetType: e.target.value, targetId: '', fileIterId: '' })}
                >
                  {TARGET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {crForm.targetType === 'StateMachine' && (
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">State machine</label>
                  <select
                    className={formSelect}
                    value={crForm.targetId}
                    onChange={(e) => setCRForm({ ...crForm, targetId: e.target.value })}
                  >
                    <option value="">- select -</option>
                    {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              )}

              {crForm.targetType === 'Iteration' && (
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Iteration</label>
                  <select
                    className={formSelect}
                    value={crForm.targetId}
                    onChange={(e) => setCRForm({ ...crForm, targetId: e.target.value })}
                  >
                    <option value="">- select -</option>
                    {iters.map((it) => (
                      <option key={it.id} value={it.id}>{(it.displayId ?? it.id.slice(0, 8))} · {it.machineName}</option>
                    ))}
                  </select>
                </div>
              )}

              {crForm.targetType === 'FileRecord' && (
                <>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">Iteration (to find the file)</label>
                    <select
                      className={formSelect}
                      value={crForm.fileIterId}
                      onChange={(e) => {
                        setCRForm({ ...crForm, fileIterId: e.target.value, targetId: '' })
                        if (e.target.value) loadFiles(e.target.value)
                      }}
                    >
                      <option value="">- select -</option>
                      {iters.map((it) => (
                        <option key={it.id} value={it.id}>{(it.displayId ?? it.id.slice(0, 8))} · {it.machineName}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] text-muted-foreground">File</label>
                    <select
                      className={formSelect}
                      value={crForm.targetId}
                      disabled={!crForm.fileIterId}
                      onChange={(e) => setCRForm({ ...crForm, targetId: e.target.value })}
                    >
                      <option value="">- select -</option>
                      {crFiles.map((f) => <option key={f.id} value={f.id}>{f.filename}</option>)}
                    </select>
                  </div>
                </>
              )}

              <Button size="sm" disabled={busy || !crForm.title || !crForm.targetId} onClick={submitCR}>
                Create CR
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* ── Non-conformances ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-6">
          <Card className="col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Non-conformances</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Root cause</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Affected</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {ncs.map((nc) => (
                    <Fragment key={nc.id}>
                      <TableRow>
                        <TableCell>
                          <div className="font-medium">{nc.title}</div>
                          <div className="text-[11px] text-muted-foreground">{nc.description}</div>
                          {(nc.iterationId || nc.fileRecordId) && (
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {nc.iterationId && `iter ${iterLabel(nc.iterationId)}`}
                              {nc.fileRecordId && ` · file ${nc.fileRecordId.slice(0, 8)}`}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <select
                            className={cellSelect}
                            value={nc.severity}
                            disabled={busy}
                            onChange={(e) => patchNC(nc.id, { severity: e.target.value })}
                          >
                            {SEVERITY.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </TableCell>
                        <TableCell>
                          <select
                            className={cellSelect}
                            value={nc.rootCauseCategory}
                            disabled={busy}
                            onChange={(e) => patchNC(nc.id, { rootCauseCategory: e.target.value })}
                          >
                            {ROOT_CAUSE.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </TableCell>
                        <TableCell>
                          <select
                            className={cellSelect}
                            value={nc.status}
                            disabled={busy}
                            onChange={(e) => patchNC(nc.id, { status: e.target.value })}
                          >
                            {NC_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={!nc.fileRecordId}
                            title={nc.fileRecordId ? '' : 'Link a file to enable downstream tracing'}
                            onClick={() => toggleAffected(nc)}
                          >
                            {openAffected === nc.id ? 'Hide' : 'View'}
                          </Button>
                        </TableCell>
                      </TableRow>
                      {openAffected === nc.id && (
                        <TableRow>
                          <TableCell colSpan={5} className="bg-muted/40">
                            <div className="space-y-2 p-1">
                              <p className="text-xs font-medium">Affected downstream artefacts</p>
                              {renderAffected(affectedById[nc.id])}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                  {ncs.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-xs text-muted-foreground">No non-conformances</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">New non-conformance</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="Title"
                value={ncForm.title}
                onChange={(e) => setNCForm({ ...ncForm, title: e.target.value })}
              />
              <Textarea
                placeholder="Description"
                value={ncForm.description}
                onChange={(e) => setNCForm({ ...ncForm, description: e.target.value })}
              />
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Severity</label>
                  <select
                    className={formSelect}
                    value={ncForm.severity}
                    onChange={(e) => setNCForm({ ...ncForm, severity: e.target.value })}
                  >
                    {SEVERITY.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground">Root cause</label>
                  <select
                    className={formSelect}
                    value={ncForm.rootCauseCategory}
                    onChange={(e) => setNCForm({ ...ncForm, rootCauseCategory: e.target.value })}
                  >
                    {ROOT_CAUSE.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <Input
                placeholder="Root cause detail (optional)"
                value={ncForm.rootCauseDetail}
                onChange={(e) => setNCForm({ ...ncForm, rootCauseDetail: e.target.value })}
              />
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">Iteration (optional)</label>
                <select
                  className={formSelect}
                  value={ncForm.iterationId}
                  onChange={(e) => {
                    setNCForm({ ...ncForm, iterationId: e.target.value, fileRecordId: '' })
                    if (e.target.value) loadFiles(e.target.value)
                  }}
                >
                  <option value="">- none -</option>
                  {iters.map((it) => (
                    <option key={it.id} value={it.id}>{(it.displayId ?? it.id.slice(0, 8))} · {it.machineName}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground">File (optional - enables impact tracing)</label>
                <select
                  className={formSelect}
                  value={ncForm.fileRecordId}
                  disabled={!ncForm.iterationId}
                  onChange={(e) => setNCForm({ ...ncForm, fileRecordId: e.target.value })}
                >
                  <option value="">- none -</option>
                  {ncFiles.map((f) => <option key={f.id} value={f.id}>{f.filename}</option>)}
                </select>
              </div>
              <Button size="sm" disabled={busy || !ncForm.title || !ncForm.description} onClick={submitNC}>
                Report NC
              </Button>
            </CardContent>
          </Card>
        </div>

      </div>
    </>
  )
}
