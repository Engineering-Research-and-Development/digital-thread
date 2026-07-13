import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
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
  ArrowLeft,
  ArrowRight,
  Clock,
  Download,
  FileSignature,
  GitBranch,
  Hash,
  Network,
  Table as TableIcon,
  User,
  Bot,
  ChevronUp,
  ChevronDown,
  X,
  FileText,
  Layers,
} from 'lucide-react'
import {
  api,
  type IterationStory,
  type ProvGraph,
  type ProvGraphEdgeKind,
  type ProvGraphNodeKind,
  type StoryFile,
  type StoryStep,
} from '@/lib/api'
import { ReactFlow, Background, Controls, MarkerType, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

interface ProvenanceDoc {
  iterationId: string
  format: string
  body: string
}

/**
 * Iteration Provenance - bidirectional, layperson-friendly view of how an
 * iteration's outputs were produced and consumed.
 *
 * Four tabs:
 *   - Timeline: swimlane per partner, blocks per step over wall-clock time.
 *   - File story: pick a file, walk inputs ← here → downstream uses.
 *   - Table: row-per-file, filter + sort + CSV export.
 *   - Expert: W3C PROV-O graph + raw Turtle (the canonical model).
 *
 * SUPERADMIN/OWNER only (route-guarded).
 */
export function IterationProvenance() {
  const { iterationId } = useParams<{ iterationId: string }>()
  const navigate = useNavigate()
  const [story, setStory] = useState<IterationStory | null>(null)
  const [graph, setGraph] = useState<ProvGraph | null>(null)
  const [prov, setProv] = useState<ProvenanceDoc | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!iterationId) return
    setLoading(true)
    Promise.all([
      api.provenance.story(iterationId),
      api.provenance.graph(iterationId),
      api.provenance.json(iterationId) as Promise<ProvenanceDoc>,
    ])
      .then(([s, g, p]) => {
        setStory(s)
        setGraph(g)
        setProv(p)
      })
      .catch((e) => setError(e?.message ?? 'Failed to load provenance'))
      .finally(() => setLoading(false))
  }, [iterationId])

  return (
    <WipOverlay>
      <TopBar
        title="Provenance"
        subtitle={story ? `${story.displayId} · ${story.machineName} · ${story.status}` : iterationId ? `iteration ${iterationId.slice(0, 8)}…` : ''}
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />
      <div className="p-6 space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
        {!loading && !error && story && graph && prov && (
          <Tabs defaultValue="timeline">
            <TabsList>
              <TabsTrigger value="story" className="gap-1.5">
                <GitBranch className="h-3.5 w-3.5" /> File story
              </TabsTrigger>
              <TabsTrigger value="timeline" className="gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Timeline
              </TabsTrigger>
              <TabsTrigger value="table" className="gap-1.5">
                <TableIcon className="h-3.5 w-3.5" /> Table
              </TabsTrigger>
              <TabsTrigger value="expert" className="gap-1.5">
                <Network className="h-3.5 w-3.5" /> PROV-O
              </TabsTrigger>
            </TabsList>

            <TabsContent value="timeline">
              <TimelineView story={story} />
            </TabsContent>
            <TabsContent value="story">
              <FileStoryView story={story} />
            </TabsContent>
            <TabsContent value="table">
              <TableView story={story} />
            </TabsContent>
            <TabsContent value="expert">
              <ExpertView graph={graph} prov={prov} iterationId={iterationId!} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </WipOverlay>
  )
}

// ─── shared helpers ──────────────────────────────────────────────────────────

const CLASS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  PUBLIC:       { bg: 'bg-blue-500/10',    text: 'text-blue-300',    border: 'border-blue-500/30' },
  INTERNAL:     { bg: 'bg-slate-500/10',   text: 'text-slate-300',   border: 'border-slate-500/30' },
  PARTNER:      { bg: 'bg-violet-500/10',  text: 'text-violet-300',  border: 'border-violet-500/30' },
  CONFIDENTIAL: { bg: 'bg-amber-500/10',   text: 'text-amber-300',   border: 'border-amber-500/30' },
  RESTRICTED:   { bg: 'bg-red-500/10',     text: 'text-red-300',     border: 'border-red-500/30' },
}

const COLLECTION_LABEL: Record<string, string> = {
  MANUAL: 'Manual',
  AUTOMATIC: 'Automatic',
  INGESTED: 'Ingested',
  IMPORTED: 'Imported',
  DERIVED: 'Derived',
}

const STATUS_COLOR: Record<string, string> = {
  IDLE: 'bg-slate-700',
  PENDING: 'bg-slate-500',
  RUNNING: 'bg-blue-500',
  COMPLETED: 'bg-emerald-600',
  ERROR: 'bg-red-600',
  SKIPPED: 'bg-amber-600',
}

