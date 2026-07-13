/**
 * Centralised RBAC role constants.
 *
 *   SUPERADMIN  Platform/tenant admin. Settings, Partners, Users, DataSources.
 *               The ONLY partner-less role; sees everything.
 *   OWNER       A partner-scoped operator (HAS a partnerId) WITH extra powers:
 *               authors/runs workflows, owns iterations & products for their
 *               partner. Row-scoped like OPERATOR for visibility & node actions.
 *   OPERATOR    Operator scoped to one Partner (HAS a partnerId). Claims/
 *               completes own partner's nodes only; no Settings; no New
 *               Iteration; no product mgmt. (This role was renamed from
 *               PARTNER to disambiguate it from the `Partner` *entity*.)
 */
export const ROLE = {
  SUPERADMIN: 'SUPERADMIN',
  OWNER: 'OWNER',
  OPERATOR: 'OPERATOR',
} as const

export type Role = (typeof ROLE)[keyof typeof ROLE]

export const ALL_ROLES: Role[] = [ROLE.SUPERADMIN, ROLE.OWNER, ROLE.OPERATOR]
/** Roles allowed to author workflows + create iterations + manage products. */
export const STAFF_ROLES: Role[] = [ROLE.SUPERADMIN, ROLE.OWNER]
export const SUPERADMIN_ONLY: Role[] = [ROLE.SUPERADMIN]
/**
 * Roles bound to a single Partner and therefore row-scoped. Used by
 * guards/services: these users only see iterations/products their partner owns
 * or is involved in. SUPERADMIN is intentionally excluded (sees all).
 */
export const PARTNER_SCOPED_ROLES: Role[] = [ROLE.OWNER, ROLE.OPERATOR]
