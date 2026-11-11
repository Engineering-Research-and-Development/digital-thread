import { Injectable, BadRequestException } from '@nestjs/common'
import { validateDtdl } from '../validation/dtdl-validator'
import { reconcileImportedGroups } from '../import-groups.util'
import type { FlowGroupDef } from '@/iterations/types/flow-node'

const FILE_SLOT_SCHEMA = 'dtmi:digitalthread:dt:FileSlot;1'
const KIND_BY_CATEGORY: Record<string, string> = {
  TRIGGER: 'TRIGGER', AUTOMATIC: 'TASK', MANUAL: 'TASK', GATEWAY: 'GATEWAY', STORAGE: 'TASK',
}

@Injectable()
export class DtdlImporterService {
  import(input: unknown): { name: string; version: string; description?: string; tags: string[]; nodes: any[]; edges: any[]; groups: FlowGroupDef[] } {
    const docs = Array.isArray(input) ? input : [input]
    const result = validateDtdl(docs)
    if (!result.valid) {
      throw new BadRequestException({ message: 'DTDL validation failed', validation: result })
    }

    const interfaces = docs.filter((d: any) => d['@type'] === 'Interface')

    // Find workflow Interface (has Components + Relationship flowsTo)
    const workflowIface = interfaces.find((iface: any) => {
      const contents = iface.contents ?? []
      return contents.some((c: any) => c['@type'] === 'Component') &&
             contents.some((c: any) => c['@type'] === 'Relationship' && c.name === 'flowsTo')
    }) as any

    const ifaceMap = Object.fromEntries(interfaces.map((i: any) => [i['@id'], i]))
    const contents = workflowIface.contents ?? []
    const components = contents.filter((c: any) => c['@type'] === 'Component')
    const edgesProp = contents.find((c: any) => c['@type'] === 'Property' && c.name === 'edgesJson')

    // Edges are embedded as JSON in the `edgesJson` Property comment.
    const rawEdges = parseJson(edgesProp?.comment, [])
    const edges: any[] = Array.isArray(rawEdges) ? rawEdges : []

    // Component names mangle '-' into '_'. Files exported before `nodeId` was
    // emitted are resolved against the original ids referenced by the edges.
    const edgeEndpoints = new Set<string>(edges.flatMap((e: any) => [e?.source, e?.target]).filter(Boolean))
    const idByComponentName = new Map<string, string>()
    for (const id of edgeEndpoints) idByComponentName.set(id.replace(/-/g, '_'), id)

    const nodes = components.map((comp: any) => {
      const refIface = ifaceMap[comp.schema] as any
      const refContents: any[] = refIface?.contents ?? []
      const getProp = (name: string) => refContents.find((c: any) => c['@type'] === 'Property' && c.name === name)

      const kind = getProp('kind')?.comment ?? KIND_BY_CATEGORY[getProp('category')?.displayName] ?? 'TASK'
      const id = getProp('nodeId')?.comment ?? idByComponentName.get(comp.name) ?? comp.name.replace(/_/g, '-')
      const name = refIface?.displayName ?? comp.displayName ?? comp.name
      const responsiblePartnerIds = parseJsonArray(getProp('responsiblePartnerIds')?.comment)
      const gatewayLogic = getProp('gatewayLogic')?.comment
      const position = parseJson(getProp('position')?.comment, null)
      const groupId = getProp('groupId')?.comment

      const slots = refContents
        .filter((c: any) => c['@type'] === 'Component' && c.schema === FILE_SLOT_SCHEMA)
        .map((c: any) => ({ comp: c, meta: parseJson(c.comment, {}) ?? {} }))
      const slotBase = ({ comp: c, meta }: any) => ({
        id: meta.slotId ?? c.name.replace(/^(input|output)_/, ''),
        name: c.displayName ?? meta.slotId ?? c.name,
        description: c.description || undefined,
        cardinality: meta.cardinality === 'MANY' ? 'MANY' : 'ONE',
        required: meta.required === true,
        fileTypes: Array.isArray(meta.accepts) ? meta.accepts : [],
      })
      const isRole = (role: string) => (s: any) =>
        (s.meta.role ?? (s.comp.name.startsWith('input_') ? 'input' : 'output')) === role

      const inputs = slots.filter(isRole('input')).map((s: any) => ({ ...slotBase(s), source: toSource(s.meta) }))
      const outputs = slots.filter(isRole('output')).map(slotBase)

      return {
        id,
        kind,
        name,
        description: refIface?.description ?? '',
        tags: parseJsonArray(getProp('tags')?.comment),
        responsiblePartnerIds,
        responsiblePartnerId: getProp('responsiblePartnerId')?.comment || responsiblePartnerIds[0] || undefined,
        responsiblePartner: getProp('responsiblePartner')?.comment || undefined,
        ...(groupId? { groupId } : {}),
        ...(gatewayLogic ? { gateway: { logic: gatewayLogic } } : {}),
        inputs,
        outputs,
        position: position && typeof position === 'object'
          ? { x: Number(position.x) || 0, y: Number(position.y) || 0 }
          : undefined,
        label: name,
      }
    })

    // Files without per-node positions: lay nodes out by depth in the edge graph.
    if (nodes.some((n: any) => !n.position)) layoutByDepth(nodes, edges)

    const groupsProp = contents.find((c: any) => c['@type'] === 'Property' && c.name === 'groupsJson')
    const groups = reconcileImportedGroups(parseJsonArray(groupsProp?.comment), nodes)

    return {
      name: workflowIface.displayName ?? 'Imported from DTDL',
      version: versionFromDtmi(workflowIface['@id']),
      description: workflowIface.description || undefined,
      tags: ['imported', 'dtdl'],
      nodes,
      edges,
      groups,
    }
  }
}