function ClassBadge({ value }: { value: string }) {
  const cls = CLASS_COLORS[value] ?? CLASS_COLORS.INTERNAL
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border ${cls.bg} ${cls.text} ${cls.border}`}>
      {value}
    </span>
  )
}

function PartnerBadge({ partner }: { partner: { code: string; fullName: string; color: string } | null }) {
  if (!partner) return <span className="text-[11px] text-muted-foreground italic">no partner</span>
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border"
      style={{ background: `${partner.color}1a`, borderColor: `${partner.color}55`, color: partner.color }}
      title={partner.fullName}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: partner.color }} />
      {partner.code}
    </span>
  )
}

function AgentBadge({ agent }: { agent: { type: string; name: string; version: string | null } | null }) {
  if (!agent) return <span className="text-[11px] text-muted-foreground italic">no agent recorded</span>
  const Icon = agent.type === 'USER' ? User : agent.type === 'HANDLER' ? Bot : Layers
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Icon className="h-3 w-3" /> {agent.name}
      {agent.version ? <span className="opacity-70">· v{agent.version}</span> : null}
    </span>
  )
}

function fmtTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
}

/**
 * Format a duration with two units of resolution (e.g. `2h 14m`, `3d 8h`).
 * Always shows the largest non-zero unit and, when present, the next one down.
 * Tuned for the timeline view where durations range from sub-second handler
 * calls to multi-day manual steps.
 */
function fmtDuration(ms: number | null): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms} ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
  const sec = Math.floor(ms / 1000)
  const min = Math.floor(sec / 60)
  const hr = Math.floor(min / 60)
  const day = Math.floor(hr / 24)
  if (day >= 1) return `${day}d ${hr % 24}h`
  if (hr >= 1) return `${hr}h ${min % 60}m`
  return `${min}m ${sec % 60}s`
}

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

// ─── Timeline / Swimlane view ────────────────────────────────────────────────
//
// Each step renders as a FIXED-WIDTH block, regardless of wall-clock duration -
// a real-time scale is unreadable when one step lasts 5 minutes and another
// lasts 3 days. Blocks are laid out left-to-right by start time within each
// partner's lane; the duration is shown prominently inside each block so the
// reader sees both *order of work* and *how long each step took* at a glance.
// The iteration's wall-clock start → end + total duration sits in the header.

const LANE_HEIGHT = 88
const LANE_PADDING_Y = 10
const LANE_LABEL_WIDTH = 160
const BLOCK_WIDTH = 184
const BLOCK_GAP = 14
const TRACK_PADDING_X = 16

function TimelineView({ story }: { story: IterationStory }) {
  const [selected, setSelected] = useState<StoryStep | null>(null)

  const { lanes, iterStartMs, iterEndMs, colIndexByStep, totalColumns } = useMemo(() => {
    const lanesArr: Array<{ partner: typeof story.partners[number] | null; steps: StoryStep[] }> = []
    const indexByKey = new Map<string, number>()
    for (const p of story.partners) {
      indexByKey.set(p.id, lanesArr.length)
      lanesArr.push({ partner: p, steps: [] })
    }
    // Unassigned lane (only added if used).
    let unassignedIdx = -1
    for (const s of story.steps) {
      if (s.partner) {
        const i = indexByKey.get(s.partner.id)
        if (i != null) lanesArr[i].steps.push(s)
      } else {
        if (unassignedIdx < 0) {
          unassignedIdx = lanesArr.length
          lanesArr.push({ partner: null, steps: [] })
        }
        lanesArr[unassignedIdx].steps.push(s)
      }
    }
    // GLOBAL chronological column assignment - every step gets a column
    // shared across ALL lanes, ordered by start time. This way, a block at
    // column 5 in lane A and a block at column 5 in lane B are concurrent;
    // and an empty cell in a lane means that partner was idle while another
    // partner was doing work at that column. Lane-local sequence is preserved
    // by sorting (steps are added in start-time order), but the same column
    // index is reused across lanes for true cross-partner chronology.
    const startMsOf = (s: StoryStep) =>
      s.startedAt ? new Date(s.startedAt).getTime() : Number.MAX_SAFE_INTEGER
    const endMsOf = (s: StoryStep) =>
      s.completedAt ? new Date(s.completedAt).getTime() : startMsOf(s)
    const globallySorted = [...story.steps].sort((a, b) => {
      const d = startMsOf(a) - startMsOf(b)
      if (d !== 0) return d
      return endMsOf(a) - endMsOf(b)
    })
    const colIdx = new Map<string, number>()
    globallySorted.forEach((s, i) => colIdx.set(s.nodeStateId, i))
    // Also sort each lane's local list so within-lane rendering is monotonic.
    for (const lane of lanesArr) {
      lane.steps.sort((a, b) => (colIdx.get(a.nodeStateId) ?? 0) - (colIdx.get(b.nodeStateId) ?? 0))
    }
    const iterStart = new Date(story.startedAt).getTime()
    const iterEnd = story.endedAt ? new Date(story.endedAt).getTime() : Math.max(Date.now(), iterStart)
    return {
      lanes: lanesArr,
      iterStartMs: iterStart,
      iterEndMs: iterEnd,
      colIndexByStep: colIdx,
      totalColumns: globallySorted.length,
    }
  }, [story])

  const trackWidth = Math.max(
    400,
    TRACK_PADDING_X * 2 + totalColumns * BLOCK_WIDTH + Math.max(0, totalColumns - 1) * BLOCK_GAP,
  )
  const COLUMN_RULER_HEIGHT = 20
  const totalHeight = Math.max(120, COLUMN_RULER_HEIGHT + lanes.length * LANE_HEIGHT)
  const xForCol = (col: number) => TRACK_PADDING_X + col * (BLOCK_WIDTH + BLOCK_GAP)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4" /> Timeline
          <span className="text-xs text-muted-foreground font-normal ml-2">
            {fmtTime(story.startedAt)} → {story.endedAt ? fmtTime(story.endedAt) : 'in progress'}
            <span className="ml-2 px-1.5 py-0.5 rounded bg-muted/60 text-foreground/80 font-mono">
              {fmtDuration(iterEndMs - iterStartMs)}
            </span>
            <span className="ml-2">total</span>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Each row is one partner involved in this iteration; the x-axis is time. Click any block for full detail.
        </p>

        <div className="overflow-x-auto rounded border border-border bg-muted/20">
          <div className="relative" style={{ width: LANE_LABEL_WIDTH + trackWidth, height: totalHeight }}>
            {/* Lane labels (sticky-left effect via solid background) */}
            <div
              className="absolute left-0 top-0 border-r border-border bg-background/60 z-10"
              style={{ width: LANE_LABEL_WIDTH, height: totalHeight }}
            >
              <div
                className="border-b border-border/70 flex items-center justify-end px-2 text-[10px] uppercase tracking-wide text-muted-foreground/70"
                style={{ height: COLUMN_RULER_HEIGHT }}
              >
                step #
              </div>
              {lanes.map((lane, i) => (
                <div
                  key={i}
                  className="border-b border-border/70 flex items-center px-2 text-xs"
                  style={{ height: LANE_HEIGHT }}
                >
                  {lane.partner ? (
                    <div className="flex flex-col gap-1 min-w-0">
                      <PartnerBadge partner={lane.partner} />
                      <span className="text-[10px] text-muted-foreground truncate" title={lane.partner.fullName}>
                        {lane.partner.fullName}
                      </span>
                      <span className="text-[10px] text-muted-foreground/70">
                        {lane.steps.length} step{lane.steps.length === 1 ? '' : 's'}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground italic">No partner</span>
                  )}
                </div>
              ))}
            </div>

            {/* Tracks */}
            <div
              className="absolute"
              style={{ left: LANE_LABEL_WIDTH, top: 0, width: trackWidth, height: totalHeight }}
            >
              {/* Column ruler - shows the global step number at the top of each column */}
              <div
                className="absolute left-0 top-0 border-b border-border/70"
                style={{ width: trackWidth, height: COLUMN_RULER_HEIGHT }}
              >
                {Array.from({ length: totalColumns }).map((_, c) => (
                  <div
                    key={c}
                    className="absolute flex items-center justify-center text-[10px] text-muted-foreground/70 tabular-nums"
                    style={{ left: xForCol(c), top: 0, width: BLOCK_WIDTH, height: COLUMN_RULER_HEIGHT }}
                  >
                    #{c + 1}
                  </div>
                ))}
              </div>

              {/* Column gridlines - faint vertical guides so it's easy to see that a
                  block in lane A and a block in lane B share the same column. */}
              {Array.from({ length: totalColumns }).map((_, c) => (
                <div
                  key={c}
                  className="absolute border-l border-border/30 pointer-events-none"
                  style={{
                    left: xForCol(c) + BLOCK_WIDTH / 2,
                    top: COLUMN_RULER_HEIGHT,
                    height: totalHeight - COLUMN_RULER_HEIGHT,
                  }}
                />
              ))}

              {/* Lane bands */}
              {lanes.map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-b border-border/60"
                  style={{ top: COLUMN_RULER_HEIGHT + i * LANE_HEIGHT, height: LANE_HEIGHT }}
                />
              ))}

              {/* Per-lane horizontal connector - a thin line from the partner's first
                  step to its last step, so the eye follows "this partner's flow" even
                  across empty columns where another partner was working. */}
              {lanes.map((lane, li) => {
                if (lane.steps.length < 2) return null
                const firstCol = colIndexByStep.get(lane.steps[0].nodeStateId) ?? 0
                const lastCol = colIndexByStep.get(lane.steps[lane.steps.length - 1].nodeStateId) ?? firstCol
                const color = lane.partner?.color ?? '#64748b'
                return (
                  <div
                    key={`conn-${li}`}
                    className="absolute pointer-events-none"
                    style={{
                      left: xForCol(firstCol) + BLOCK_WIDTH / 2,
                      top: COLUMN_RULER_HEIGHT + li * LANE_HEIGHT + LANE_HEIGHT / 2,
                      width: xForCol(lastCol) - xForCol(firstCol),
                      height: 2,
                      background: `${color}55`,
                    }}
                  />
                )
              })}

              {/* Step blocks at their globally-shared column.
                  Status-driven styling:
                  - IDLE / PENDING  → faded (opacity 0.55) so "not yet started" reads as quiet
                  - RUNNING         → bright background + pulsing colored halo via an absolute
                                       overlay ring (tailwind `animate-pulse` on the ring only,
                                       so the block content stays crisp)
                  - others          → unchanged */}
              {lanes.map((lane, li) =>
                lane.steps.map((s) => {
                  const col = colIndexByStep.get(s.nodeStateId) ?? 0
                  const x = xForCol(col)
                  const color = lane.partner?.color ?? '#64748b'
                  const isSelected = selected?.nodeStateId === s.nodeStateId
                  const isIdle = s.status === 'IDLE' || s.status === 'PENDING'
                  const isRunning = s.status === 'RUNNING'
                  const blockTop = COLUMN_RULER_HEIGHT + li * LANE_HEIGHT + LANE_PADDING_Y
                  const blockHeight = LANE_HEIGHT - LANE_PADDING_Y * 2
                  return (
                    <button
                      key={s.nodeStateId}
                      type="button"
                      onClick={() => setSelected(s)}
                      className={`absolute rounded text-left border transition shadow-sm hover:shadow-md ${
                        isSelected ? 'ring-2 ring-blue-400' : ''
                      } ${isIdle ? 'opacity-55' : ''}`}
                      style={{
                        left: x,
                        top: blockTop,
                        width: BLOCK_WIDTH,
                        height: blockHeight,
                        background: isRunning ? `${color}38` : `${color}1f`,
                        borderColor: color,
                      }}
                      title={`#${col + 1} · ${s.nodeLabel} - ${s.transformation}`}
                    >
                      {isRunning && (
                        <span
                          aria-hidden
                          className="absolute -inset-0.5 rounded animate-pulse pointer-events-none"
                          style={{
                            boxShadow: `0 0 0 1.5px ${color}, 0 0 14px 3px ${color}aa, 0 0 28px 6px ${color}55`,
                          }}
                        />
                      )}
                      <div className="relative h-full overflow-hidden">
                        <TimelineBlockBody step={s} color={color} />
                      </div>
                    </button>
                  )
                }),
              )}
              {totalColumns === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground italic">
                  No steps have run yet for this iteration.
                </div>
              )}
            </div>
          </div>
        </div>

        {selected && <StepDetailPanel step={selected} story={story} onClose={() => setSelected(null)} />}
      </CardContent>
    </Card>
  )
}

