import { Injectable, BadRequestException } from '@nestjs/common'
import { detectAasShape, findWorkflowSubmodel, validateAas } from '../validation/aas-validator'
import { reconcileImportedGroups } from '../import-groups.util'
import type { FlowGroupDef } from '@/iterations/types/flow-node'
import { elementsOf, lastKeyValue } from './aas-core.util'
import { isMwdSubmodel, mwdIdValue, readMwd, toNodeWork } from './mwd-mapper'

export interface ImportedMachine {
  name: string
  version: string
  description?: string
  tags: string[]
  nodes: any[]
  edges: any[]
  groups: FlowGroupDef[]
}

interface ShellInfo {
  name?: string
  description?: string
}

const EDGE_MODEL_TYPES = ['AnnotatedRelationshipElement', 'AnnotatedRelationship']

/**
 * AAS → StateMachine create DTO. Accepts, auto-detected:
 *   (a) an AAS 3.0 Environment with a WorkflowDefinition submodel (the current
 *       export): nodes / edges / groups are rebuilt and every task node whose
 *       `workDescription` reference (or an MWD whose ID equals the node id)
 *       resolves to a Manufacturing Work Description gets its `work`;
 *   (b) the legacy envelope (`modelType: 'AssetAdministrationShell'` + `submodelInline`);
 *   (c) an Environment with MWD submodels but no WorkflowDefinition: one TASK
 *       node per MWD, no edges.
 */
@Injectable()
export class AasImporterService {
  import(input: unknown): ImportedMachine {
    const result = validateAas(input)
    if (!result.valid) {
      throw new BadRequestException({ message: 'AAS validation failed', validation: result })
    }

    const doc = input as any
    if (detectAasShape(doc) === 'legacy') {
      const wfSm = (doc.submodelInline ?? []).find((sm: any) => sm?.idShort === 'WorkflowDefinition')
      if (!wfSm) throw new BadRequestException('WorkflowDefinition submodel not found after validation')
      return this.workflowToMachine(wfSm, { name: doc.idShort, description: firstText(doc.description) }, [])
    }

    const submodels: any[] = Array.isArray(doc.submodels) ? doc.submodels : []
    const shell = Array.isArray(doc.assetAdministrationShells) ? doc.assetAdministrationShells[0] : undefined
    const shellInfo: ShellInfo = { name: shell?.idShort, description: firstText(shell?.description) }
    const mwds = submodels.filter(isMwdSubmodel)
    const wfSm = findWorkflowSubmodel(submodels)
    if (wfSm) return this.workflowToMachine(wfSm, shellInfo, mwds)
    if (mwds.length > 0) return this.mwdOnlyToMachine(mwds, shellInfo)
    throw new BadRequestException('No WorkflowDefinition or Manufacturing Work Description submodel found after validation')
  }

  // ── Shapes (a) and (b): WorkflowDefinition submodel ───────────────────────

