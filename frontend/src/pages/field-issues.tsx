import { Fragment, useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import type { FieldIssue } from '@/hooks/use-field-issues'

type KnownComponent = { componentRef: string; iterationCount: number; lastSeenAt: string }
type IterOption = { id: string; displayId?: string; machineName?: string; status?: string; componentRef?: string }
type FileRec = { id: string; filename: string }
type RawIteration = { id: string; displayId?: string; machineName?: string; status?: string; metadataJson?: string }

const selectClass = 'w-full rounded-md border border-border bg-background text-xs h-8 px-2'

export function FieldIssues() {
  const [issues, setIssues] = useState<FieldIssue[]>([])
  const [components, setComponents] = useState<KnownComponent[]>([])
  const [iters, setIters] = useState<IterOption[]>([])
  const [filesByIter, setFilesByIter] = useState<Record<string, FileRec[]>>({})
  const [form, setForm] = useState({ componentRef: '', description: '', severity: 'MEDIUM' })
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [linkDraft, setLinkDraft] = useState({ iterationId: '', fileRecordId: '' })
  const [busy, setBusy] = useState(false)

  useEffect(() => { refresh() }, [])
  const refresh = async () => {
    const [fi, known, iterRes] = await Promise.all([
      api.changeMgmt.listFi(),
      api.compliance.listComponents().catch(() => [] as KnownComponent[]),
      api.iterations.list(undefined, { page: 1, limit: 200 }).catch(() => ({ items: [] })),
    ])
    setIssues(fi)
    setComponents(known)
    const items = (iterRes?.items ?? []) as RawIteration[]
    setIters(items.map((it) => {
      let componentRef: string | undefined
      try { componentRef = JSON.parse(it.metadataJson || '{}').componentRef } catch { /* metadata not JSON */ }
      return { id: it.id, displayId: it.displayId, machineName: it.machineName, status: it.status, componentRef }
    }))
  }

  // Resolve filenames for already-linked issues so the table can show them.
  useEffect(() => {
    const needed = [...new Set(issues.filter((i) => i.linkedFileRecordId && i.linkedIterationId).map((i) => i.linkedIterationId))]
    needed.forEach((id) => loadFiles(id as string))
  }, [issues]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadFiles = async (iterationId: string) => {
    if (!iterationId || filesByIter[iterationId]) return
    const res = await api.files.list(iterationId).catch(() => [])
    const list: FileRec[] = Array.isArray(res) ? res : (res?.items ?? [])
    setFilesByIter((prev) => ({ ...prev, [iterationId]: list }))
  }

  const submit = async () => {
    if (!form.componentRef || !form.description) return
    await api.changeMgmt.createFi(form)
    setForm({ componentRef: '', description: '', severity: 'MEDIUM' })
    refresh()
  }

  const startLink = (issue: FieldIssue) => {
    setLinkingId(issue.id)
    setLinkDraft({ iterationId: issue.linkedIterationId ?? '', fileRecordId: issue.linkedFileRecordId ?? '' })
    if (issue.linkedIterationId) loadFiles(issue.linkedIterationId)
  }

  const saveLink = async () => {
    if (!linkingId || !linkDraft.iterationId) return
    setBusy(true)
    try {
      await api.changeMgmt.linkFi(linkingId, {
        iterationId: linkDraft.iterationId,
        fileRecordId: linkDraft.fileRecordId || undefined,
      })
      setLinkingId(null)
      await refresh()
    } finally { setBusy(false) }
  }

  const closeIssue = async (id: string) => {
    if (!confirm('Close this field issue? It cannot be re-opened from the UI.')) return
    setBusy(true)
    try {
      await api.changeMgmt.closeFi(id)
      if (linkingId === id) setLinkingId(null)
      await refresh()
    } finally { setBusy(false) }
  }

  const iterLabel = (id?: string | null) => {
    if (!id) return null
    const it = iters.find((x) => x.id === id)
    return it ? (it.displayId ?? it.id.slice(0, 8)) : id.slice(0, 8)
  }
  const fileLabel = (iterationId?: string | null, fileId?: string | null) => {
    if (!fileId) return null
    const f = (iterationId ? filesByIter[iterationId] : undefined)?.find((x) => x.id === fileId)
    return f ? f.filename : fileId.slice(0, 8)
  }

  const match = components.find((c) => c.componentRef === form.componentRef)
  const linkingIssue = issues.find((i) => i.id === linkingId)
  const matchingIters = linkingIssue ? iters.filter((it) => it.componentRef && it.componentRef === linkingIssue.componentRef) : []
  const otherIters = linkingIssue ? iters.filter((it) => !matchingIters.includes(it)) : []
  const draftFiles = filesByIter[linkDraft.iterationId] ?? []

  return (
    <>
      <TopBar title="Field Issues" subtitle="Post-deployment issue reports (lifecycle feedback)" />
      <div className="p-6 grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Reported issues</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Linked to</TableHead>
                <TableHead>Captured</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {issues.map((i) => (
                  <Fragment key={i.id}>
                    <TableRow>
                      <TableCell className="font-mono text-[11px]">{i.componentRef}</TableCell>
                      <TableCell><Badge variant={i.severity === 'CRITICAL' ? 'destructive' : 'outline'}>{i.severity}</Badge></TableCell>
                      <TableCell><Badge variant={i.status === 'CLOSED' ? 'outline' : 'default'}>{i.status}</Badge></TableCell>
                      <TableCell className="text-[11px]">
                        {i.linkedIterationId ? (
                          <span>
                            iter <span className="font-mono">{iterLabel(i.linkedIterationId)}</span>
                            {i.linkedFileRecordId && (
                              <span className="text-muted-foreground"> · 📎 {fileLabel(i.linkedIterationId, i.linkedFileRecordId)}</span>
                            )}
                          </span>
                        ) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-[11px]">{new Date(i.capturedAt).toLocaleString()}</TableCell>
                      <TableCell className="text-right space-x-1 whitespace-nowrap">
                        {i.status !== 'CLOSED' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => startLink(i)} disabled={busy}>
                              {i.linkedIterationId ? 'Edit link' : 'Link'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => closeIssue(i.id)} disabled={busy}>Close</Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                    {linkingId === i.id && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/40">
                          <div className="space-y-3 p-1">
                            <p className="text-xs font-medium">Link this issue to the iteration that produced the component</p>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <label className="text-[11px] text-muted-foreground">Iteration</label>
                                <select
                                  className={selectClass}
                                  value={linkDraft.iterationId}
                                  onChange={(e) => {
                                    setLinkDraft({ iterationId: e.target.value, fileRecordId: '' })
                                    if (e.target.value) loadFiles(e.target.value)
                                  }}
                                >
                                  <option value="">- select an iteration -</option>
                                  {matchingIters.length > 0 && (
                                    <optgroup label={`Tagged with ${i.componentRef} (${matchingIters.length})`}>
                                      {matchingIters.map((it) => (
                                        <option key={it.id} value={it.id}>
                                          {(it.displayId ?? it.id.slice(0, 8))} · {it.machineName} · {it.status}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                  <optgroup label={`Other iterations (${otherIters.length})`}>
                                    {otherIters.map((it) => (
                                      <option key={it.id} value={it.id}>
                                        {(it.displayId ?? it.id.slice(0, 8))} · {it.machineName} · {it.status}
                                      </option>
                                    ))}
                                  </optgroup>
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[11px] text-muted-foreground">Specific file (optional)</label>
                                <select
                                  className={selectClass}
                                  value={linkDraft.fileRecordId}
                                  disabled={!linkDraft.iterationId}
                                  onChange={(e) => setLinkDraft({ ...linkDraft, fileRecordId: e.target.value })}
                                >
                                  <option value="">- no specific file -</option>
                                  {draftFiles.map((f) => <option key={f.id} value={f.id}>{f.filename}</option>)}
                                </select>
                              </div>
                            </div>
                            {matchingIters.length === 0 && (
                              <p className="text-[10px] text-muted-foreground leading-tight">
                                No iteration is tagged with this component URN - pick from all iterations to record the link manually.
                              </p>
                            )}
                            <div className="flex gap-2">
                              <Button size="sm" onClick={saveLink} disabled={busy || !linkDraft.iterationId}>Save link</Button>
                              <Button size="sm" variant="outline" onClick={() => setLinkingId(null)} disabled={busy}>Cancel</Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
                {issues.length === 0 && <TableRow><TableCell colSpan={6} className="text-xs text-muted-foreground">No field issues reported</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Report new issue</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Input
                placeholder="componentRef (URN) - start typing to pick a known one"
                value={form.componentRef}
                onChange={(e) => setForm({ ...form, componentRef: e.target.value })}
                list="known-component-refs"
              />
              <datalist id="known-component-refs">
                {components.map((c) => (
                  <option key={c.componentRef} value={c.componentRef}>
                    {c.iterationCount} iteration(s) - last {new Date(c.lastSeenAt).toLocaleDateString()}
                  </option>
                ))}
              </datalist>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {match
                  ? `Known component - ${match.iterationCount} iteration(s) in thread.`
                  : form.componentRef
                    ? 'New or unknown URN - will be accepted, but no iteration link will auto-resolve.'
                    : `${components.length} known component(s). Pick from the list or type a new URN (e.g. urn:digital-thread:component:wing-panel-42).`}
              </p>
            </div>
            <Textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <select className={selectClass} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              {['LOW','MEDIUM','HIGH','CRITICAL'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <Button size="sm" onClick={submit} disabled={!form.componentRef || !form.description}>Submit report</Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
