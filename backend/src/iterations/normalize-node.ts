/**
 * Normalisation between legacy `nodesJson` shapes and the canonical
 * FlowNodeDef. Every consumer that reads StateMachine.nodesJson MUST go
 * through normalizeFlowNode so the rest of the codebase sees a single shape.
 */

import { NODE_CATALOG } from '@/standards/node-catalog.data'
import type {
  Cardinality,
  Classification,
  FlowGroupDef,
  FlowNodeDef,
  GatewayLogic,
  InputSource,
  NodeInputDef,
  NodeKind,
  NodeOutputDef,
} from './types/flow-node'

const CLASSIFICATIONS: Classification[] = [
  'PUBLIC',
  'INTERNAL',
  'PARTNER',
  'CONFIDENTIAL',
  'RESTRICTED',
]

function normalizeClassification(raw: any): Classification | undefined {
  return typeof raw === 'string' && (CLASSIFICATIONS as string[]).includes(raw)
    ? (raw as Classification)
    : undefined
}

const KIND_BY_CATEGORY: Record<string, NodeKind> = {
  TRIGGER: 'TRIGGER',
  AUTOMATIC: 'TASK',
  MANUAL: 'TASK',
  GATEWAY: 'GATEWAY',
  // The STORAGE kind was removed from the model; legacy STORAGE nodes (in
  // already frozen iterations) normalise to TASK so they keep rendering/running.
  STORAGE: 'TASK',
}

const CATEGORY_BY_TYPE: Record<string, string> = Object.fromEntries(
  NODE_CATALOG.map((e) => [e.nodeTypeId, e.category]),
)

function inferKind(raw: any): NodeKind {
  if (raw?.kind && KIND_BY_CATEGORY[raw.kind as string]) {
    // Map through the table (not the raw value) so legacy 'STORAGE' → 'TASK'.
    return KIND_BY_CATEGORY[raw.kind as string]
  }
  if (typeof raw?.type === 'string' && KIND_BY_CATEGORY[raw.type]) {
    return KIND_BY_CATEGORY[raw.type]
  }
  if (typeof raw?.nodeTypeId === 'string') {
    const category = CATEGORY_BY_TYPE[raw.nodeTypeId]
    if (category && KIND_BY_CATEGORY[category]) return KIND_BY_CATEGORY[category]
  }
  return 'TASK'
}

function normalizeCardinality(raw: any): Cardinality {
  return raw === 'MANY' ? 'MANY' : 'ONE'
}

/**
 * Resolve the canonical multi-partner list. Accepts the new
 * `responsiblePartnerIds[]` and falls back to the legacy single
 * `responsiblePartnerId`. Returns a de-duplicated array of non-empty strings.
 */
export function normalizeResponsiblePartnerIds(raw: any): string[] {
  const out: string[] = []
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.trim() && !out.includes(v)) out.push(v)
  }
  if (Array.isArray(raw?.responsiblePartnerIds)) raw.responsiblePartnerIds.forEach(push)
  push(raw?.responsiblePartnerId)
  return out
}

function normalizeSource(raw: any): InputSource {
  if (raw && typeof raw === 'object' && typeof raw.kind === 'string') {
    if (raw.kind === 'PREDECESSOR') {
      // Preserve the PREDECESSOR kind even when `from` is partially
      // filled (intermediate editor state). The engine's
      // `resolvePredecessorInputs` tolerates empty `from` values (treats them
      // as unresolved). Stripping the kind here would silently flip the
      // binding back to MANUAL in the editor.
      const fromObj = raw.from && typeof raw.from === 'object' ? raw.from : {}
      return {
        kind: 'PREDECESSOR',
        from: {
          nodeId: typeof fromObj.nodeId === 'string' ? fromObj.nodeId : '',
          outputId: typeof fromObj.outputId === 'string' ? fromObj.outputId : '',
        },
      }
    }
    if (raw.kind === 'DATASOURCE') {
      return {
        kind: 'DATASOURCE',
        dataSourceId: typeof raw.dataSourceId === 'string' ? raw.dataSourceId : '',
        query: raw.query,
      }
    }
    if (raw.kind === 'MANUAL') return { kind: 'MANUAL' }
  }
  // Legacy bare-string source — not enough info to materialise the canonical
  // shape; fall back to MANUAL and let the editor re-declare the binding.
  return { kind: 'MANUAL' }
}

