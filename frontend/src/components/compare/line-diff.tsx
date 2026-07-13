import { useMemo } from 'react'
import { cn } from '@/lib/utils'

/**
 * Unified line-by-line diff of two values. Both sides are pretty-printed as
 * JSON (with stable key order) and compared via LCS. Lines unchanged are
 * shown as context; removed lines are highlighted red with a `-` gutter,
 * added lines are green with `+`.
 *
 * Used in the Compare page for non-scalar field differences (objects, arrays)
 * - gives the user a Git-style view instead of two opaque "before/after"
 * JSON blobs.
 */
export function LineDiff({
  left,
  right,
  language = 'json',
}: {
  left: unknown
  right: unknown
  language?: 'json' | 'text'
}) {
  const rows = useMemo(() => {
    const lhs = stringify(left, language)
    const rhs = stringify(right, language)
    return computeLineDiff(lhs, rhs)
  }, [left, right, language])

  if (rows.length === 0) {
    return <p className="text-[10px] text-muted-foreground italic">no textual difference</p>
  }

  // Cap rendering of huge diffs so a 5k-line array doesn't lock the browser;
  // give the user a hint and let them know it was truncated.
  const MAX = 600
  const overLimit = rows.length > MAX
  const view = overLimit ? rows.slice(0, MAX) : rows

  let oldLine = 0
  let newLine = 0
  return (
    <div className="rounded border border-border bg-background/40 overflow-hidden">
      <div className="max-h-[400px] overflow-auto">
        <table className="w-full font-mono text-[11px] leading-tight">
          <tbody>
            {view.map((row, i) => {
              if (row.kind === '=') { oldLine++; newLine++ }
              else if (row.kind === '-') { oldLine++ }
              else { newLine++ }
              return (
                <tr
                  key={i}
                  className={cn(
                    row.kind === '+' && 'bg-emerald-500/10',
                    row.kind === '-' && 'bg-red-500/10',
                  )}
                >
                  <td className="px-1.5 text-[9px] text-muted-foreground/60 tabular-nums select-none w-8 text-right border-r border-border/30">
                    {row.kind === '+' ? '' : oldLine}
                  </td>
                  <td className="px-1.5 text-[9px] text-muted-foreground/60 tabular-nums select-none w-8 text-right border-r border-border/30">
                    {row.kind === '-' ? '' : newLine}
                  </td>
                  <td
                    className={cn(
                      'px-1.5 text-[10px] font-bold select-none w-4 text-center border-r border-border/30',
                      row.kind === '+' && 'text-emerald-400',
                      row.kind === '-' && 'text-red-400',
                      row.kind === '=' && 'text-muted-foreground/40',
                    )}
                  >
                    {row.kind === '=' ? ' ' : row.kind}
                  </td>
                  <td
                    className={cn(
                      'px-2 whitespace-pre',
                      row.kind === '+' && 'text-emerald-300',
                      row.kind === '-' && 'text-red-300',
                    )}
                  >
                    {row.line || ' '}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {overLimit && (
        <div className="px-3 py-1.5 text-[10px] text-amber-400 bg-amber-500/10 border-t border-amber-500/30">
          Truncated - showing first {MAX} lines of {rows.length}. Open "Raw JSON" for full payload.
        </div>
      )}
    </div>
  )
}

function stringify(v: unknown, language: 'json' | 'text'): string {
  if (v === undefined) return '<undefined>'
  if (v === null) return 'null'
  if (language === 'text' && typeof v === 'string') return v
  if (typeof v === 'string') return JSON.stringify(v)
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    // Stable key order via a sorted-keys replacer so identical objects
    // serialise identically regardless of insertion order.
    return JSON.stringify(v, sortedReplacer(), 2)
  } catch {
    return String(v)
  }
}

function sortedReplacer() {
  return (_k: string, value: any) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.keys(value).sort().reduce((acc: any, k) => {
        acc[k] = value[k]
        return acc
      }, {})
    }
    return value
  }
}

interface DiffRow { kind: '=' | '+' | '-'; line: string }

/**
 * Classic LCS (O(M*N)) line diff - fine for the sizes we render here
 * (small workflow JSON snippets). Two-pass: build the LCS length table,
 * then backtrack to produce the diff sequence.
 */
function computeLineDiff(left: string, right: string): DiffRow[] {
  const a = left.split('\n')
  const b = right.split('\n')
  const m = a.length
  const n = b.length

  // lcs[i][j] = length of LCS of a[i..] and b[j..]
  const lcs: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (a[i] === b[j]) lcs[i][j] = lcs[i + 1][j + 1] + 1
      else lcs[i][j] = Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: DiffRow[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) { out.push({ kind: '=', line: a[i] }); i++; j++ }
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) { out.push({ kind: '-', line: a[i] }); i++ }
    else { out.push({ kind: '+', line: b[j] }); j++ }
  }
  while (i < m) { out.push({ kind: '-', line: a[i++] }) }
  while (j < n) { out.push({ kind: '+', line: b[j++] }) }

  return out
}
