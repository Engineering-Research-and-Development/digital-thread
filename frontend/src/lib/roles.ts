/**
 * Centralised RBAC role constants — mirrors backend src/auth/roles.ts.
 * Three-tier RBAC: SUPERADMIN | OWNER | OPERATOR.
 * (OPERATOR was renamed from PARTNER to disambiguate the *role*
 * from the `Partner` *entity* — partnerId/responsiblePartnerIds are unchanged.)
 */
export const ROLE = {
  SUPERADMIN: 'SUPERADMIN',
  OWNER: 'OWNER',
  OPERATOR: 'OPERATOR',
} as const

export type Role = (typeof ROLE)[keyof typeof ROLE]

export function isStaff(role?: string | null): boolean {
  return role === ROLE.SUPERADMIN || role === ROLE.OWNER
}
export function canManageSettings(role?: string | null): boolean {
  return role === ROLE.SUPERADMIN
}
export function canAuthorWorkflows(role?: string | null): boolean {
  return role === ROLE.SUPERADMIN || role === ROLE.OWNER
}
export function canStartIteration(role?: string | null): boolean {
  return role === ROLE.SUPERADMIN || role === ROLE.OWNER
}
/**
 * Whether the user may act on (claim/upload/complete) a workflow node.
 * Multi-partner aware + OWNER is partner-scoped:
 *   - SUPERADMIN: god (any node).
 *   - OWNER / OPERATOR: allowed only when their partner is among the node's
 *     responsible partners (matches PartnerScopeGuard node-action behaviour).
 * Accepts the legacy single `nodePartner` name and/or the full `nodePartnerNames`
 * list (resolved display names of responsiblePartnerIds).
 */
export function canActOnNode(opts: {
  role?: string | null
  userPartnerName?: string | null
  nodePartner?: string | null
  nodePartnerNames?: (string | null | undefined)[]
}): boolean {
  if (!opts.role) return false
  if (opts.role === ROLE.SUPERADMIN) return true
  if (opts.role !== ROLE.OWNER && opts.role !== ROLE.OPERATOR) return false
  if (!opts.userPartnerName) return false
  const names = new Set<string>()
  if (opts.nodePartner) names.add(opts.nodePartner)
  for (const n of opts.nodePartnerNames ?? []) if (n) names.add(n)
  return names.has(opts.userPartnerName)
}