  private workflowToMachine(wfSm: any, shell: ShellInfo, mwds: any[]): ImportedMachine {
    const elements = elementsOf(wfSm)

    const getProp = (idShort: string) =>
      elements.find((e: any) => e.modelType === 'Property' && e.idShort === idShort)?.value

    const name = getProp('workflowName') ?? shell.name ?? 'Imported Workflow'
    const version = getProp('version') ?? '1.0.0'
    const tags = parseJsonArray(getProp('tags'))
    const description = shell.description

    const nodeSMCs = elements.filter((e: any) => e.modelType === 'SubmodelElementCollection' && e.idShort?.startsWith('node_'))
    const edgeSMCs = elements.filter((e: any) => EDGE_MODEL_TYPES.includes(e.modelType))

    const mwdBySubmodelId = new Map<string, any>(mwds.map((sm) => [String(sm.id), sm]))
    const mwdByNodeId = new Map<string, any>()
    for (const sm of mwds) {
      const id = mwdIdValue(sm)
      if (id && !mwdByNodeId.has(id)) mwdByNodeId.set(id, sm)
    }

    // SMC idShort → original node id. The exporter mangles '-' into '_' in
    // idShorts, so the reverse mapping must come from the `nodeId` property.
    const nodeIdByShort = new Map<string, string>()

    const nodes = nodeSMCs.map((smc: any, idx: number) => {
      const p = (idShort: string) => (smc.value ?? []).find((v: any) => v.idShort === idShort)?.value
      const inputsSmc = (smc.value ?? []).find((v: any) => v.idShort === 'inputs')
      const outputsSmc = (smc.value ?? []).find((v: any) => v.idShort === 'outputs')
      const portProps = (port: any) => (k: string) => (port.value ?? []).find((v: any) => v.idShort === k)?.value

      const inputs = (inputsSmc?.value ?? []).map((port: any, i: number) => {
        const pp = portProps(port)
        const id = pp('id') ?? `in_${i + 1}`
        return {
          id,
          name: pp('name') ?? pp('label') ?? id,
          cardinality: pp('cardinality') === 'MANY' ? 'MANY' : 'ONE',
          required: pp('required') === 'true',
          fileTypes: parseJsonArray(pp('fileTypes')),
          source: parseSource(pp('source')),
        }
      })
      const outputs = (outputsSmc?.value ?? []).map((port: any, i: number) => {
        const pp = portProps(port)
        const id = pp('id') ?? `out_${i + 1}`
        return {
          id,
          name: pp('name') ?? pp('label') ?? id,
          cardinality: pp('cardinality') === 'MANY' ? 'MANY' : 'ONE',
          required: pp('required') === 'true',
          fileTypes: parseJsonArray(pp('fileTypes')),
        }
      })

      const id = p('nodeId') ?? `imported-node-${idx}`
      nodeIdByShort.set(smc.idShort, id)
      const nodeName = p('name') ?? p('label') ?? smc.idShort
      const responsiblePartnerIds = parseJsonArray(p('responsiblePartnerIds'))
      const gatewayLogic = p('gatewayLogic')
      const groupId = p('groupId')
      // Layout is exported by the legacy envelope only; Environments get a computed layout.
      const hasPosition = p('positionX') !== undefined || p('positionY') !== undefined

      const node: any = {
        id,
        kind: p('kind') || undefined,
        name: nodeName,
        description: p('description') ?? '',
        tags: parseJsonArray(p('tags')),
        responsiblePartnerIds,
        responsiblePartnerId: p('responsiblePartnerId') || responsiblePartnerIds[0] || undefined,
        ...(groupId ? { groupId } : {}),
        ...(gatewayLogic ? { gateway: { logic: gatewayLogic } } : {}),
        inputs,
        outputs,
        ...(hasPosition
          ? { position: { x: parseFloat(p('positionX') ?? '0') || 0, y: parseFloat(p('positionY') ?? '0') || 0 } }
          : {}),
        // legacy carry-over
        type: p('nodeCategory') || undefined,
        nodeTypeId: p('nodeTypeId') || undefined,
        label: nodeName,
        responsiblePartner: p('responsiblePartner') ?? '',
      }

      // IDTA 02100: `workDescription` reference first, then an MWD whose ID is the node id.
      const workRef = (smc.value ?? []).find((v: any) => v.modelType === 'ReferenceElement' && v.idShort === 'workDescription')
      const refTarget = lastKeyValue(workRef?.value)
      const mwd = (refTarget && mwdBySubmodelId.get(refTarget)) ?? mwdByNodeId.get(id)
      if (mwd) {
        const read = readMwd(mwd)
        if (responsiblePartnerIds.length === 0 && read.responsiblePartnerIds.length > 0) {
          node.responsiblePartnerIds = read.responsiblePartnerIds
          node.responsiblePartnerId = read.responsiblePartnerIds[0]
        }
        const work = toNodeWork(read, node.responsiblePartnerId)
        if (work) node.work = work
      }
      return node
    })

    const resolveNodeRef = (ref: any) => {
      const keys: any[] = Array.isArray(ref?.keys) ? ref.keys : []
      const smcKey = [...keys].reverse().find((k) => k?.type === 'SubmodelElementCollection') ?? keys[keys.length - 1]
      const key = String(smcKey?.value ?? '')
      return nodeIdByShort.get(key) ?? key.replace(/^node_/, '').replace(/_/g, '-')
    }

    const edges = edgeSMCs.map((rel: any, idx: number) => {
      const annotation = (k: string) => (rel.annotations ?? []).find((a: any) => a.idShort === k)?.value
      const label = annotation('label')
      return {
        id: annotation('edgeId') ?? rel.idShort?.replace(/^edge_/, '').replace(/_/g, '-') ?? `e-${idx}`,
        source: resolveNodeRef(rel.first),
        target: resolveNodeRef(rel.second),
        label,
      }
    })

    const groupsSmc = elements.find((e: any) => e.modelType === 'SubmodelElementCollection' && e.idShort === 'groups')
    const rawGroups = (groupsSmc?.value ?? []).map((g: any) => {
      const gp = (k: string) => (g.value ?? []).find((v: any) => v.idShort === k)?.value
      return { id: gp('groupId'), name: gp('name'), color: gp('color') || undefined, nodeIds: parseJsonArray(gp('nodeIds')) }
    })
    const groups = reconcileImportedGroups(rawGroups, nodes)

    applyLayout(nodes, edges)
    return { name, version, description, tags, nodes, edges, groups }
  }