function TimelineBlockBody({ step, color }: { step: StoryStep; color: string }) {
  const filesText = step.outputFileIds.length
    ? `${step.outputFileIds.length} output${step.outputFileIds.length === 1 ? '' : 's'}`
    : 'no outputs'
  return (
    <div className="px-2 py-1.5 flex flex-col h-full gap-0.5">
      <div className="flex items-center gap-1 min-w-0">
        <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLOR[step.status] ?? 'bg-slate-500'}`} />
        <span className="text-[11px] font-semibold truncate flex-1" style={{ color }} title={step.nodeLabel}>
          {step.nodeLabel}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[15px] font-bold tabular-nums leading-none" style={{ color }}>
          {fmtDuration(step.durationMs)}
        </span>
        <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
          {COLLECTION_LABEL[step.collectionMethod] ?? step.collectionMethod}
        </span>
      </div>
      <div className="mt-auto flex items-center justify-between text-[9px] text-muted-foreground/80">
        <span className="truncate" title={step.startedAt ? fmtTime(step.startedAt) : undefined}>
          {step.startedAt
            ? new Date(step.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'not started'}
        </span>
        <span className="shrink-0">{filesText}</span>
      </div>
    </div>
  )
}

function StepDetailPanel({ step, story, onClose }: { step: StoryStep; story: IterationStory; onClose: () => void }) {
  const fileById = useMemo(() => new Map(story.files.map((f) => [f.id, f])), [story.files])
  const inputs = step.inputFileIds.map((id) => fileById.get(id)).filter(Boolean) as StoryFile[]
  const outputs = step.outputFileIds.map((id) => fileById.get(id)).filter(Boolean) as StoryFile[]
  return (
    <Card className="border-blue-400/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            {step.nodeLabel}
            <PartnerBadge partner={step.partner} />
            <span className={`inline-block w-2 h-2 rounded-full ${STATUS_COLOR[step.status] ?? 'bg-slate-500'}`} />
            <span className="text-xs text-muted-foreground font-normal">{step.status}</span>
          </span>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="What happened">{step.transformation}</Field>
          <Field label="Collection">{COLLECTION_LABEL[step.collectionMethod] ?? step.collectionMethod}</Field>
          <Field label="Agent"><AgentBadge agent={step.agent} /></Field>
          <Field label="Duration">{fmtDuration(step.durationMs)}</Field>
          <Field label="Started">{fmtTime(step.startedAt)}</Field>
          <Field label="Completed">{fmtTime(step.completedAt)}</Field>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <FilesList title={`Inputs (${inputs.length})`} files={inputs} emptyHint="No inputs consumed." />
          <FilesList title={`Outputs (${outputs.length})`} files={outputs} emptyHint="No outputs produced." />
        </div>
      </CardContent>
    </Card>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium break-words">{children}</div>
    </div>
  )
}

function FilesList({ title, files, emptyHint }: { title: string; files: StoryFile[]; emptyHint: string }) {
  return (
    <div className="rounded border border-border p-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{title}</div>
      {files.length === 0 ? (
        <div className="text-xs text-muted-foreground italic">{emptyHint}</div>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate">
                  <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f.filename}</span>
                  <ClassBadge value={f.classification} />
                </div>
                <div className="text-[10px] text-muted-foreground truncate" title={f.contentHash ?? undefined}>
                  {f.contentHash ? <><Hash className="h-2.5 w-2.5 inline" /> {f.contentHash.slice(0, 16)}…</> : 'no hash'}
                  · {fmtBytes(f.sizeBytes)}
                </div>
              </div>
              <Link to={`/lineage/${f.id}`} className="text-[10px] text-blue-400 hover:underline shrink-0">
                lineage →
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── File-story breadcrumb view ──────────────────────────────────────────────

function FileStoryView({ story }: { story: IterationStory }) {
  const [selectedId, setSelectedId] = useState<string | null>(story.files[0]?.id ?? null)
  const [search, setSearch] = useState('')

  const fileById = useMemo(() => new Map(story.files.map((f) => [f.id, f])), [story.files])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return story.files
    return story.files.filter(
      (f) =>
        f.filename.toLowerCase().includes(q) ||
        (f.contentHash ?? '').toLowerCase().includes(q) ||
        f.nodeLabel.toLowerCase().includes(q) ||
        (f.partner?.code ?? '').toLowerCase().includes(q),
    )
  }, [story.files, search])

  const selected = selectedId ? fileById.get(selectedId) : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <GitBranch className="h-4 w-4" /> File story
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Pick a file to see its story: who created it, when, from what, and where it went next.
          Click an upstream input or a downstream use to re-root the chain on that file.
        </p>
        <div className="grid md:grid-cols-[280px_1fr] gap-3">
          {/* File picker */}
          <div className="space-y-2">
            <Input
              placeholder="Search filename / hash / step…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs"
            />
            <div className="rounded border border-border max-h-[480px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="p-3 text-xs text-muted-foreground italic">No files match.</div>
              ) : (
                filtered.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedId(f.id)}
                    className={`w-full text-left px-2 py-1.5 border-b border-border last:border-b-0 hover:bg-muted/50 transition ${
                      selectedId === f.id ? 'bg-blue-500/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs truncate flex-1">{f.filename}</span>
                      <ClassBadge value={f.classification} />
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <PartnerBadge partner={f.partner} />
                      <span>· {f.nodeLabel}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chain + narration */}
          <div className="min-w-0">
            {selected ? (
              <FileChain selected={selected} story={story} onSelect={setSelectedId} />
            ) : (
              <div className="text-sm text-muted-foreground italic">Select a file to see its story.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FileChain({
  selected,
  story,
  onSelect,
}: {
  selected: StoryFile
  story: IterationStory
  onSelect: (id: string) => void
}) {
  const fileById = useMemo(() => new Map(story.files.map((f) => [f.id, f])), [story.files])
  const upstream = selected.upstreamFileIds.map((id) => fileById.get(id)).filter(Boolean) as StoryFile[]
  const downstream = selected.downstreamFileIds.map((id) => fileById.get(id)).filter(Boolean) as StoryFile[]

  const narration =
    `${selected.transformation}.` +
    ` Produced on ${fmtTime(selected.timestamp)}` +
    (selected.partner ? ` by ${selected.partner.fullName} (${selected.partner.code})` : '') +
    `. ${upstream.length === 0 ? 'No upstream inputs are recorded' : `Derived from ${upstream.length} upstream file${upstream.length === 1 ? '' : 's'}`}` +
    `; ${downstream.length === 0 ? 'no downstream uses yet' : `consumed by ${downstream.length} downstream file${downstream.length === 1 ? '' : 's'}`}.`

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="p-3 text-xs space-y-2">
          <div className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4" /> {selected.filename}
            <ClassBadge value={selected.classification} />
            {selected.external && (
              <Badge variant="outline" className="text-[10px]">
                from {selected.ownerIterationDisplayId ?? 'other iteration'}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground leading-relaxed">{narration}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-1">
            <Field label="Partner"><PartnerBadge partner={selected.partner} /></Field>
            <Field label="Agent"><AgentBadge agent={selected.agent} /></Field>
            <Field label="Step">{selected.nodeLabel}</Field>
            <Field label="Output slot">{selected.outputId ?? '-'}</Field>
            <Field label="Collection">{COLLECTION_LABEL[selected.collectionMethod] ?? selected.collectionMethod}</Field>
            <Field label="Size">{fmtBytes(selected.sizeBytes)}</Field>
            <Field label="Type">{selected.contentType}</Field>
            <Field label="SHA-256">
              <span className="font-mono text-[10px]" title={selected.contentHash ?? ''}>
                {selected.contentHash ? `${selected.contentHash.slice(0, 24)}…` : 'no hash'}
              </span>
            </Field>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Link to={`/lineage/${selected.id}`} className="text-xs text-blue-400 hover:underline">
              Open in cross-iteration lineage explorer →
            </Link>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        <ChainColumn
          title="Upstream inputs"
          empty="No inputs recorded for this file."
          files={upstream}
          onSelect={onSelect}
          direction="up"
        />
        <ChainColumn
          title="Downstream uses"
          empty="No file derives from this one yet."
          files={downstream}
          onSelect={onSelect}
          direction="down"
        />
      </div>
    </div>
  )
}

function ChainColumn({
  title,
  empty,
  files,
  onSelect,
  direction,
}: {
  title: string
  empty: string
  files: StoryFile[]
  onSelect: (id: string) => void
  direction: 'up' | 'down'
}) {
  const Arrow = direction === 'up' ? ArrowLeft : ArrowRight
  return (
    <div className="rounded border border-border">
      <div className="px-2.5 py-1.5 border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
        {title}
      </div>
      {files.length === 0 ? (
        <div className="p-3 text-xs text-muted-foreground italic">{empty}</div>
      ) : (
        <ul>
          {files.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onSelect(f.id)}
                className="w-full text-left px-2.5 py-2 border-b border-border last:border-b-0 hover:bg-muted/40 transition text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <Arrow className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium truncate flex-1">{f.filename}</span>
                  <ClassBadge value={f.classification} />
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                  <PartnerBadge partner={f.partner} />
                  <span>· {f.transformation}</span>
                </div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">{fmtTime(f.timestamp)}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── Table view ──────────────────────────────────────────────────────────────

type SortKey = 'filename' | 'partner' | 'step' | 'collection' | 'classification' | 'size' | 'timestamp' | 'derived'

function TableView({ story }: { story: IterationStory }) {
  const [search, setSearch] = useState('')
  const [partnerFilter, setPartnerFilter] = useState<string>('ALL')
  const [classFilter, setClassFilter] = useState<string>('ALL')
  const [collectionFilter, setCollectionFilter] = useState<string>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('timestamp')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const partnerOptions = useMemo(
    () => Array.from(new Map(story.files.map((f) => [f.partner?.id ?? '', f.partner])).values()).filter(Boolean) as NonNullable<StoryFile['partner']>[],
    [story.files],
  )
  const classOptions = useMemo(
    () => Array.from(new Set(story.files.map((f) => f.classification))),
    [story.files],
  )
  const collectionOptions = useMemo(
    () => Array.from(new Set(story.files.map((f) => f.collectionMethod))),
    [story.files],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let out = story.files
    if (q) {
      out = out.filter(
        (f) =>
          f.filename.toLowerCase().includes(q) ||
          (f.contentHash ?? '').toLowerCase().includes(q) ||
          f.nodeLabel.toLowerCase().includes(q),
      )
    }
    if (partnerFilter !== 'ALL') out = out.filter((f) => (f.partner?.id ?? '__none__') === partnerFilter)
    if (classFilter !== 'ALL') out = out.filter((f) => f.classification === classFilter)
    if (collectionFilter !== 'ALL') out = out.filter((f) => f.collectionMethod === collectionFilter)

    const sorted = [...out].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      switch (sortKey) {
        case 'filename':       return a.filename.localeCompare(b.filename) * dir
        case 'partner':        return (a.partner?.code ?? '').localeCompare(b.partner?.code ?? '') * dir
        case 'step':           return a.nodeLabel.localeCompare(b.nodeLabel) * dir
        case 'collection':     return a.collectionMethod.localeCompare(b.collectionMethod) * dir
        case 'classification': return a.classification.localeCompare(b.classification) * dir
        case 'size':           return (a.sizeBytes - b.sizeBytes) * dir
        case 'timestamp':      return (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) * dir
        case 'derived':        return (a.upstreamFileIds.length - b.upstreamFileIds.length) * dir
        default:               return 0
      }
    })
    return sorted
  }, [story.files, search, partnerFilter, classFilter, collectionFilter, sortKey, sortDir])

  const onSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }
  const SortArrow = ({ k }: { k: SortKey }) =>
    sortKey === k ? (sortDir === 'asc' ? <ChevronUp className="inline h-3 w-3" /> : <ChevronDown className="inline h-3 w-3" />) : null

  const exportCsv = () => {
    const header = [
      'filename', 'partner_code', 'partner_name', 'step', 'transformation',
      'collection_method', 'classification', 'agent_type', 'agent_name', 'agent_version',
      'size_bytes', 'content_type', 'sha256', 'timestamp', 'output_id',
      'iteration_id', 'iteration_display_id', 'upstream_count', 'downstream_count',
      'external', 'path',
    ]
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v)
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const rows = filtered.map((f) =>
      [
        f.filename,
        f.partner?.code ?? '',
        f.partner?.fullName ?? '',
        f.nodeLabel,
        f.transformation,
        f.collectionMethod,
        f.classification,
        f.agent?.type ?? '',
        f.agent?.name ?? '',
        f.agent?.version ?? '',
        f.sizeBytes,
        f.contentType,
        f.contentHash ?? '',
        f.timestamp,
        f.outputId ?? '',
        f.iterationId,
        f.ownerIterationDisplayId ?? '',
        f.upstreamFileIds.length,
        f.downstreamFileIds.length,
        f.external ? 'true' : 'false',
        f.path,
      ].map(escape).join(','),
    )
    const csv = [header.join(','), ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `provenance-${story.displayId}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-2">
            <TableIcon className="h-4 w-4" /> File table
            <span className="text-xs text-muted-foreground font-normal">{filtered.length} of {story.files.length}</span>
          </span>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5 mr-1" /> CSV
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input
            placeholder="Search filename / hash / step…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
          <Select value={partnerFilter} onValueChange={setPartnerFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Partner" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All partners</SelectItem>
              {partnerOptions.map((p) => (
                <SelectItem key={p!.id} value={p!.id}>{p!.code} - {p!.fullName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Classification" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All classifications</SelectItem>
              {classOptions.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={collectionFilter} onValueChange={setCollectionFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Collection" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All collections</SelectItem>
              {collectionOptions.map((c) => (
                <SelectItem key={c} value={c}>{COLLECTION_LABEL[c] ?? c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded border border-border overflow-x-auto">
          <TableEl>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs cursor-pointer" onClick={() => onSort('filename')}>File <SortArrow k="filename" /></TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => onSort('partner')}>Partner <SortArrow k="partner" /></TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => onSort('step')}>Step <SortArrow k="step" /></TableHead>
                <TableHead className="text-xs">Transformation</TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => onSort('collection')}>Collection <SortArrow k="collection" /></TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => onSort('classification')}>Class <SortArrow k="classification" /></TableHead>
                <TableHead className="text-xs">SHA-256</TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => onSort('size')}>Size <SortArrow k="size" /></TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => onSort('timestamp')}>When <SortArrow k="timestamp" /></TableHead>
                <TableHead className="text-xs cursor-pointer" onClick={() => onSort('derived')}>← / → <SortArrow k="derived" /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="text-xs">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium truncate max-w-[180px]" title={f.filename}>{f.filename}</span>
                      {f.external && <Badge variant="outline" className="text-[9px]">ext</Badge>}
                    </div>
                  </TableCell>
                  <TableCell><PartnerBadge partner={f.partner} /></TableCell>
                  <TableCell className="text-xs">{f.nodeLabel}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={f.transformation}>{f.transformation}</TableCell>
                  <TableCell className="text-xs">{COLLECTION_LABEL[f.collectionMethod] ?? f.collectionMethod}</TableCell>
                  <TableCell><ClassBadge value={f.classification} /></TableCell>
                  <TableCell className="font-mono text-[10px]" title={f.contentHash ?? ''}>
                    {f.contentHash ? `${f.contentHash.slice(0, 12)}…` : '-'}
                  </TableCell>
                  <TableCell className="text-xs">{fmtBytes(f.sizeBytes)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{fmtTime(f.timestamp)}</TableCell>
                  <TableCell className="text-xs">
                    <Link to={`/lineage/${f.id}`} className="text-blue-400 hover:underline">
                      {f.upstreamFileIds.length} / {f.downstreamFileIds.length}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-xs text-muted-foreground italic text-center py-6">
                    No files match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </TableEl>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Expert view (existing PROV-O graph + Turtle) ────────────────────────────

function ExpertView({
  graph,
  prov,
  iterationId,
}: {
  graph: ProvGraph
  prov: ProvenanceDoc
  iterationId: string
}) {
  return (
    <Tabs defaultValue="graph">
      <TabsList>
        <TabsTrigger value="graph" className="gap-1.5">
          <Network className="h-3.5 w-3.5" /> Graph
        </TabsTrigger>
        <TabsTrigger value="turtle" className="gap-1.5">
          <FileSignature className="h-3.5 w-3.5" /> Turtle
        </TabsTrigger>
      </TabsList>

      <TabsContent value="graph">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Network className="h-4 w-4" /> W3C PROV-O graph
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 h-[600px]">
            <ProvGraphView graph={graph} />
          </CardContent>
        </Card>
        <ProvLegend />
      </TabsContent>

      <TabsContent value="turtle">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <FileSignature className="h-4 w-4" /> Turtle serialization
              </span>
              {iterationId && (
                <Button size="sm" asChild>
                  <a href={api.provenance.ttlUrl(iterationId)} target="_blank" rel="noreferrer">
                    <Download className="h-4 w-4 mr-1.5" /> Download .ttl
                  </a>
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {prov.body.trim() ? (
              <pre className="text-[11px] font-mono overflow-auto max-h-[600px] bg-muted/40 rounded p-3">
                {prov.body}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No provenance recorded for this iteration yet.</p>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}

// ─── PROV-O Graph rendering (unchanged from previous implementation) ─────────

const KIND_STYLE: Record<ProvGraphNodeKind, { background: string; border: string; shape: number }> = {
  activity: { background: '#1e3a8a', border: '#60a5fa', shape: 8 },
  entity:   { background: '#5b3a1f', border: '#fbbf24', shape: 999 },
  agent:    { background: '#3f2a5b', border: '#c084fc', shape: 4 },
}

const RELATION_COLOR: Record<ProvGraphEdgeKind, string> = {
  wasGeneratedBy:     '#60a5fa',
  wasAttributedTo:    '#a78bfa',
  wasAssociatedWith:  '#c084fc',
  wasInformedBy:      '#94a3b8',
  wasDerivedFrom:     '#fbbf24',
  wasRevisionOf:      '#f59e0b',
  used:               '#34d399',
}

function ProvGraphView({ graph }: { graph: ProvGraph }) {
  const { nodes, edges } = useMemo(() => {
    if (!graph.nodes.length) return { nodes: [] as Node[], edges: [] as Edge[] }

    const COL_X = { agent: -380, activity: 0, entity: 380 }
    const ITER_Y = 0
    const ACTIVITY_GAP = 60
    const FILE_ROW = 70

    const filesByActivity = new Map<string, ProvGraph['nodes']>()
    const agentByActivity = new Map<string, string>()
    for (const e of graph.edges) {
      if (e.relation === 'wasGeneratedBy') {
        const arr = filesByActivity.get(e.target) ?? []
        arr.push(graph.nodes.find((n) => n.id === e.source)!)
        filesByActivity.set(e.target, arr)
      }
      if (e.relation === 'wasAssociatedWith') {
        agentByActivity.set(e.source, e.target)
      }
    }

    let iteration: ProvGraph['nodes'][number] | undefined
    const activities: ProvGraph['nodes'] = []
    const seenEntities = new Set<string>()
    for (const n of graph.nodes) {
      if (n.id === graph.rootId) iteration = n
      else if (n.kind === 'activity') activities.push(n)
    }

    const positions = new Map<string, { x: number; y: number }>()
    const placedAgents = new Set<string>()

    let cursorY = ITER_Y
    if (iteration) {
      const iterFiles = filesByActivity.get(iteration.id) ?? []
      placeBlock(iteration, iterFiles)
    }
    for (const act of activities) {
      const files = filesByActivity.get(act.id) ?? []
      placeBlock(act, files)
    }
    for (const n of graph.nodes) {
      if (n.kind !== 'entity' || seenEntities.has(n.id) || positions.has(n.id)) continue
      positions.set(n.id, { x: COL_X.entity, y: cursorY })
      cursorY += FILE_ROW
    }
    let agentY = ITER_Y
    for (const n of graph.nodes) {
      if (n.kind !== 'agent' || placedAgents.has(n.id)) continue
      positions.set(n.id, { x: COL_X.agent, y: agentY })
      agentY += FILE_ROW
    }

    function placeBlock(activity: ProvGraph['nodes'][number], files: ProvGraph['nodes']) {
      const fileCount = Math.max(1, files.length)
      const blockHeight = fileCount * FILE_ROW
      const activityY = cursorY + blockHeight / 2 - FILE_ROW / 2
      positions.set(activity.id, { x: COL_X.activity, y: activityY })
      files.forEach((f, i) => {
        positions.set(f.id, { x: COL_X.entity, y: cursorY + i * FILE_ROW })
        seenEntities.add(f.id)
      })
      const agentId = agentByActivity.get(activity.id)
      if (agentId && !placedAgents.has(agentId)) {
        positions.set(agentId, { x: COL_X.agent, y: activityY })
        placedAgents.add(agentId)
      }
      cursorY += blockHeight + ACTIVITY_GAP
    }

    const rfNodes: Node[] = graph.nodes.map((n) => {
      const style = KIND_STYLE[n.kind]
      const attrLine = n.attrs
        ? Object.entries(n.attrs)
            .filter(([, v]) => v != null && v !== '')
            .slice(0, 2)
            .map(([k, v]) => `${k}: ${v}`)
            .join(' · ')
        : ''
      return {
        id: n.id,
        position: positions.get(n.id) ?? { x: 0, y: 0 },
        data: {
          label: (
            <div className="text-xs">
              <div className="text-[9px] uppercase tracking-wide opacity-70">{n.subtype ?? n.kind}</div>
              <div className="font-semibold truncate max-w-[180px]">{n.label}</div>
              {attrLine && <div className="text-[10px] opacity-75 truncate max-w-[180px]">{attrLine}</div>}
            </div>
          ),
        },
        style: {
          background: style.background,
          color: '#fff',
          border: `1.5px solid ${style.border}`,
          borderRadius: style.shape,
          padding: 8,
          width: 200,
        },
      }
    })

    const rfEdges: Edge[] = graph.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.relation,
      labelStyle: { fontSize: 9, fill: '#9ca3af' },
      labelBgStyle: { fill: '#0f172a', fillOpacity: 0.6 },
      markerEnd: { type: MarkerType.ArrowClosed, color: RELATION_COLOR[e.relation] },
      style: { stroke: RELATION_COLOR[e.relation], strokeWidth: 1.2 },
    }))

    return { nodes: rfNodes, edges: rfEdges }
  }, [graph])

  if (!nodes.length) {
    return <div className="p-4 text-sm text-muted-foreground">No provenance recorded for this iteration yet.</div>
  }

  return (
    <ReactFlow nodes={nodes} edges={edges} fitView>
      <Background />
      <Controls />
    </ReactFlow>
  )
}

const NODE_LEGEND: Array<{ kind: ProvGraphNodeKind; title: string; plain: string; example: string }> = [
  {
    kind: 'activity',
    title: 'Activity',
    plain: 'Something that happened over time.',
    example: 'The iteration itself, or one of its state-machine nodes being executed.',
  },
  {
    kind: 'entity',
    title: 'Entity',
    plain: 'A thing with identity that was produced or used.',
    example: 'A file uploaded or generated during the iteration (with SHA-256 hash).',
  },
  {
    kind: 'agent',
    title: 'Agent',
    plain: 'Who or what is responsible for an activity.',
    example: 'The operator that ran a manual step, or the handler+version that ran an automatic one.',
  },
]

const EDGE_LEGEND: Array<{ relation: ProvGraphEdgeKind; reads: string; meaning: string }> = [
  { relation: 'wasGeneratedBy', reads: 'file → node', meaning: 'Which state-machine step produced this file.' },
  { relation: 'wasDerivedFrom', reads: 'file → file', meaning: 'This file was computed from that one (lineage).' },
  { relation: 'wasRevisionOf', reads: 'file → file', meaning: 'A revised version of an earlier file (same logical artifact, new content).' },
  { relation: 'used', reads: 'file → file', meaning: 'This file was consumed as input to produce another (lineage USED edge).' },
  { relation: 'wasAssociatedWith', reads: 'node → agent', meaning: 'Which user or handler executed this step.' },
  { relation: 'wasAttributedTo', reads: 'file → iteration', meaning: 'Which iteration owns this file.' },
  { relation: 'wasInformedBy', reads: 'node → iteration', meaning: 'Which iteration this step belongs to.' },
]

function ProvLegend() {
  return (
    <Card className="mt-3">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">How to read the PROV-O graph</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-xs">
        <p className="text-muted-foreground">
          The graph follows the <span className="font-mono">W3C PROV-O</span> model. Read an arrow
          <span className="font-mono"> A → B </span>
          as "A &lt;relation&gt; B". Example: <span className="font-mono">file → node</span> with
          relation <span className="font-mono">wasGeneratedBy</span> means "this file was generated by
          that node".
        </p>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Nodes (shapes &amp; colors)
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {NODE_LEGEND.map((n) => {
              const s = KIND_STYLE[n.kind]
              return (
                <div key={n.kind} className="flex gap-2.5">
                  <span
                    className="mt-0.5 inline-block h-4 w-4 shrink-0"
                    style={{
                      background: s.background,
                      border: `1.5px solid ${s.border}`,
                      borderRadius: s.shape,
                    }}
                  />
                  <div>
                    <div className="font-semibold">{n.title}</div>
                    <div className="text-muted-foreground">{n.plain}</div>
                    <div className="text-muted-foreground/80 italic">{n.example}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Edges (relations)
          </div>
          <div className="grid gap-1.5 md:grid-cols-2">
            {EDGE_LEGEND.map((e) => (
              <div key={e.relation} className="flex items-start gap-2.5">
                <span
                  className="mt-1.5 inline-block h-0.5 w-6 shrink-0"
                  style={{ background: RELATION_COLOR[e.relation] }}
                />
                <div className="leading-snug">
                  <span className="font-mono font-semibold">{e.relation}</span>
                  <span className="text-muted-foreground"> · {e.reads}</span>
                  <div className="text-muted-foreground">{e.meaning}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