function normalizeInput(raw: any, idx: number): NodeInputDef {
  const id = String(raw?.id ?? `in_${idx + 1}`)
  const name = String(raw?.name ?? raw?.label ?? id)
  const fileTypes = Array.isArray(raw?.fileTypes)
    ? raw.fileTypes.map((e: unknown) => String(e).toLowerCase()).filter(Boolean)
    : []
  const source = raw?.source && typeof raw.source === 'object'
    ? normalizeSource(raw.source)
    : normalizeSource(raw?.source)
  // Legacy: if `source` was a bare string 'PREDECESSOR' with no `from`, but
  // there is a `dataSourceId` field, prefer DATASOURCE.
  if (source.kind === 'MANUAL' && typeof raw?.dataSourceId === 'string' && raw.dataSourceId) {
    return {
      id,
      name,
      description: raw?.description,
      cardinality: normalizeCardinality(raw?.cardinality),
      required: Boolean(raw?.required ?? false),
      fileTypes,
      mimeTypes: Array.isArray(raw?.mimeTypes) ? raw.mimeTypes.map(String) : undefined,
      maxSizeMB: typeof raw?.maxSizeMB === 'number' ? raw.maxSizeMB : undefined,
      source: { kind: 'DATASOURCE', dataSourceId: String(raw.dataSourceId) },
      semantic: raw?.semantic,
    }
  }
  return {
    id,
    name,
    description: raw?.description,
    cardinality: normalizeCardinality(raw?.cardinality),
    required: Boolean(raw?.required ?? false),
    fileTypes,
    mimeTypes: Array.isArray(raw?.mimeTypes) ? raw.mimeTypes.map(String) : undefined,
    maxSizeMB: typeof raw?.maxSizeMB === 'number' ? raw.maxSizeMB : undefined,
    source,
    semantic: raw?.semantic,
  }
}

function normalizeOutput(raw: any, idx: number): NodeOutputDef {
  const id = String(raw?.id ?? `out_${idx + 1}`)
  const name = String(raw?.name ?? raw?.label ?? id)
  const fileTypes = Array.isArray(raw?.fileTypes)
    ? raw.fileTypes.map((e: unknown) => String(e).toLowerCase()).filter(Boolean)
    : []
  return {
    id,
    name,
    description: raw?.description,
    cardinality: normalizeCardinality(raw?.cardinality),
    required: Boolean(raw?.required ?? false),
    fileTypes,
    defaultClassification: normalizeClassification(raw?.defaultClassification),
    semantic: raw?.semantic,
  }
}

