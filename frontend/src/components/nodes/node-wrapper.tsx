import { Handle, Position } from '@xyflow/react'
import { NodeStatus, NodeCategory } from '@/types/enums'
import { nodeColor } from '@/data/node-catalog'
import { getPartnerColor } from '@/lib/partner-utils'
import { cn } from '@/lib/utils'
import { getIcon } from '@/lib/icons'
import { FileText, CheckCircle2, XCircle, Loader2, Hand, CircleDashed, CircleSlash } from 'lucide-react'

interface NodeWrapperProps {
  category: NodeCategory
  label: string
  icon: string
  status?: NodeStatus
  responsiblePartner?: string
  outputFilePath?: string
  children?: React.ReactNode
  hasSource?: boolean
  hasTarget?: boolean
  selected?: boolean
  className?: string
  /** Optional one-line description shown below the name (truncated). */
  description?: string
  /** Number of declared inputs - shown as a badge for at-a-glance contract. */
  inputCount?: number
  /** Number of declared outputs - shown as a badge for at-a-glance contract. */
  outputCount?: number
  /** Explicit colour override (template/kind). When absent we fall back to
   * the kind→palette mapping via nodeColor(). */
  color?: string
}

// Semantic status colors:
// IDLE = Grey (blocked), PENDING = Yellow (your turn), RUNNING = Blue, COMPLETED = Green, ERROR = Red
const statusStyles: Record<NodeStatus, string> = {
  [NodeStatus.IDLE]: 'bg-muted/40 opacity-70',
  [NodeStatus.PENDING]: 'bg-amber-500/10 ring-1 ring-amber-500/40',
  [NodeStatus.RUNNING]: 'bg-blue-500/10 node-running',
  [NodeStatus.COMPLETED]: 'bg-emerald-500/10 ring-1 ring-emerald-500/30',
  [NodeStatus.ERROR]: 'bg-red-500/10 ring-1 ring-red-500/40',
  [NodeStatus.SKIPPED]: 'bg-muted/20 opacity-50',
}

const statusDotStyles: Record<NodeStatus, string> = {
  [NodeStatus.IDLE]: 'bg-gray-500',
  [NodeStatus.PENDING]: 'bg-amber-400 animate-pulse',
  [NodeStatus.RUNNING]: 'bg-blue-500 animate-pulse',
  [NodeStatus.COMPLETED]: 'bg-emerald-500',
  [NodeStatus.ERROR]: 'bg-red-500',
  [NodeStatus.SKIPPED]: 'bg-gray-600',
}

const statusLabel: Record<NodeStatus, string> = {
  [NodeStatus.IDLE]: 'Waiting',
  [NodeStatus.PENDING]: 'Your Turn',
  [NodeStatus.RUNNING]: 'Processing',
  [NodeStatus.COMPLETED]: 'Completed',
  [NodeStatus.ERROR]: 'Error',
  [NodeStatus.SKIPPED]: 'Skipped',
}

// Status icons - ensures meaning isn't conveyed by color alone (WCAG 1.4.1)
const StatusIcon = ({ status, className }: { status: NodeStatus; className?: string }) => {
  switch (status) {
    case NodeStatus.COMPLETED:
      return <CheckCircle2 className={cn('h-3.5 w-3.5 text-emerald-500', className)} aria-hidden="true" />
    case NodeStatus.ERROR:
      return <XCircle className={cn('h-3.5 w-3.5 text-red-500', className)} aria-hidden="true" />
    case NodeStatus.RUNNING:
      return <Loader2 className={cn('h-3.5 w-3.5 text-blue-500 animate-spin', className)} aria-hidden="true" />
    case NodeStatus.PENDING:
      return <Hand className={cn('h-3.5 w-3.5 text-amber-400', className)} aria-hidden="true" />
    case NodeStatus.SKIPPED:
      return <CircleSlash className={cn('h-3.5 w-3.5 text-gray-500', className)} aria-hidden="true" />
    case NodeStatus.IDLE:
    default:
      return <CircleDashed className={cn('h-3.5 w-3.5 text-gray-500', className)} aria-hidden="true" />
  }
}

