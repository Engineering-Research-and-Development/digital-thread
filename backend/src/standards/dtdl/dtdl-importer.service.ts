import { Injectable, BadRequestException } from '@nestjs/common'
import { validateDtdl } from '../validation/dtdl-validator'

@Injectable()
export class DtdlImporterService {
  import(input: unknown): { name: string; version: string; description?: string; tags: string[]; nodes: any[]; edges: any[] } {
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

    // Parse edges from embedded comment
    let edges: any[] = []
    if (edgesProp?.comment) {
      try { edges = JSON.parse(edgesProp.comment) } catch { edges = [] }
    }

    // Build nodes from Components
    const nodes = components.map((comp: any, idx: number) => {
      const refIface = ifaceMap[comp.schema] as any
      const refContents = refIface?.contents ?? []
      const getProp = (name: string) => refContents.find((c: any) => c['@type'] === 'Property' && c.name === name)

      const categoryProp = getProp('category')
      const category = categoryProp?.displayName ?? 'MANUAL'
      const nodeTypeId = comp.schema?.split(':').pop()?.replace(/;.*$/, '') ?? comp.name.toUpperCase()
      const label = refIface?.displayName ?? comp.displayName ?? comp.name

      const hasCommand = refContents.some((c: any) => c['@type'] === 'Command' && c.name === 'execute')

      return {
        id: comp.name.replace(/_/g, '-'),
        type: category,
        nodeTypeId,
        label,
        description: refIface?.description ?? '',
        responsiblePartner: '',
        position: { x: idx * 250, y: 200 },
        config: {
          ...(hasCommand ? { apiEndpoint: `/api/exec/${nodeTypeId.toLowerCase()}` } : { instructions: `Complete ${label} and upload results` }),
          inputs: [],
          outputs: [],
        },
      }
    })

    return {
      name: workflowIface.displayName ?? 'Imported from DTDL',
      version: '1.0.0',
      description: workflowIface.description,
      tags: ['imported', 'dtdl'],
      nodes,
      edges,
    }
  }
}
