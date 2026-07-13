/**
 * Frontend mirror of `FilesService.assertReadable` ([backend/src/files/files.service.ts]).
 *
 * Single source of truth for the classification × role matrix used across the
 * UI. Backend always re-checks server-side (defense in depth); the frontend
 * uses this to decide between rendering a direct Download anchor or the
 * "Request access" button that opens the governance dialog.
 *
 * | Role / level         | PUBLIC | INTERNAL | PARTNER             | CONFIDENTIAL | RESTRICTED |
 * |----------------------|--------|----------|---------------------|--------------|------------|
 * | SUPERADMIN / OWNER   |   ✅   |    ✅    |   ✅                |      ✅      |     ✅     |
 * | OPERATOR             |   ✅   |    ✅    |   ✅ (scope-gated)  |      🔒      |     🔒     |
 *
 * For PARTNER-tier files, the scope rule is:
 *   (a) the source node belongs to the partner, OR
 *   (b) the file's slot is declared as a PREDECESSOR input on one of the
 *       partner's own nodes.
 *
 * The decision returns `'ALLOW'`, `'BLOCK'` (no point asking — staff-only) or
 * `'REQUEST'` (out-of-scope but governance can grant time-bounded access).
 * `'UNKNOWN'` is returned when we don't have enough context to decide locally
 * (e.g. cross-iteration lineage views) — callers should fall back to a
 * backend probe via `useDownloadOrRequest.tryDownload`.
 */
import { ROLE, type Role } from '@/lib/roles'

export type DownloadDecision = 'ALLOW' | 'REQUEST' | 'BLOCK' | 'UNKNOWN'

export interface MachineNodeLike {
  id: string
  /** Legacy single responsible partner (a partner *name*, e.g. "AIM"). */
  responsiblePartner?: string | null
  /** Multi-partner canonical list of responsible partner *ids*
   * (e.g. ["p-imd","p-aim"]). A node may be co-owned by several teams. */
  responsiblePartnerIds?: string[] | null
  inputs?: Array<{ source?: { kind?: string; from?: { nodeId?: string; outputId?: string } } }> | null
  config?: { inputs?: Array<{ source?: { kind?: string; from?: { nodeId?: string; outputId?: string } } }> } | null
}

export interface FileAccessContext {
  /** Authenticated user's role — required. */
  role?: Role | string
  /** Partner display-name on the authenticated user (e.g. "CAI", "AIMPLAS"). */
  partnerName?: string | null
  /** Authenticated user's partner *id* (e.g. "p-aim"). Required to match the
   * canonical multi-partner `responsiblePartnerIds` on nodes. */
  partnerId?: string | null
  /** Workflow nodes from the iteration that produced the file — used to evaluate
   * scope rules (a) and (b) for PARTNER-tier files. Omit for cross-iteration
   * views (lineage explorer) — the decision falls back to UNKNOWN there. */
  machineNodes?: MachineNodeLike[]
  /** Node that produced the file. */
  sourceNodeId?: string
  /** Output slot id (defaults to 'default' for legacy uploads). */
  outputId?: string | null
  /** File classification level — PUBLIC | INTERNAL | PARTNER | CONFIDENTIAL | RESTRICTED. */
  classification?: string
}

export function decideFileAccess(ctx: FileAccessContext): DownloadDecision {
  if (!ctx.role) return 'UNKNOWN'

  // Staff bypass — see everything.
  if (ctx.role === ROLE.SUPERADMIN || ctx.role === ROLE.OWNER) return 'ALLOW'
  if (ctx.role !== ROLE.OPERATOR) return 'UNKNOWN'

  const cls = (ctx.classification ?? 'INTERNAL').toUpperCase()

  // PUBLIC / INTERNAL — visible across the consortium.
  if (cls === 'PUBLIC' || cls === 'INTERNAL') return 'ALLOW'

  // CONFIDENTIAL / RESTRICTED — out of reach for OPERATOR role; governance can
  // grant a time-bounded exception via the FileAccessRequest workflow.
  if (cls === 'CONFIDENTIAL' || cls === 'RESTRICTED') return 'REQUEST'

  // PARTNER tier — scope-gated. Without machine context (cross-iteration
  // views), we cannot decide locally — let the backend probe.
  if ((!ctx.partnerName && !ctx.partnerId) || !ctx.machineNodes || !ctx.sourceNodeId) return 'UNKNOWN'

  // A node may be co-owned by several partners. Match the viewer
  // against the canonical `responsiblePartnerIds` (ids) AND the legacy
  // singular `responsiblePartner` (name), so a co-responsible partner is not
  // wrongly told to "Request access" for a file they may read/upload. Mirrors
  // the backend's multi-partner `assertReadable`.
  const nodeBelongsToViewer = (n: MachineNodeLike): boolean => {
    const ids = n.responsiblePartnerIds ?? []
    if (ctx.partnerId && ids.includes(ctx.partnerId)) return true
    if (ctx.partnerName && ids.includes(ctx.partnerName)) return true
    if (ctx.partnerName && n.responsiblePartner === ctx.partnerName) return true
    if (ctx.partnerId && n.responsiblePartner === ctx.partnerId) return true
    return false
  }

  const slot = ctx.outputId ?? 'default'
  for (const n of ctx.machineNodes) {
    if (!nodeBelongsToViewer(n)) continue
    // Rule (a): file produced by the partner's own node.
    if (n.id === ctx.sourceNodeId) return 'ALLOW'
    // Rule (b): file declared as PREDECESSOR input of one of the partner's
    // own nodes.
    const inputs = n.inputs ?? n.config?.inputs ?? []
    for (const inp of inputs) {
      const src = inp?.source
      if (src && typeof src === 'object' && src.kind === 'PREDECESSOR') {
        const fromNodeId = src.from?.nodeId
        const fromOutputId = src.from?.outputId ?? 'default'
        if (fromNodeId === ctx.sourceNodeId && fromOutputId === slot) return 'ALLOW'
      }
    }
  }
  return 'REQUEST'
}
