import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronRight, Minus, Pencil, Plus, Boxes, GitFork, FileText, Activity, Files } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LineDiff } from './line-diff'

/**
 * Git-like diff renderer for the compare endpoints. Backend payloads come in
 * two shapes:
 *   1. State machines / state-machine versions:
 *      { nodes: { added, removed, changed }, edges: { added, removed, changed } }
 *   2. Iterations:
 *      { metadataDiff: JsonPathValue[], nodeStatusDiff: JsonPathValue[], fileCountDelta: number }
 *
 * This component routes by shape and renders a Git-style summary:
 *   + green for additions, − red for removals, ◆ amber for in-place changes.
 */

export interface JsonPathValue {
  path: string
  left: any
  right: any
}

interface CollectionDiff {
  added: any[]
  removed: any[]
  changed: Array<{ key: string; diffs: JsonPathValue[] }>
}

export function DiffView({ diff, kind }: { diff: any; kind: 'state-machines' | 'state-machine-versions' | 'iterations' }) {
  if (!diff) return null
  if (kind === 'iterations') {
    return <IterationDiff diff={diff} />
  }
  return <StateMachineDiff diff={diff} kind={kind} />
}

// ─── Header helpers ─────────────────────────────────────────────────────────

function HeaderBadge({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <span className="inline-flex items-baseline gap-1 text-[10px]">
      <span className="text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className="text-foreground/90 font-mono">{value}</span>
    </span>
  )
}

function SummaryPills({ added, removed, changed }: { added: number; removed: number; changed: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/15 text-emerald-300">
        <Plus className="h-3 w-3" /> {added}
      </span>
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-500/15 text-red-300">
        <Minus className="h-3 w-3" /> {removed}
      </span>
      <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-amber-500/15 text-amber-300">
        <Pencil className="h-3 w-3" /> {changed}
      </span>
    </div>
  )
}

// ─── State-machine / version diff ───────────────────────────────────────────

function StateMachineDiff({ diff, kind }: { diff: any; kind: 'state-machines' | 'state-machine-versions' }) {
  const nodes: CollectionDiff = diff.nodes ?? { added: [], removed: [], changed: [] }
  const edges: CollectionDiff = diff.edges ?? { added: [], removed: [], changed: [] }

  const nothingChanged =
    nodes.added.length + nodes.removed.length + nodes.changed.length +
    edges.added.length + edges.removed.length + edges.changed.length === 0

  return (
    <div className="space-y-3">
      {/* Header - what is being compared */}
      <div className="rounded-md border border-border bg-card/40 p-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="space-y-1">
            {kind === 'state-machine-versions' && diff.machine && (
              <div className="text-xs font-semibold">{diff.machine.name}</div>
            )}
            <div className="flex items-center gap-3 flex-wrap text-[11px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="rounded px-1.5 py-0.5 bg-red-500/10 text-red-300 font-mono text-[10px]">LEFT</span>
                <SideLabel side={diff.left} kind={kind} />
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 font-mono text-[10px]">RIGHT</span>
                <SideLabel side={diff.right} kind={kind} />
              </span>
            </div>
          </div>
        </div>
      </div>

      {nothingChanged && (
        <div className="rounded-md border border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
          Identical - no nodes or edges differ between these two snapshots.
        </div>
      )}

      <CollectionDiffBlock
        title="Nodes"
        icon={<Boxes className="h-4 w-4 text-blue-400" />}
        diff={nodes}
        renderSummary={(n) => <NodeSummary node={n} />}
        renderKey={(key) => <span className="font-mono text-[11px]">{key}</span>}
      />
      <CollectionDiffBlock
        title="Edges"
        icon={<GitFork className="h-4 w-4 text-violet-400" />}
        diff={edges}
        renderSummary={(e) => <EdgeSummary edge={e} />}
        renderKey={(key) => <span className="font-mono text-[11px]">{key}</span>}
      />
    </div>
  )
}

function SideLabel({ side, kind }: { side: any; kind: 'state-machines' | 'state-machine-versions' }) {
  if (!side) return <span className="text-muted-foreground italic">unknown</span>
  if (kind === 'state-machine-versions') {
    return (
      <span className="inline-flex items-baseline gap-1">
        <span className="text-xs font-semibold">v{side.versionNumber}</span>
        {side.versionLabel && <span className="text-[10px] text-muted-foreground">· {side.versionLabel}</span>}
        {side.createdAt && (
          <span className="text-[9px] text-muted-foreground">
            · {new Date(side.createdAt).toLocaleString()}
          </span>
        )}
      </span>
    )
  }
  // state-machines
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-xs font-semibold">{side.name ?? side.id}</span>
      {side.version && <span className="text-[10px] text-muted-foreground">· v{side.version}</span>}
    </span>
  )
}