  // ── Shape (c): Manufacturing Work Descriptions only ───────────────────────

  private mwdOnlyToMachine(mwds: any[], shell: ShellInfo): ImportedMachine {
    const usedIds = new Set<string>()
    let version: string | undefined
    const nodes = mwds.map((sm, i) => {
      const read = readMwd(sm)
      version ??= read.version
      const id = safeNodeId(read.id, i, usedIds)
      const name = read.description ?? read.id ?? `Work description ${i + 1}`
      const responsiblePartnerIds = read.responsiblePartnerIds
      const work = toNodeWork(read, responsiblePartnerIds[0])
      return {
        id,
        kind: 'TASK',
        name,
        description: '',
        tags: [],
        responsiblePartnerIds,
        responsiblePartnerId: responsiblePartnerIds[0],
        inputs: [],
        outputs: [],
        ...(work ? { work } : {}),
        label: name,
        responsiblePartner: '',
      }
    })
    applyLayout(nodes, [])
    return {
      name: shell.name?.trim() || 'Imported Manufacturing Work Descriptions',
      version: version ?? '1.0.0',
      description: shell.description,
      tags: [],
      nodes,
      edges: [],
      groups: [],
    }
  }
}

function firstText(description: unknown): string | undefined {
  if (!Array.isArray(description)) return undefined
  const text = description[0]?.text
  return typeof text === 'string' && text !== '' ? text : undefined
}

/** Node id from an MWD `ID`: kept when it is route-safe and unique, else `mwd-<n>`. */
function safeNodeId(raw: string | undefined, index: number, used: Set<string>): string {
  let id = typeof raw === 'string' && /^[A-Za-z0-9_.:-]+$/.test(raw) ? raw : `mwd-${index + 1}`
  if (used.has(id)) id = `${id}-${index + 1}`
  used.add(id)
  return id
}

/**
 * Positions for nodes that came without one: a layered layout along the edges
 * (longest path from the sources), or a simple grid when there are no edges.
 */
function applyLayout(nodes: any[], edges: any[]) {
  const pending = nodes.filter((n) => !n.position)
  if (pending.length === 0) return
  const column = new Map<string, number>()
  if (edges.length > 0) {
    const incoming = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
    edges.forEach((e) => incoming.get(e.target)?.push(e.source))
    const visiting = new Set<string>()
    const depthOf = (id: string): number => {
      if (column.has(id)) return column.get(id)!
      if (visiting.has(id)) return 0 // cycle guard
      visiting.add(id)
      const preds = incoming.get(id) ?? []
      const d = preds.length > 0 ? Math.max(...preds.map((p) => depthOf(p) + 1)) : 0
      visiting.delete(id)
      column.set(id, d)
      return d
    }
    nodes.forEach((n) => depthOf(n.id))
  }
  const rows = new Map<number, number>()
  pending.forEach((n, i) => {
    const col = edges.length > 0 ? (column.get(n.id) ?? 0) : i % 4
    const row = edges.length > 0 ? (rows.get(col) ?? 0) : Math.floor(i / 4)
    rows.set(col, row + 1)
    n.position = { x: 100 + col * 300, y: 100 + row * 160 }
  })
}

function parseJsonArray(raw: unknown): any[] {
  if (typeof raw !== 'string') return []
  try {
    const v = JSON.parse(raw)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

/** Reverse of the exporter's source descriptor: `MANUAL`, `DATASOURCE:<id>`, `PREDECESSOR:<nodeId>.<outputId>`. */
function parseSource(raw: unknown): any {
  if (typeof raw !== 'string') return { kind: 'MANUAL' }
  if (raw.startsWith('PREDECESSOR:')) {
    const ref = raw.slice('PREDECESSOR:'.length)
    const dot = ref.lastIndexOf('.')
    return {
      kind: 'PREDECESSOR',
      from: dot >= 0 ? { nodeId: ref.slice(0, dot), outputId: ref.slice(dot + 1) } : { nodeId: ref, outputId: '' },
    }
  }
  if (raw.startsWith('DATASOURCE:')) {
    return { kind: 'DATASOURCE', dataSourceId: raw.slice('DATASOURCE:'.length) }
  }
  return { kind: 'MANUAL' }
}
