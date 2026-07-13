import { Injectable, Logger } from '@nestjs/common'
import { UrnRegistry, type UrnKind } from './urn-registry'
import { toCanonical, isKnownUnit } from './qudt-units'

export interface NormalizationIssue {
  layer: 'syntactic' | 'unit' | 'schema' | 'semantic'
  severity: 'error' | 'warning'
  path: string
  message: string
}

export interface NormalizationResult<T = any> {
  ok: boolean
  value: T
  original?: T
  issues: NormalizationIssue[]
}

export interface NodeInputSchema {
  inputId: string
  dataType?: 'string' | 'number' | 'boolean' | 'object' | 'array'
  unit?: string // target canonical unit
  required?: boolean
  semantic?: { kind: UrnKind; field: string } // resolve field value to URN
}

/**
 * NormalizerService — four-layer normalisation pipeline.
 *
 *   1. Syntactic  — JSON parse, encoding sanity.
 *   2. Units      — convert to canonical SI via QUDT table.
 *   3. Schema     — lightweight type/required validation per input.
 *   4. Semantic   — lookup free-text material/standard/partner names in URN registry.
 *
 * Produces a `{ ok, value, issues }` result. `value` is the mutated/normalised
 * payload (deep-cloned); `original` is preserved for `_originalMetadataJson`
 * shadow fields on consumers that want to persist both.
 */
@Injectable()
export class NormalizerService {
  private readonly logger = new Logger(NormalizerService.name)
  readonly urns = new UrnRegistry()

  normalize(payload: any, schema: NodeInputSchema[]): NormalizationResult {
    const issues: NormalizationIssue[] = []
    const original = this.deepClone(payload)
    let value = this.deepClone(payload)

    // 1. Syntactic — if it was a string and looks like JSON, try to parse.
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try { value = JSON.parse(trimmed) } catch {
          issues.push({ layer: 'syntactic', severity: 'warning', path: '$', message: 'payload looks like JSON but did not parse' })
        }
      }
    }

    if (value && typeof value === 'object') {
      for (const s of schema) {
        const raw = (value as any)[s.inputId]

        // 3. Schema — required + dataType
        if ((raw === undefined || raw === null) && s.required) {
          issues.push({ layer: 'schema', severity: 'error', path: s.inputId, message: 'required field missing' })
          continue
        }
        if (raw !== undefined && s.dataType && this.typeOf(raw) !== s.dataType) {
          issues.push({ layer: 'schema', severity: 'error', path: s.inputId, message: `expected ${s.dataType}, got ${this.typeOf(raw)}` })
        }

        // 2. Units — convert `{ value, unit }` shapes to canonical SI.
        if (raw && typeof raw === 'object' && 'value' in raw && 'unit' in raw) {
          if (!isKnownUnit(raw.unit)) {
            issues.push({ layer: 'unit', severity: 'warning', path: s.inputId, message: `unknown unit ${raw.unit}` })
          } else {
            try {
              const canonical = toCanonical(Number(raw.value), String(raw.unit))
              ;(value as any)[s.inputId] = { ...raw, value: canonical.value, unit: canonical.unit, originalValue: raw.value, originalUnit: raw.unit }
            } catch (err: any) {
              issues.push({ layer: 'unit', severity: 'error', path: s.inputId, message: err.message })
            }
          }
        }

        // 4. Semantic — URN lookup on the declared field.
        if (s.semantic && raw && typeof raw === 'object' && s.semantic.field in raw) {
          const urn = this.urns.resolve(s.semantic.kind, raw[s.semantic.field])
          if (urn) {
            ;(value as any)[s.inputId] = { ...raw, urn }
          } else {
            issues.push({
              layer: 'semantic', severity: 'warning', path: `${s.inputId}.${s.semantic.field}`,
              message: `no URN mapping for ${s.semantic.kind} "${raw[s.semantic.field]}"`,
            })
          }
        }
      }
    }

    const hasError = issues.some((i) => i.severity === 'error')
    return { ok: !hasError, value, original, issues }
  }

  registerUrn(kind: UrnKind, urn: string, canonicalName: string, aliases: string[] = []) {
    this.urns.register(kind, { urn, canonicalName, aliases })
  }

  private typeOf(v: any): string {
    if (Array.isArray(v)) return 'array'
    return typeof v
  }

  private deepClone<T>(v: T): T {
    if (v === null || v === undefined) return v
    if (typeof structuredClone === 'function') return structuredClone(v)
    return JSON.parse(JSON.stringify(v))
  }
}
