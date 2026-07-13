/**
 * Minimal ODRL 2.2 validator.
 *
 * We do not attempt to implement the full W3C ODRL model. The validator is
 * pragmatic: it checks that the JSON-LD has the expected top-level shape
 * (`@context`, `@type=Policy|Set|Agreement|Offer`, `permission`/`prohibition`/
 * `duty` arrays with sane constraints) and that common actions are known
 * (`use`, `transfer`, `display`, `read`, `modify`).
 */
export interface OdrlPolicy {
  '@context'?: string | string[]
  '@type': 'Policy' | 'Set' | 'Agreement' | 'Offer'
  uid?: string
  target?: string | { '@id': string }
  assigner?: string
  assignee?: string
  permission?: OdrlRule[]
  prohibition?: OdrlRule[]
  duty?: OdrlRule[]
}

export interface OdrlRule {
  action: string | { '@type': 'Action'; value: string }
  target?: string | { '@id': string }
  assigner?: string
  assignee?: string
  constraint?: OdrlConstraint[]
  duty?: OdrlRule[]
}

export interface OdrlConstraint {
  leftOperand: string          // e.g. 'purpose', 'spatial', 'dateTime'
  operator: string             // 'eq', 'lt', 'gt', 'isA'
  rightOperand: string | number | boolean
}

export interface OdrlValidation {
  valid: boolean
  issues: Array<{ severity: 'error' | 'warning'; path: string; message: string }>
}

const KNOWN_ACTIONS = new Set([
  'use', 'transfer', 'display', 'read', 'modify',
  'distribute', 'reproduce', 'derive', 'aggregate', 'archive',
])

const KNOWN_OPERATORS = new Set([
  'eq', 'neq', 'lt', 'lteq', 'gt', 'gteq', 'isA', 'hasPart', 'isPartOf',
])

export function validateOdrl(policy: OdrlPolicy): OdrlValidation {
  const issues: OdrlValidation['issues'] = []
  if (!policy) return { valid: false, issues: [{ severity: 'error', path: '$', message: 'empty policy' }] }
  if (!policy['@type']) issues.push({ severity: 'error', path: '$', message: '@type missing' })
  if (!['Policy', 'Set', 'Agreement', 'Offer'].includes(policy['@type'] as any)) {
    issues.push({ severity: 'error', path: '$.@type', message: `unknown @type ${policy['@type']}` })
  }
  const buckets: Array<[keyof OdrlPolicy, string]> = [['permission', 'permission'], ['prohibition', 'prohibition'], ['duty', 'duty']]
  for (const [key, label] of buckets) {
    const list = (policy[key] ?? []) as OdrlRule[] | undefined
    if (!list) continue
    if (!Array.isArray(list)) {
      issues.push({ severity: 'error', path: `$.${label}`, message: 'must be array' })
      continue
    }
    list.forEach((r, i) => validateRule(r, `$.${label}[${i}]`, issues))
  }
  const hasAny = (policy.permission?.length ?? 0) + (policy.prohibition?.length ?? 0) + (policy.duty?.length ?? 0) > 0
  if (!hasAny) issues.push({ severity: 'warning', path: '$', message: 'policy has no rules' })
  const hasError = issues.some((i) => i.severity === 'error')
  return { valid: !hasError, issues }
}

function validateRule(rule: OdrlRule, path: string, issues: OdrlValidation['issues']) {
  if (!rule.action) { issues.push({ severity: 'error', path: `${path}.action`, message: 'missing action' }); return }
  const actionName = typeof rule.action === 'string' ? rule.action : rule.action?.value
  if (!actionName) issues.push({ severity: 'error', path: `${path}.action`, message: 'malformed action' })
  else if (!KNOWN_ACTIONS.has(actionName)) issues.push({ severity: 'warning', path: `${path}.action`, message: `unknown action "${actionName}"` })
  for (const c of rule.constraint ?? []) {
    if (!c.leftOperand || !c.operator) {
      issues.push({ severity: 'error', path: `${path}.constraint`, message: 'leftOperand/operator required' })
      continue
    }
    if (!KNOWN_OPERATORS.has(c.operator)) {
      issues.push({ severity: 'warning', path: `${path}.constraint.operator`, message: `unknown operator "${c.operator}"` })
    }
  }
}

/**
 * Evaluate whether a proposed `action` is permitted by the policy given a
 * request context (used for runtime enforcement on imports).
 */
export function evaluateAction(policy: OdrlPolicy, action: string, ctx: Record<string, any> = {}): { allowed: boolean; reason?: string } {
  for (const p of policy.prohibition ?? []) {
    const a = typeof p.action === 'string' ? p.action : p.action?.value
    if (a === action && evalConstraints(p.constraint ?? [], ctx)) return { allowed: false, reason: `prohibited by policy` }
  }
  for (const p of policy.permission ?? []) {
    const a = typeof p.action === 'string' ? p.action : p.action?.value
    if (a === action && evalConstraints(p.constraint ?? [], ctx)) return { allowed: true }
  }
  return { allowed: false, reason: 'no matching permission' }
}

function evalConstraints(cs: OdrlConstraint[], ctx: Record<string, any>): boolean {
  for (const c of cs) {
    const v = ctx[c.leftOperand]
    switch (c.operator) {
      case 'eq':   if (v !== c.rightOperand) return false; break
      case 'neq':  if (v === c.rightOperand) return false; break
      case 'lt':   if (!(v < (c.rightOperand as number))) return false; break
      case 'gt':   if (!(v > (c.rightOperand as number))) return false; break
      case 'lteq': if (!(v <= (c.rightOperand as number))) return false; break
      case 'gteq': if (!(v >= (c.rightOperand as number))) return false; break
      default:     return true // unknown operators pass to avoid over-restriction; validator warns separately
    }
  }
  return true
}