export function normalizeFlowNode(raw: any): FlowNodeDef {
  if (!raw || typeof raw !== 'object' || !raw.id) {
    throw new Error('normalizeFlowNode: invalid node payload (missing id)')
  }

  const kind = inferKind(raw)
  const name: string = String(raw.name ?? raw.label ?? raw.id)

  const inputsRaw: any[] = Array.isArray(raw.inputs)
    ? raw.inputs
    : Array.isArray(raw?.config?.inputs)
    ? raw.config.inputs
    : []
  const outputsRaw: any[] = Array.isArray(raw.outputs)
    ? raw.outputs
    : Array.isArray(raw?.config?.outputs)
    ? raw.config.outputs
    : []

  const inputs = inputsRaw.map((i, idx) => normalizeInput(i, idx))
  const outputs = outputsRaw.map((o, idx) => normalizeOutput(o, idx))

  // Legacy: a manual node with no explicit outputs but with an expectedOutput
  // hint is normalised to a single `default` output so downstream lookups work.
  if (kind === 'TASK' && outputs.length === 0) {
    const expected = typeof raw?.config?.expectedOutput === 'string' ? raw.config.expectedOutput : undefined
    outputs.push({
      id: 'default',
      name: expected ? `Output (${expected})` : 'Output',
      cardinality: 'ONE',
      required: false,
      fileTypes: Array.isArray(raw?.config?.requiredFileTypes)
        ? raw.config.requiredFileTypes.map((e: unknown) => String(e).toLowerCase())
        : [],
    })
  }

  const gatewayLogic: GatewayLogic | undefined =
    raw.gateway?.logic ??
    (typeof raw?.config?.gateType === 'string' ? (raw.config.gateType as GatewayLogic) : undefined)

  // Kind-specific I/O shape:
  //   TRIGGER → no inputs (pipeline entry point).
  //   GATEWAY → outputs mirror inputs 1:1 (forwards all received inputs to successors).
  const finalInputs = kind === 'TRIGGER' ? [] : inputs
  const finalOutputs =
    kind === 'GATEWAY'
      ? finalInputs.map((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          cardinality: i.cardinality,
          required: i.required,
          fileTypes: i.fileTypes ?? [],
        }))
      : outputs

  const responsiblePartnerIds = normalizeResponsiblePartnerIds(raw)

  const node: FlowNodeDef = {
    id: String(raw.id),
    kind,
    name,
    description: typeof raw.description === 'string' ? raw.description : undefined,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
    // Multi-partner: canonical array + legacy single mirror (= primary).
    responsiblePartnerIds,
    responsiblePartnerId: responsiblePartnerIds[0]
      ?? (typeof raw.responsiblePartnerId === 'string' ? raw.responsiblePartnerId : undefined),
    groupId: typeof raw.groupId === 'string' ? raw.groupId : undefined,
    gateway: kind === 'GATEWAY' ? { logic: gatewayLogic ?? 'AND' } : undefined,
    inputs: finalInputs,
    outputs: finalOutputs,
    position: raw.position && typeof raw.position === 'object' ? raw.position : { x: 0, y: 0 },
    semantic: raw.semantic,
    // legacy
    type: typeof raw.type === 'string' ? raw.type : undefined,
    nodeTypeId: typeof raw.nodeTypeId === 'string' ? raw.nodeTypeId : undefined,
    label: typeof raw.label === 'string' ? raw.label : name,
    responsiblePartner: typeof raw.responsiblePartner === 'string' ? raw.responsiblePartner : undefined,
    config: raw.config && typeof raw.config === 'object' ? raw.config : undefined,
  }
  return node
}

export function normalizeNodesJson(json: string | null | undefined): FlowNodeDef[] {
  if (!json) return []
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch { return [] }
  if (!Array.isArray(parsed)) return []
  return parsed.map((n) => normalizeFlowNode(n))
}

/** Normalise a single visual group definition (defensive). */
export function normalizeFlowGroup(raw: any): FlowGroupDef | null {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null
  return {
    id: String(raw.id),
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Group',
    color: typeof raw.color === 'string' ? raw.color : undefined,
    nodeIds: Array.isArray(raw.nodeIds) ? raw.nodeIds.map(String).filter(Boolean) : [],
    position: raw.position && typeof raw.position === 'object'
      ? { x: Number(raw.position.x) || 0, y: Number(raw.position.y) || 0 }
      : undefined,
    size: raw.size && typeof raw.size === 'object'
      ? { width: Number(raw.size.width) || 0, height: Number(raw.size.height) || 0 }
      : undefined,
  }
}

export function normalizeGroupsJson(json: string | null | undefined): FlowGroupDef[] {
  if (!json) return []
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch { return [] }
  if (!Array.isArray(parsed)) return []
  return parsed.map(normalizeFlowGroup).filter((g): g is FlowGroupDef => g !== null)
}