function NodeSummary({ node }: { node: any }) {
  const name = node?.name ?? node?.label ?? node?.id ?? '?'
  const kind = node?.kind ?? node?.type ?? '?'
  const inputs = Array.isArray(node?.inputs) ? node.inputs.length : (Array.isArray(node?.config?.inputs) ? node.config.inputs.length : 0)
  const outputs = Array.isArray(node?.outputs) ? node.outputs.length : (Array.isArray(node?.config?.outputs) ? node.config.outputs.length : 0)
  return (
    <span className="inline-flex items-baseline gap-2 flex-wrap">
      <span className="font-mono text-[10px] text-muted-foreground">{node?.id}</span>
      <span className="text-xs font-semibold">{name}</span>
      <Badge variant="outline" className="text-[9px] h-4 px-1 leading-none">{kind}</Badge>
      {(inputs > 0 || outputs > 0) && (
        <span className="text-[9px] text-muted-foreground">
          {inputs} in / {outputs} out
        </span>
      )}
      {node?.responsiblePartner && (
        <span className="text-[9px] text-muted-foreground">· {node.responsiblePartner}</span>
      )}
    </span>
  )
}

function EdgeSummary({ edge }: { edge: any }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="font-mono text-[11px]">{edge?.source ?? '?'}</span>
      <span className="text-muted-foreground">→</span>
      <span className="font-mono text-[11px]">{edge?.target ?? '?'}</span>
      {edge?.label && <span className="text-[10px] text-muted-foreground">· {edge.label}</span>}
    </span>
  )
}

// ─── Generic collection diff block ──────────────────────────────────────────

interface CollectionDiffBlockProps {
  title: string
  icon: React.ReactNode
  diff: CollectionDiff
  renderSummary: (item: any) => React.ReactNode
  renderKey: (key: string) => React.ReactNode
}

function CollectionDiffBlock({ title, icon, diff, renderSummary, renderKey }: CollectionDiffBlockProps) {
  const total = diff.added.length + diff.removed.length + diff.changed.length
  if (total === 0) {
    return (
      <div className="rounded-md border border-border bg-card/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-xs font-semibold">{title}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">no changes</span>
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-md border border-border bg-card/30">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-xs font-semibold">{title}</span>
        </div>
        <SummaryPills added={diff.added.length} removed={diff.removed.length} changed={diff.changed.length} />
      </div>

      <div className="divide-y divide-border/50">
        {diff.added.map((item, i) => (
          <DiffRow key={`add-${i}`} kind="add" rawItem={item}>
            {renderSummary(item)}
          </DiffRow>
        ))}
        {diff.removed.map((item, i) => (
          <DiffRow key={`rm-${i}`} kind="remove" rawItem={item}>
            {renderSummary(item)}
          </DiffRow>
        ))}
        {diff.changed.map((c, i) => (
          <ChangedRow key={`ch-${i}`} keyLabel={renderKey(c.key)} diffs={c.diffs} />
        ))}
      </div>
    </div>
  )
}

function DiffRow({ kind, rawItem, children }: { kind: 'add' | 'remove'; rawItem?: any; children: React.ReactNode }) {
  const Icon = kind === 'add' ? Plus : Minus
  const [open, setOpen] = useState(false)
  const hasDetail = rawItem !== undefined && rawItem !== null
  return (
    <div
      className={cn(
        kind === 'add' ? 'bg-emerald-500/5' : 'bg-red-500/5',
      )}
    >
      <button
        type="button"
        className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-opacity-75"
        onClick={() => hasDetail && setOpen((o) => !o)}
        disabled={!hasDetail}
        aria-expanded={open}
      >
        {hasDetail ? (
          open ? (
            <ChevronDown className={cn('h-3 w-3 shrink-0 mt-1', kind === 'add' ? 'text-emerald-400' : 'text-red-400')} aria-hidden="true" />
          ) : (
            <ChevronRight className={cn('h-3 w-3 shrink-0 mt-1', kind === 'add' ? 'text-emerald-400' : 'text-red-400')} aria-hidden="true" />
          )
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Icon
          className={cn(
            'h-3.5 w-3.5 shrink-0 mt-0.5',
            kind === 'add' ? 'text-emerald-400' : 'text-red-400',
          )}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">{children}</div>
      </button>
      {open && hasDetail && (
        <div className="px-3 pb-2 pl-9">
          <LineDiff
            left={kind === 'remove' ? rawItem : {}}
            right={kind === 'add' ? rawItem : {}}
          />
        </div>
      )}
    </div>
  )
}

function ChangedRow({ keyLabel, diffs }: { keyLabel: React.ReactNode; diffs: JsonPathValue[] }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-amber-500/5">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-amber-500/10"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        )}
        <Pencil className="h-3.5 w-3.5 text-amber-400 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">{keyLabel}</div>
        <span className="text-[10px] text-amber-300/80 tabular-nums">{diffs.length} field(s)</span>
      </button>
      {open && (
        <div className="px-3 pb-2 pl-9 space-y-1.5">
          {diffs.map((d, i) => (
            <FieldDiff key={i} entry={d} />
          ))}
        </div>
      )}
    </div>
  )
}

