import { Injectable } from '@nestjs/common'

/**
 * TemplateResolverService — Handlebars-style template engine for declarative
 * input bindings.
 *
 * Syntax: `{{ path.to.value }}` with optional helpers — `{{ now iso8601 }}`,
 * `{{ default $path "fallback" }}`, `{{ lookup obj key }}`, `{{ iso8601 $ts }}`.
 * Read-only, no eval, whitespace-insensitive. Missing paths resolve to empty
 * string unless `strict: true` is passed (then we throw).
 */
@Injectable()
export class TemplateResolverService {
  /**
   * Expand a template against a context. Supports nested `{{...}}` and a minimal
   * set of helpers. Non-string values in the context are coerced via JSON.stringify.
   */
  resolve(template: string, context: Record<string, any>, opts: { strict?: boolean } = {}): string {
    if (!template) return ''
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, expr: string) => {
      return this.evaluate(expr.trim(), context, opts)
    })
  }

  /**
   * Resolve every string-valued leaf of an object template (deep). Non-string
   * values pass through unchanged. Useful for query templates with parameter
   * objects: `{ from: '{{iteration.metadata.cycleStart}}' }`.
   */
  resolveObject<T extends object>(template: T, context: Record<string, any>, opts: { strict?: boolean } = {}): T {
    const walk = (v: any): any => {
      if (typeof v === 'string') return this.resolve(v, context, opts)
      if (Array.isArray(v)) return v.map(walk)
      if (v && typeof v === 'object') {
        const out: any = {}
        for (const [k, val] of Object.entries(v)) out[k] = walk(val)
        return out
      }
      return v
    }
    return walk(template) as T
  }

  private evaluate(expr: string, ctx: Record<string, any>, opts: { strict?: boolean }): string {
    // Helper form: "<helper> <arg1> <arg2>"
    const parts = this.tokenize(expr)
    if (parts.length > 1) {
      const [helper, ...args] = parts
      const resolvedArgs = args.map((a) => this.resolveToken(a, ctx, opts))
      switch (helper) {
        case 'now':
          return resolvedArgs[0] === 'iso8601' ? new Date().toISOString() : String(Date.now())
        case 'iso8601':
          return new Date(resolvedArgs[0] ?? Date.now()).toISOString()
        case 'default':
          return resolvedArgs[0] && resolvedArgs[0].length > 0 ? resolvedArgs[0] : resolvedArgs[1] ?? ''
        case 'lookup': {
          const obj = this.pathLookup(ctx, args[0])
          const key = resolvedArgs[1]
          return obj && typeof obj === 'object' ? this.coerce(obj[key]) : ''
        }
        default:
          if (opts.strict) throw new Error(`Unknown helper: ${helper}`)
          return ''
      }
    }
    // Plain path resolution
    return this.resolveToken(expr, ctx, opts)
  }

  private tokenize(expr: string): string[] {
    // Simple whitespace split; quoted strings treated as single tokens.
    const out: string[] = []
    let buf = ''
    let inQuote: string | null = null
    for (const ch of expr) {
      if (inQuote) {
        if (ch === inQuote) { inQuote = null }
        else { buf += ch }
      } else if (ch === '"' || ch === "'") {
        inQuote = ch
      } else if (/\s/.test(ch)) {
        if (buf) { out.push(buf); buf = '' }
      } else {
        buf += ch
      }
    }
    if (buf) out.push(buf)
    return out
  }

  private resolveToken(token: string, ctx: Record<string, any>, opts: { strict?: boolean }): string {
    // Quoted literal
    if (/^".*"$|^'.*'$/.test(token)) return token.slice(1, -1)
    // Path: dot-separated
    const val = this.pathLookup(ctx, token)
    if (val === undefined || val === null) {
      if (opts.strict) throw new Error(`Unresolved template path: ${token}`)
      return ''
    }
    return this.coerce(val)
  }

  private pathLookup(ctx: any, path: string): any {
    if (!path) return undefined
    const parts = path.replace(/^\$\./, '').split('.')
    let cur = ctx
    for (const p of parts) {
      if (cur == null) return undefined
      cur = cur[p]
    }
    return cur
  }

  private coerce(v: any): string {
    if (v === undefined || v === null) return ''
    if (typeof v === 'string') return v
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    try { return JSON.stringify(v) } catch { return String(v) }
  }
}
