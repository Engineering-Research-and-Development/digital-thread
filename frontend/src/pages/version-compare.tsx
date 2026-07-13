import { useEffect, useMemo, useState } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { WipOverlay } from '@/components/common/wip-overlay'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { useMachineStore } from '@/stores/machine-store'
import { useIterationStore } from '@/stores/iteration-store'
import { ArrowRight, Loader2, Code2, GitCompare } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { DiffView } from '@/components/compare/diff-view'

type CompareKind = 'state-machines' | 'state-machine-versions' | 'iterations'

interface VersionRow {
  id: string
  versionNumber: number
  versionLabel: string | null
  createdAt: string
  nodeCount: number
  edgeCount: number
  iterationCount: number
}

export function VersionCompare() {
  const [kind, setKind] = useState<CompareKind>('state-machines')
  const [left, setLeft] = useState('')
  const [right, setRight] = useState('')
  const [diff, setDiff] = useState<any | null>(null)
  const [running, setRunning] = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)

  // Versions-of-same-machine sub-state
  const [versionMachineId, setVersionMachineId] = useState('')
  const [versions, setVersions] = useState<VersionRow[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)

  const machines = useMachineStore((s) => s.machines)
  const initMachines = useMachineStore((s) => s.init)
  const iterations = useIterationStore((s) => s.iterations)
  const initIterations = useIterationStore((s) => s.init)

  useEffect(() => { initMachines() }, [initMachines])
  useEffect(() => { initIterations() }, [initIterations])

  const machineOptions = useMemo(() => {
    return Object.values(machines)
      .map((m) => ({
        id: m.id,
        primary: m.name,
        secondary: m.version
          ? `v${m.version}${typeof m.latestVersion === 'number' ? ` · snapshot v${m.latestVersion}` : ''}`
          : (typeof m.latestVersion === 'number' ? `snapshot v${m.latestVersion}` : ''),
      }))
      .sort((a, b) => a.primary.localeCompare(b.primary))
  }, [machines])

  const iterationOptions = useMemo(() => {
    return Object.values(iterations)
      .map((it) => ({
        id: it.id,
        primary: it.displayId || it.id,
        secondary: `${it.machineName} · ${it.status}`,
      }))
      .sort((a, b) => a.primary.localeCompare(b.primary))
  }, [iterations])

  // Fetch versions when a machine is picked in the "same-machine versions" mode.
  useEffect(() => {
    if (kind !== 'state-machine-versions' || !versionMachineId) {
      setVersions([])
      return
    }
    let cancelled = false
    setVersionsLoading(true)
    setLeft('')
    setRight('')
    setDiff(null)
    api.machines
      .listVersions(versionMachineId)
      .then((rows) => { if (!cancelled) setVersions(rows) })
      .catch((e: any) => toast.error(`Failed to load versions: ${e?.message ?? 'unknown error'}`))
      .finally(() => { if (!cancelled) setVersionsLoading(false) })
    return () => { cancelled = true }
  }, [kind, versionMachineId])

  const versionOptions = useMemo(() => {
    return versions.map((v) => ({
      id: String(v.versionNumber),
      primary: `v${v.versionNumber}${v.versionLabel ? ` · ${v.versionLabel}` : ''}`,
      secondary: `${new Date(v.createdAt).toLocaleString()} · ${v.nodeCount} nodes · ${v.edgeCount} edges · ${v.iterationCount} iter`,
    }))
  }, [versions])

  const changeKind = (k: CompareKind) => {
    setKind(k)
    setLeft('')
    setRight('')
    setDiff(null)
    if (k !== 'state-machine-versions') {
      setVersionMachineId('')
      setVersions([])
    }
  }

  const run = async () => {
    if (!canRun) return
    setRunning(true)
    setDiff(null)
    try {
      let res: any
      if (kind === 'state-machines') {
        res = await api.compliance.compareSm(left, right)
      } else if (kind === 'iterations') {
        res = await api.compliance.compareIter(left, right)
      } else {
        res = await api.compliance.compareSmVersions(versionMachineId, Number(left), Number(right))
      }
      setDiff(res)
    } catch (e: any) {
      toast.error(`Compare failed: ${e?.message ?? 'unknown error'}`)
    } finally {
      setRunning(false)
    }
  }

  const sameSelected = Boolean(left && right && left === right)
  const canRun = (() => {
    if (!left || !right || sameSelected) return false
    if (kind === 'state-machine-versions' && !versionMachineId) return false
    return true
  })()

  // Compose the option list for left/right pickers based on current kind.
  const pickerOptions =
    kind === 'state-machines'
      ? machineOptions
      : kind === 'iterations'
        ? iterationOptions
        : versionOptions

  const pickerPlaceholder =
    kind === 'state-machines'
      ? 'Select state machine…'
      : kind === 'iterations'
        ? 'Select iteration…'
        : versionMachineId
          ? versionsLoading ? 'Loading versions…' : 'Select version…'
          : 'Pick a state machine first…'

  return (
    <WipOverlay>
      <TopBar
        title="Side-by-side Compare"
        subtitle="Semantic diff between state machines, versions of the same state machine, or iterations"
      />
      <div className="p-6 space-y-4 max-w-6xl mx-auto">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Compare</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Kind</span>
                <Select value={kind} onValueChange={(v) => changeKind(v as CompareKind)}>
                  <SelectTrigger className="h-8 text-xs w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="state-machines">Two state machines</SelectItem>
                    <SelectItem value="state-machine-versions">Versions of same state machine</SelectItem>
                    <SelectItem value="iterations">Two iterations</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* In "versions" mode we also need to pick the parent machine. */}
              {kind === 'state-machine-versions' && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wider">Machine</span>
                  <Select value={versionMachineId || '__pick'} onValueChange={(v) => setVersionMachineId(v === '__pick' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs w-[260px]">
                      <SelectValue placeholder="Select state machine…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__pick" disabled>Select state machine…</SelectItem>
                      {machineOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id} className="text-xs">
                          <div className="flex flex-col">
                            <span className="font-semibold">{o.primary}</span>
                            {o.secondary && (
                              <span className="text-[9px] text-muted-foreground">{o.secondary}</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <SelectPicker
                  label="Left"
                  value={left}
                  onChange={setLeft}
                  options={pickerOptions}
                  placeholder={pickerPlaceholder}
                  disabled={kind === 'state-machine-versions' && !versionMachineId}
                />
              </div>

              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-5" aria-hidden="true" />

              <div className="flex-1 min-w-[240px]">
                <SelectPicker
                  label="Right"
                  value={right}
                  onChange={setRight}
                  options={pickerOptions}
                  placeholder={pickerPlaceholder}
                  disabled={kind === 'state-machine-versions' && !versionMachineId}
                />
              </div>

              <Button
                size="sm"
                onClick={run}
                disabled={!canRun || running}
                className="mt-5"
                title={
                  !left || !right
                    ? 'Pick both sides'
                    : sameSelected
                      ? 'Left and right are the same'
                      : 'Run compare'
                }
              >
                {running ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                Compare
              </Button>
            </div>

            {sameSelected && (
              <p className="text-[11px] text-amber-500/90">
                Left and right point to the same item - pick two different ones.
              </p>
            )}
            {kind === 'state-machine-versions' && versionMachineId && !versionsLoading && versions.length < 2 && (
              <p className="text-[11px] text-amber-500/90">
                This state machine has only {versions.length} version(s) - need at least 2 to compare.
              </p>
            )}
            {pickerOptions.length === 0 && kind !== 'state-machine-versions' && (
              <p className="text-[11px] text-muted-foreground italic">
                No {kind === 'state-machines' ? 'state machines' : 'iterations'} available.
              </p>
            )}
          </CardContent>
        </Card>

        {diff && (
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <GitCompare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Diff
                  <Badge variant="outline" className="ml-1 text-[10px]">{kind}</Badge>
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setShowRawJson((v) => !v)}
                  title={showRawJson ? 'Hide raw JSON' : 'Show raw JSON'}
                >
                  <Code2 className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                  {showRawJson ? 'Hide raw JSON' : 'Raw JSON'}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <DiffView diff={diff} kind={kind} />
              {showRawJson && (
                <details className="rounded-md border border-border bg-muted/20" open>
                  <summary className="cursor-pointer text-[11px] px-3 py-1.5 text-muted-foreground font-mono">
                    Raw JSON payload
                  </summary>
                  <pre className="text-[10px] font-mono overflow-auto max-h-[400px] bg-background/40 p-3">
                    {JSON.stringify(diff, null, 2)}
                  </pre>
                </details>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </WipOverlay>
  )
}

interface SelectPickerProps {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ id: string; primary: string; secondary?: string }>
  placeholder: string
  disabled?: boolean
}

function SelectPicker({ label, value, onChange, options, placeholder, disabled }: SelectPickerProps) {
  return (
    <div className="space-y-1">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <Select
        value={value || '__pick'}
        onValueChange={(v) => onChange(v === '__pick' ? '' : v)}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__pick" disabled>{placeholder}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id} className="text-xs">
              <div className="flex flex-col">
                <span className="font-semibold">{o.primary}</span>
                {o.secondary && (
                  <span className="text-[9px] text-muted-foreground">{o.secondary}</span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