function FieldDiff({ entry }: { entry: JsonPathValue }) {
  // Scalars get the compact before/after view. Objects and arrays get a
  // full unified line-by-line diff so the user sees exactly which lines
  // changed (Git-style), not two opaque blobs.
  const isScalarChange = isScalar(entry.left) && isScalar(entry.right)

  if (isScalarChange) {
    return (
      <div className="rounded border border-border/40 bg-background/40 p-2 space-y-0.5">
        <div className="text-[10px] font-mono text-muted-foreground">{entry.path}</div>
        <div className="flex items-start gap-1.5 text-[11px]">
          <Minus className="h-3 w-3 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
          <code className="font-mono text-red-300 break-words whitespace-pre-wrap flex-1">
            {formatScalar(entry.left)}
          </code>
        </div>
        <div className="flex items-start gap-1.5 text-[11px]">
          <Plus className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
          <code className="font-mono text-emerald-300 break-words whitespace-pre-wrap flex-1">
            {formatScalar(entry.right)}
          </code>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded border border-border/40 bg-background/40 p-2 space-y-1">
      <div className="text-[10px] font-mono text-muted-foreground">{entry.path}</div>
      <LineDiff left={entry.left} right={entry.right} />
    </div>
  )
}

function isScalar(v: any): boolean {
  return v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
}

function formatScalar(v: any): string {
  if (v === undefined) return '<undefined>'
  if (v === null) return 'null'
  if (typeof v === 'string') return JSON.stringify(v)
  return String(v)
}

// ─── Iteration diff ─────────────────────────────────────────────────────────

function IterationDiff({ diff }: { diff: any }) {
  const metadata: JsonPathValue[] = Array.isArray(diff.metadataDiff) ? diff.metadataDiff : []
  const nodeStatus: JsonPathValue[] = Array.isArray(diff.nodeStatusDiff) ? diff.nodeStatusDiff : []
  const fileDelta: number = typeof diff.fileCountDelta === 'number' ? diff.fileCountDelta : 0

  const nothing = metadata.length === 0 && nodeStatus.length === 0 && fileDelta === 0

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-card/40 p-3">
        <div className="flex items-center gap-3 flex-wrap text-[11px]">
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded px-1.5 py-0.5 bg-red-500/10 text-red-300 font-mono text-[10px]">LEFT</span>
            <span className="text-xs font-semibold">{diff.left?.displayId ?? diff.left?.id ?? '?'}</span>
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300 font-mono text-[10px]">RIGHT</span>
            <span className="text-xs font-semibold">{diff.right?.displayId ?? diff.right?.id ?? '?'}</span>
          </span>
          <HeaderBadge label="Files Δ" value={fileDelta > 0 ? `+${fileDelta}` : String(fileDelta)} />
        </div>
      </div>

      {nothing && (
        <div className="rounded-md border border-border bg-muted/20 p-6 text-center text-xs text-muted-foreground">
          Identical - no observable differences between these two iterations.
        </div>
      )}

      <PathValueBlock
        title="Metadata"
        icon={<FileText className="h-4 w-4 text-blue-400" />}
        entries={metadata}
      />
      <PathValueBlock
        title="Node statuses"
        icon={<Activity className="h-4 w-4 text-violet-400" />}
        entries={nodeStatus}
      />

      <div className="rounded-md border border-border bg-card/30 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Files className="h-4 w-4 text-amber-400" />
            <span className="text-xs font-semibold">File count</span>
          </div>
          <span
            className={cn(
              'text-xs font-mono',
              fileDelta > 0 && 'text-emerald-400',
              fileDelta < 0 && 'text-red-400',
              fileDelta === 0 && 'text-muted-foreground',
            )}
          >
            {fileDelta > 0 ? `+${fileDelta} new file(s) on right` : fileDelta < 0 ? `${fileDelta} file(s) removed` : 'same count'}
          </span>
        </div>
      </div>
    </div>
  )
}

function PathValueBlock({ title, icon, entries }: { title: string; icon: React.ReactNode; entries: JsonPathValue[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-border bg-card/30 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {icon}
            <span className="text-xs font-semibold">{title}</span>
          </div>
          <span className="text-[10px] text-muted-foreground">no changes</span>
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-md border border-border bg-card/30">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-xs font-semibold">{title}</span>
        </div>
        <span className="text-[10px] text-amber-300/80 tabular-nums">{entries.length} field(s)</span>
      </div>
      <div className="p-3 space-y-1.5">
        {entries.map((e, i) => (
          <FieldDiff key={i} entry={e} />
        ))}
      </div>
    </div>
  )
}
