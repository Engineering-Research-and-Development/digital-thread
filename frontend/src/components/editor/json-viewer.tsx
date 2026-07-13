import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

/**
 * Lightweight, dependency-free JSON viewer with syntax highlighting,
 * collapsible objects/arrays, indentation guides and a fuzzy search.
 * Used by the editor's "Preview JSON" dialog to show the internal
 * Digital Thread representation of the current state machine.
 */
export function JsonViewer({
  value,
  initiallyExpanded = true,
  className,
}: {
  value: unknown
  initiallyExpanded?: boolean
  className?: string
}) {
  const [search, setSearch] = useState('')

  const stats = useMemo(() => computeStats(value), [value])

  return (
    <div className={cn('rounded-md border border-border bg-background/40 flex flex-col min-h-0', className)}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Search className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter keys / values (substring match)…"
          className="h-8 text-xs border-0 bg-transparent shadow-none focus-visible:ring-0 px-0"
        />
        {search && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setSearch('')}
            title="Clear filter"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0 border-l border-border/50 pl-3 ml-auto">
          {stats.objects} obj · {stats.arrays} arr · {stats.leaves} leaves
        </span>
      </div>
      <div className="overflow-auto font-mono text-sm leading-relaxed p-4 flex-1">
        <JsonNode
          name={null}
          value={value}
          depth={0}
          isLast
          forceExpanded={initiallyExpanded && !search}
          search={search.trim().toLowerCase()}
        />
      </div>
    </div>
  )
}

interface JsonNodeProps {
  name: string | number | null
  value: unknown
  depth: number
  isLast: boolean
  forceExpanded?: boolean
  search: string
}

function JsonNode({ name, value, depth, isLast, forceExpanded, search }: JsonNodeProps) {
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value)
  const isArray = Array.isArray(value)
  const isContainer = isObject || isArray

  // Compute match info for search highlighting + auto-expansion.
  const matched = matchesSearch(name, value, search)
  const containsMatch = useMemo(
    () => (isContainer && search ? subtreeHasMatch(value, search) : false),
    [isContainer, value, search],
  )

  const [open, setOpen] = useState(forceExpanded ?? true)
  const expanded = (search && containsMatch) || (!search && open)

  // Hide subtrees that don't match the filter (when active).
  if (search && !matched && !containsMatch) return null

  const prefix = name === null ? null : typeof name === 'number' ? null : (
    <>
      <span className="text-violet-300">"{name}"</span>
      <span className="text-muted-foreground/70">: </span>
    </>
  )

  if (!isContainer) {
    return (
      <div className="flex items-start hover:bg-muted/20">
        <Indent depth={depth} />
        {prefix}
        <ScalarValue value={value} search={search} matched={matched} />
        {!isLast && <span className="text-muted-foreground/70">,</span>}
      </div>
    )
  }

  const entries: Array<[string | number, unknown]> = isArray
    ? (value as unknown[]).map((v, i) => [i, v])
    : Object.entries(value as Record<string, unknown>)
  const open0 = isArray ? '[' : '{'
  const close0 = isArray ? ']' : '}'
  const count = entries.length
  const summary = isArray ? `${count} item${count === 1 ? '' : 's'}` : `${count} key${count === 1 ? '' : 's'}`

  return (
    <div>
      <div
        className="flex items-start cursor-pointer hover:bg-muted/20 select-none"
        onClick={() => !search && setOpen((o) => !o)}
        role={search ? undefined : 'button'}
        aria-expanded={expanded}
      >
        <Indent depth={depth} />
        {!search && (
          expanded
            ? <ChevronDown className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0 -ml-1" aria-hidden="true" />
            : <ChevronRight className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0 -ml-1" aria-hidden="true" />
        )}
        {prefix}
        <span className="text-muted-foreground">{open0}</span>
        {!expanded && (
          <>
            <span className="text-muted-foreground/50 italic ml-1">{summary}</span>
            <span className="text-muted-foreground">{close0}</span>
            {!isLast && <span className="text-muted-foreground/70">,</span>}
          </>
        )}
      </div>
      {expanded && (
        <>
          {entries.map(([k, v], idx) => (
            <JsonNode
              key={String(k)}
              name={k}
              value={v}
              depth={depth + 1}
              isLast={idx === entries.length - 1}
              forceExpanded={forceExpanded}
              search={search}
            />
          ))}
          <div className="flex items-start">
            <Indent depth={depth} />
            <span className="text-muted-foreground">{close0}</span>
            {!isLast && <span className="text-muted-foreground/70">,</span>}
          </div>
        </>
      )}
    </div>
  )
}

function Indent({ depth }: { depth: number }) {
  return (
    <span className="shrink-0 inline-flex" aria-hidden="true">
      {Array.from({ length: depth }).map((_, i) => (
        <span
          key={i}
          className="inline-block border-l border-border/30 mr-2.5"
          style={{ width: '0.625rem' }}
        />
      ))}
    </span>
  )
}

function ScalarValue({ value, search, matched }: { value: unknown; search: string; matched: boolean }) {
  const text = scalarString(value)
  const cls =
    value === null || value === undefined ? 'text-violet-400/80 italic'
    : typeof value === 'string' ? 'text-emerald-300'
    : typeof value === 'number' ? 'text-amber-300'
    : typeof value === 'boolean' ? 'text-blue-300'
    : 'text-foreground'

  if (search && matched && typeof value !== 'object') {
    return <Highlighted text={text} term={search} className={cls} />
  }
  return <span className={cls}>{text}</span>
}

function Highlighted({ text, term, className }: { text: string; term: string; className?: string }) {
  if (!term) return <span className={className}>{text}</span>
  const lower = text.toLowerCase()
  const i = lower.indexOf(term)
  if (i < 0) return <span className={className}>{text}</span>
  return (
    <span className={className}>
      {text.slice(0, i)}
      <mark className="bg-amber-500/40 text-foreground rounded-sm px-0.5">{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </span>
  )
}

function scalarString(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v === 'string') return `"${v}"`
  return String(v)
}

// ─── Search helpers ─────────────────────────────────────────────────────────

function matchesSearch(name: string | number | null, value: unknown, search: string): boolean {
  if (!search) return false
  if (name !== null && String(name).toLowerCase().includes(search)) return true
  if (value !== null && typeof value !== 'object') {
    return scalarString(value).toLowerCase().includes(search)
  }
  return false
}

function subtreeHasMatch(value: unknown, search: string): boolean {
  if (!search) return false
  if (value === null || value === undefined) return false
  if (typeof value !== 'object') return scalarString(value).toLowerCase().includes(search)
  if (Array.isArray(value)) {
    return value.some((v) => subtreeHasMatch(v, search))
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k.toLowerCase().includes(search)) return true
    if (subtreeHasMatch(v, search)) return true
  }
  return false
}

// ─── Stats (cheap walk) ─────────────────────────────────────────────────────

function computeStats(value: unknown): { objects: number; arrays: number; leaves: number } {
  let objects = 0
  let arrays = 0
  let leaves = 0
  const walk = (v: unknown): void => {
    if (v === null || v === undefined) { leaves++; return }
    if (Array.isArray(v)) { arrays++; v.forEach(walk); return }
    if (typeof v === 'object') {
      objects++
      Object.values(v as Record<string, unknown>).forEach(walk)
      return
    }
    leaves++
  }
  walk(value)
  return { objects, arrays, leaves }
}
