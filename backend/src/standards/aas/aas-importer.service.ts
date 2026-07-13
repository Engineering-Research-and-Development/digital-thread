import { Injectable, BadRequestException } from '@nestjs/common'
import { validateAas } from '../validation/aas-validator'

@Injectable()
export class AasImporterService {
  /** Convert AAS JSON to StateMachine create DTO */
  import(input: unknown): { name: string; version: string; description?: string; tags: string[]; nodes: any[]; edges: any[] } {
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
    const tags = (() => { try { return JSON.parse(getProp('tags') ?? '[]') } catch { return [] } })()

    const nodeSMCs = elements.filter((e: any) => e.modelType === 'SubmodelElementCollection' && e.idShort.startsWith('node_'))
    const edgeSMCs = elements.filter((e: any) => e.modelType === 'AnnotatedRelationship')

    const nodes = nodeSMCs.map((smc: any, idx: number) => {
      const p = (idShort: string) => (smc.value ?? []).find((v: any) => v.idShort === idShort)?.value
      const inputsSmc = (smc.value ?? []).find((v: any) => v.idShort === 'inputs')
      const outputsSmc = (smc.value ?? []).find((v: any) => v.idShort === 'outputs')

      const parsePortList = (container: any) =>
        (container?.value ?? []).map((port: any) => {
          const pp = (k: string) => (port.value ?? []).find((v: any) => v.idShort === k)?.value
          return {
            id: pp('id') ?? port.idShort,
            label: pp('label') ?? '',
            source: pp('source') ?? 'MANUAL',
            required: pp('required') === 'true',
            fileTypes: (() => { try { return JSON.parse(pp('fileTypes') ?? '[]') } catch { return [] } })(),
          }
        })

      return {
        id: p('nodeId') ?? `imported-node-${idx}`,
        type: p('nodeCategory') ?? 'MANUAL',
        nodeTypeId: p('nodeTypeId') ?? 'MANUAL',
        label: p('label') ?? smc.idShort,
        description: p('description') ?? '',
        responsiblePartner: p('responsiblePartner') ?? '',
        responsiblePartnerId: p('responsiblePartnerId') || undefined,
        // Round-trip the multi-partner list when present.
        responsiblePartnerIds: (() => { try { return JSON.parse(p('responsiblePartnerIds') ?? '[]') } catch { return [] } })(),
        position: { x: parseFloat(p('positionX') ?? '0'), y: parseFloat(p('positionY') ?? '0') },
        config: {
          inputs: parsePortList(inputsSmc),
          outputs: parsePortList(outputsSmc),
        },
      }
    })

    const edges = edgeSMCs.map((rel: any, idx: number) => {
      const sourceKey = rel.first?.keys?.[0]?.value ?? ''
      const targetKey = rel.second?.keys?.[0]?.value ?? ''
      const label = (rel.annotations ?? []).find((a: any) => a.idShort === 'label')?.value
      const sourceId = sourceKey.replace(/^node_/, '').replace(/_/g, '-')
      const targetId = targetKey.replace(/^node_/, '').replace(/_/g, '-')
      return {
        id: rel.idShort?.replace(/^edge_/, '').replace(/_/g, '-') ?? `e-${idx}`,
        source: sourceId,
        target: targetId,
        label,
      }
    })

    return { name, version, tags, nodes, edges }
  }
}