function parseJson(raw: unknown, fallback: any): any {
  if (typeof raw !== 'string') return fallback
  try { return JSON.parse(raw) } catch { return fallback }
}

function parseJsonArray(raw: unknown): any[] {
  const v = parseJson(raw, [])
  return Array.isArray(v) ? v : []
}

/** Rebuild an InputSource from the FileSlot comment metadata. */
function toSource(meta: any): any {
  if (meta.sourceKind === 'PREDECESSOR') {
    // Older exports carry only the kind; the binding is left empty for the
    // editor to complete (normalizeFlowNode keeps PREDECESSOR with empty `from`).
    return { kind: 'PREDECESSOR', from: { nodeId: meta.from?.nodeId ?? '', outputId: meta.from?.outputId ?? '' } }
  }
  if (meta.sourceKind === 'DATASOURCE') {
    return { kind: 'DATASOURCE', dataSourceId: meta.dataSourceId ?? '' }
  }
  return { kind: 'MANUAL' }
}

function versionFromDtmi(dtmi: unknown): string {
  const m = typeof dtmi === 'string' ? /;(\d+)$/.exec(dtmi) : null
  return m ? `${m[1]}.0.0` : '1.0.0'
}

function layoutByDepth(nodes: any[], edges: any[]) {
  const depth = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  // Longest-path layering; bounded iterations so cycles can't loop forever.
  for (let i = 0; i < nodes.length; i++) {
    let changed = false
    for (const e of edges) {
      if (!depth.has(e.source) || !depth.has(e.target)) continue
      const d = depth.get(e.source)! + 1
      if (d > depth.get(e.target)!) { depth.set(e.target, d); changed = true }
    }
    if (!changed) break
  }
  const rowByDepth = new Map<number, number>()
  for (const n of nodes) {
    if (n.position) continue
    const d = depth.get(n.id) ?? 0
    const row = rowByDepth.get(d) ?? 0
    rowByDepth.set(d, row + 1)
    n.position = { x: d * 300, y: row * 180 }
  }
}
