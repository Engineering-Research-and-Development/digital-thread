import { normalizeFlowGroup } from '@/iterations/normalize-node'
import type { FlowGroupDef } from '@/iterations/types/flow-node'

/**
 * Rebuild the visual node groups of an imported machine and keep them
 * consistent with the imported nodes: group members must exist, empty groups
 * are dropped, and every node's `groupId` mirrors its (first) group membership.
 * Nodes that reference a missing group lose their `groupId`.
 */
export function reconcileImportedGroups(rawGroups: unknown, nodes: any[]): FlowGroupDef[] {
  const nodeIds = new Set(nodes.map((n) => n.id))
  const groupOf = new Map<string, string>()
  const groups: FlowGroupDef[] = []

  for (const raw of Array.isArray(rawGroups) ? rawGroups : []) {
    const g = normalizeFlowGroup(raw)
    if (!g || groups.some((x) => x.id === g.id)) continue
    // A node belongs to at most one group (the editor enforces this too).
    // Fall back to the nodes' own `groupId` when the member list is missing.
    const members = g.nodeIds.length > 0 ? g.nodeIds : nodes.filter((n) => n.groupId === g.id).map((n) => n.id)
    g.nodeIds = members.filter((id) => nodeIds.has(id) && !groupOf.has(id))
    if (g.nodeIds.length === 0) continue
    g.nodeIds.forEach((id) => groupOf.set(id, g.id))
    // Position/size are recomputed by the editor from the member bounds.
    groups.push({ id: g.id, name: g.name, ...(g.color ? { color: g.color } : {}), nodeIds: g.nodeIds })
  }

  for (const n of nodes) {
    const gid = groupOf.get(n.id)
    if (gid) n.groupId = gid
    else delete n.groupId
  }
  return groups
}
