import { Injectable, BadRequestException } from '@nestjs/common'
import { validateAas } from '../validation/aas-validator'
import { reconcileImportedGroups } from '../import-groups.util'
import type { FlowGroupDef } from '@/iterations/types/flow-node'

@Injectable()
export class AasImporterService {
  /** Convert AAS JSON to StateMachine create DTO */
  import(input: unknown): { name: string; version: string; description?: string; tags: string[]; nodes: any[]; edges: any[]; groups: FlowGroupDef[] } {
    const result = validateAas(input)
    if (!result.valid) {
      throw new BadRequestException({ message: 'AAS validation failed', validation: result })
    }

    const doc = input as any
    const wfSm = (doc.submodelInline ?? []).find((sm: any) => sm.idShort === 'WorkflowDefinition')

    if (!wfSm) {
      throw new BadRequestException('WorkflowDefinition submodel not found after validation')
    }

    const elements = wfSm.submodelElements ?? []

    const getProp = (idShort: string) =>
      elements.find((e: any) => e.modelType === 'Property' && e.idShort === idShort)?.value

    const name = getProp('workflowName') ?? doc.idShort ?? 'Imported Workflow'
    const version = getProp('version') ?? '1.0.0'
    const tags = parseJsonArray(getProp('tags'))
    const description = Array.isArray(doc.description) ? doc.description[0]?.text : undefined

    const nodeSMCs = elements.filter((e: any) => e.modelType === 'SubmodelElementCollection' && e.idShort?.startsWith('node_'))
    const edgeSMCs = elements.filter((e: any) => e.modelType === 'AnnotatedRelationship')

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

      return {
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
        position: { x: parseFloat(p('positionX') ?? '0') || 0, y: parseFloat(p('positionY') ?? '0') || 0 },
        // legacy carry-over
        type: p('nodeCategory') || undefined,
        nodeTypeId: p('nodeTypeId') || undefined,
        label: nodeName,
        responsiblePartner: p('responsiblePartner') ?? '',
      }
    })

    const resolveNodeRef = (key: string) =>
      nodeIdByShort.get(key) ?? key.replace(/^node_/, '').replace(/_/g, '-')

    const edges = edgeSMCs.map((rel: any, idx: number) => {
      const sourceKey = rel.first?.keys?.[0]?.value ?? ''
      const targetKey = rel.second?.keys?.[0]?.value ?? ''
      const label = (rel.annotations ?? []).find((a: any) => a.idShort === 'label')?.value
      return {
        id: rel.idShort?.replace(/^edge_/, '').replace(/_/g, '-') ?? `e-${idx}`,
        source: resolveNodeRef(sourceKey),
        target: resolveNodeRef(targetKey),
        label,
      }
    })

    const groupsSmc = elements.find((e: any) => e.modelType === 'SubmodelElementCollection' && e.idShort === 'groups')
    const rawGroups = (groupsSmc?.value ?? []).map((g: any) => {
      const gp = (k: string) => (g.value ?? []).find((v: any) => v.idShort === k)?.value
      return { id: gp('groupId'), name: gp('name'), color: gp('color') || undefined, nodeIds: parseJsonArray(gp('nodeIds')) }
    })
    const groups = reconcileImportedGroups(rawGroups, nodes)

    return { name, version, description, tags, nodes, edges, groups }
  }
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