export function NodeWrapper({
  category,
  label,
  icon,
  status = NodeStatus.IDLE,
  responsiblePartner,
  outputFilePath,
  children,
  hasSource = true,
  hasTarget = true,
  selected,
  className,
  description,
  inputCount,
  outputCount,
  color: colorOverride,
}: NodeWrapperProps) {
  const color = nodeColor({ color: colorOverride, category })
  const LucideIcon = getIcon(icon)
  const partnerColor = responsiblePartner ? getPartnerColor(responsiblePartner) : undefined

  return (
    <div
      className={cn(
        'relative min-w-[200px] max-w-[240px] rounded-lg border border-border bg-card text-card-foreground shadow-md transition-all',
        statusStyles[status],
        selected && 'ring-2 ring-blue-500',
        className
      )}
      style={{ borderLeftWidth: '4px', borderLeftColor: color }}
    >
      {hasTarget && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-slate-500 !border-slate-400"
        />
      )}

      {/* Partner badge header */}
      {responsiblePartner && (
        <div
          className="flex items-center justify-between px-3 py-1 rounded-t-md text-[9px] font-bold uppercase tracking-wider"
          style={{ backgroundColor: `${partnerColor}15`, color: partnerColor }}
        >
          <span>{responsiblePartner}</span>
          {status === NodeStatus.PENDING && (
            <span className="bg-amber-500 text-black px-1.5 py-0.5 rounded text-[8px] font-bold animate-pulse">
              YOUR TURN
            </span>
          )}
        </div>
      )}

      {/* Node label + icon + status */}
      <div className="flex items-center gap-2 px-3 py-2">
        {LucideIcon && <LucideIcon className="h-4 w-4 shrink-0" style={{ color }} aria-hidden="true" />}
        <span className="text-xs font-semibold truncate flex-1" title={description ? `${label} - ${description}` : label}>{label}</span>
        <div
          className="flex items-center gap-1.5 shrink-0"
          role="status"
          aria-label={`Status: ${statusLabel[status]}`}
          title={statusLabel[status]}
        >
          <span className="text-[8px] text-muted-foreground uppercase">{statusLabel[status]}</span>
          <StatusIcon status={status} />
          <span className="sr-only">{statusLabel[status]}</span>
          <span className={cn('h-2 w-2 rounded-full', statusDotStyles[status])} aria-hidden="true" />
        </div>
      </div>

      {/* Description (1 line, truncated) - visible on canvas in editor + runtime */}
      {description && (
        <div
          className="px-3 pb-1 text-[9px] text-muted-foreground/80 line-clamp-1"
          title={description}
        >
          {description}
        </div>
      )}

      {/* I/O badges - small contract summary, hidden when both are 0 */}
      {((inputCount ?? 0) > 0 || (outputCount ?? 0) > 0) && (
        <div className="flex items-center gap-1.5 px-3 pb-2 text-[8px]">
          {(inputCount ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-blue-500/15 text-blue-300 px-1 py-0.5"
              title={`${inputCount} input(s) declared`}
            >
              ▸ {inputCount} in
            </span>
          )}
          {(outputCount ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-emerald-500/15 text-emerald-300 px-1 py-0.5"
              title={`${outputCount} output(s) declared`}
            >
              {outputCount} out ▸
            </span>
          )}
        </div>
      )}

      {children && <div className="px-3 pb-2">{children}</div>}

      {/* File version indicator */}
      {outputFilePath && (
        <div className="flex items-center gap-1.5 px-3 pb-2 text-[9px] text-muted-foreground">
          <FileText className="h-3 w-3 shrink-0 text-emerald-500/70" />
          <span className="font-mono truncate">{outputFilePath.split('/').pop()}</span>
        </div>
      )}

      {hasSource && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-slate-500 !border-slate-400"
        />
      )}
    </div>
  )
}
