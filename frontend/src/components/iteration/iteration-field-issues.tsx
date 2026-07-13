import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLinkedFieldIssues, hasOpenIssue, type FieldIssue } from '@/hooks/use-field-issues'

const MAX_LISTED = 4

/**
 * Banner shown on the iteration detail view when post-deployment field issues
 * have been linked back to this iteration - closing the lifecycle feedback loop.
 */
export function IterationFieldIssues({ iterationId }: { iterationId: string }) {
  const { byIteration } = useLinkedFieldIssues()
  const issues = byIteration[iterationId] ?? []
  if (issues.length === 0) return null

  const open = issues.filter((i) => i.status !== 'CLOSED')
  const alarm = hasOpenIssue(issues)

  return (
    <div
      className={cn(
        'shrink-0 flex items-start gap-3 border-b px-6 py-2.5',
        alarm ? 'border-amber-500/30 bg-amber-500/10' : 'border-emerald-500/20 bg-emerald-500/5',
      )}
      role="status"
    >
      {alarm
        ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
        : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-xs font-semibold">
            {alarm
              ? `${open.length} open field issue${open.length === 1 ? '' : 's'} reported against this component`
              : `${issues.length} field issue${issues.length === 1 ? '' : 's'} linked to this iteration - all resolved`}
          </span>
          <Link
            to="/field-issues"
            className="inline-flex items-center gap-0.5 text-[11px] text-blue-400 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500/40 rounded"
          >
            View in Field Issues
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
        <ul className="mt-1 space-y-0.5">
          {issues.slice(0, MAX_LISTED).map((i) => (
            <li key={i.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn('font-bold tracking-wide', severityClass(i.severity))}>{i.severity}</span>
              <span className="opacity-50">·</span>
              <span>{i.status}</span>
              <span className="opacity-50">·</span>
              <span className="truncate text-foreground/80">{i.description}</span>
            </li>
          ))}
          {issues.length > MAX_LISTED && (
            <li className="text-[11px] text-muted-foreground">+{issues.length - MAX_LISTED} more…</li>
          )}
        </ul>
      </div>
    </div>
  )
}

function severityClass(severity: FieldIssue['severity']): string {
  if (severity === 'CRITICAL') return 'text-red-400'
  if (severity === 'HIGH') return 'text-amber-400'
  return 'text-muted-foreground'
}
