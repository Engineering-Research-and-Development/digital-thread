import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, CheckCircle2, Clock, GitBranch, Hash, Hourglass, PlayCircle, XCircle, History, Package, Boxes } from 'lucide-react'
import type { Iteration } from '@/types/state-machine'
import { IterationStatus } from '@/types/enums'
import { cn } from '@/lib/utils'

function formatDuration(ms: number): string {
  if (ms < 1000) return '< 1s'
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) {
    const m = Math.floor(ms / 60_000)
    const s = Math.round((ms % 60_000) / 1000)
    return s > 0 && m < 10 ? `${m}m ${s}s` : `${m}m`
  }
  const h = Math.floor(ms / 3_600_000)
  const m = Math.round((ms % 3_600_000) / 60_000)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const STATUS_META: Record<IterationStatus, { icon: React.ReactNode; cls: string; label: string }> = {
  [IterationStatus.DRAFT]: {
    icon: <Clock className="h-3 w-3" aria-hidden="true" />,
    cls: 'bg-muted/40 text-muted-foreground border-border',
    label: 'DRAFT',
  },
  [IterationStatus.RUNNING]: {
    icon: <Activity className="h-3 w-3" aria-hidden="true" />,
    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    label: 'RUNNING',
  },
  [IterationStatus.COMPLETED]: {
    icon: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    label: 'COMPLETED',
  },
  [IterationStatus.FAILED]: {
    icon: <XCircle className="h-3 w-3" aria-hidden="true" />,
    cls: 'bg-red-500/15 text-red-400 border-red-500/30',
    label: 'FAILED',
  },
}

export function IterationHeader({ iteration }: { iteration: Iteration }) {
  const status = iteration.status
  const startedAt = new Date(iteration.createdAt).getTime()
  const completedAt = iteration.completedAt ? new Date(iteration.completedAt).getTime() : null

  // Live tick for running iterations
  const [now, setNow] = useState(() => Date.now())
  const isLive = status === IterationStatus.RUNNING
  useEffect(() => {
    if (!isLive) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [isLive])

  const durationMs = completedAt ? completedAt - startedAt : isLive ? now - startedAt : 0
  const meta = STATUS_META[status]

  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/30">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2">
          <Hash className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="font-mono text-sm font-bold">{iteration.displayId || iteration.id}</span>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold tracking-wide',
            meta.cls
          )}
        >
          {meta.icon}
          {meta.label}
        </span>
        <span className="text-xs text-muted-foreground truncate">{iteration.machineName}</span>
        {/* Product (registry entry) - clearly surfaced on the iteration page. */}
        {iteration.product && (
          <span
            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300"
            title={`Product · ${iteration.product.name} (${iteration.product.urn})`}
          >
            <Package className="h-3 w-3" aria-hidden="true" />
            <span className="truncate max-w-[160px]">{iteration.product.name}</span>
          </span>
        )}
        {/* Component reference (URN) - links to the Component Passport. */}
        {iteration.metadata?.componentRef && (
          <Link
            to={`/components/${encodeURIComponent(iteration.metadata.componentRef)}/passport`}
            className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-mono text-sky-300 hover:bg-sky-500/20 transition-colors"
            title={`Component ${iteration.metadata.componentRef} - open Component Passport`}
          >
            <Boxes className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate max-w-[220px]">{iteration.metadata.componentRef}</span>
          </Link>
        )}
        {iteration.version && (
          <Link
            to={`/machines/${iteration.machineId}/versions`}
            className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300 hover:bg-violet-500/20 transition-colors"
            title={`Running on frozen workflow version v${iteration.version.versionNumber}${iteration.version.versionLabel ? ` (${iteration.version.versionLabel})` : ''}. Subsequent edits to the state machine do not affect this iteration.`}
          >
            <History className="h-3 w-3" aria-hidden="true" />
            <span>v{iteration.version.versionNumber}</span>
            {iteration.version.versionLabel && (
              <span className="text-[9px] text-violet-400/70 font-normal">· {iteration.version.versionLabel}</span>
            )}
          </Link>
        )}
        {iteration.parentIterationId && (
          <Link
            to={`/iteration/${iteration.parentIterationId}`}
            className="flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500/40 rounded px-1"
            title="Jump to parent iteration"
          >
            <GitBranch className="h-3 w-3" aria-hidden="true" />
            <span>from {iteration.parentIterationId}</span>
          </Link>
        )}
      </div>

      <div className="flex items-center gap-5 text-xs text-muted-foreground shrink-0">
        <span className="flex items-center gap-1.5" title={new Date(iteration.createdAt).toLocaleString()}>
          <PlayCircle className="h-3 w-3" aria-hidden="true" />
          <span>Started</span>
          <span className="text-foreground/80 tabular-nums">
            {new Date(iteration.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </span>

        {(completedAt || isLive) && (
          <span
            className={cn('flex items-center gap-1.5 tabular-nums', isLive && 'text-blue-400')}
            title={isLive ? 'Elapsed time (live)' : 'Total duration'}
          >
            <Hourglass className={cn('h-3 w-3', isLive && 'animate-pulse')} aria-hidden="true" />
            <span>{isLive ? 'Elapsed' : 'Duration'}</span>
            <span className={cn(!isLive && 'text-foreground/80')}>{formatDuration(durationMs)}</span>
          </span>
        )}

        {completedAt && (
          <span className="flex items-center gap-1.5" title={new Date(completedAt).toLocaleString()}>
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            <span>Completed</span>
            <span className="text-foreground/80 tabular-nums">
              {new Date(completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </span>
        )}
      </div>
    </div>
  )
}
