import { Injectable, BadRequestException } from '@nestjs/common'
import { XMLParser } from 'fast-xml-parser'
import { validateAml } from '../validation/aml-validator'

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })

@Injectable()
export class AmlImporterService {
  importFromXml(xml: string): { name: string; version: string; description?: string; tags: string[]; nodes: any[]; edges: any[] } {
    let parsed: any
    try {
      parsed = xmlParser.parse(xml)
    } catch (e: any) {
      throw new BadRequestException(`Invalid XML: ${e.message}`)
    }

    return this.import(parsed)
  }

  import(parsed: unknown): { name: string; version: string; description?: string; tags: string[]; nodes: any[]; edges: any[] } {
    const result = validateAml(parsed)
    if (!result.valid) {
      throw new BadRequestException({ message: 'AML validation failed', validation: result })
    }

    const caex = (parsed as any).CAEXFile
    const libs = Array.isArray(caex.SystemUnitClassLib) ? caex.SystemUnitClassLib : (caex.SystemUnitClassLib ? [caex.SystemUnitClassLib] : [])

    const nodes: any[] = []
    let workflowName = 'Imported from AML'

    for (const lib of libs) {
      if (lib['@_Name']) workflowName = lib['@_Name'].replace(/_/g, ' ')
      const classes = lib.SystemUnitClass
        ? (Array.isArray(lib.SystemUnitClass) ? lib.SystemUnitClass : [lib.SystemUnitClass])
        : []

      classes.forEach((suc: any, idx: number) => {
        const name = suc['@_Name'] ?? `node-${idx}`
        const roleRef: string = suc.RoleRequirements?.['@_RefBaseRoleClassPath'] ?? 'DigitalThreadRoles/MANUAL'
        const category = roleRef.split('/').pop() ?? 'MANUAL'

        const attrs: any[] = suc.Attribute
          ? (Array.isArray(suc.Attribute) ? suc.Attribute : [suc.Attribute])
          : []
        const getAttr = (attrName: string) =>
          attrs.find((a: any) => (a['@_Name'] ?? '') === attrName)?.['@_Value']

        const nodeTypeId = getAttr('nodeTypeId') ?? name.toUpperCase()
        const label = getAttr('label') ?? name
        const description = getAttr('description') ?? ''
        const responsiblePartner = getAttr('responsiblePartner') ?? ''
        const responsiblePartnerId = getAttr('responsiblePartnerId') || undefined
        // Round-trip the multi-partner list when present.
        const responsiblePartnerIds = (() => { try { return JSON.parse(getAttr('responsiblePartnerIds') ?? '[]') } catch { return [] } })()

        const interfaces: any[] = suc.ExternalInterface
          ? (Array.isArray(suc.ExternalInterface) ? suc.ExternalInterface : [suc.ExternalInterface])
          : []

        const inputs = interfaces
          .filter((i: any) => (i['@_RefBaseClassPath'] ?? '').includes('FileInput'))
          .map((i: any) => {
            const ia: any[] = i.Attribute ? (Array.isArray(i.Attribute) ? i.Attribute : [i.Attribute]) : []
            const ga = (k: string) => ia.find((a: any) => (a['@_Name'] ?? '') === k)?.['@_Value']
            return {
              id: i['@_Name'] ?? '',
              label: ga('label') ?? i['@_Name'] ?? '',
              source: ga('source') ?? 'MANUAL',
              required: ga('required') === 'true',
              fileTypes: (() => { try { return JSON.parse(ga('fileTypes') ?? '[]') } catch { return [] } })(),
            }
          })

        const outputs = interfaces
          .filter((i: any) => (i['@_RefBaseClassPath'] ?? '').includes('FileOutput'))
          .map((i: any) => {
            const ia: any[] = i.Attribute ? (Array.isArray(i.Attribute) ? i.Attribute : [i.Attribute]) : []
            const ga = (k: string) => ia.find((a: any) => (a['@_Name'] ?? '') === k)?.['@_Value']
            return {
              id: i['@_Name'] ?? '',
              label: ga('label') ?? i['@_Name'] ?? '',
              fileTypes: (() => { try { return JSON.parse(ga('fileTypes') ?? '[]') } catch { return [] } })(),
            }
          })

        nodes.push({
          id: name,
          type: category,
          nodeTypeId,
          label,
          description,
          responsiblePartner,
          responsiblePartnerId,
          responsiblePartnerIds,
          position: { x: idx * 250, y: 200 },
          config: { inputs, outputs },
        })
      })
    }

    // Parse edges from InstanceHierarchy InternalLinks
    const edges: any[] = []
    const hierarchies = caex.InstanceHierarchy
      ? (Array.isArray(caex.InstanceHierarchy) ? caex.InstanceHierarchy : [caex.InstanceHierarchy])
      : []

    for (const ih of hierarchies) {
      const links = ih.InternalLink ? (Array.isArray(ih.InternalLink) ? ih.InternalLink : [ih.InternalLink]) : []
      links.forEach((link: any, idx: number) => {
        const attrs: any[] = link.Attribute ? (Array.isArray(link.Attribute) ? link.Attribute : [link.Attribute]) : []
        const labelAttr = attrs.find((a: any) => (a['@_Name'] ?? '') === 'label')
        edges.push({
          id: link['@_Name'] ?? `e-${idx}`,
          source: link['@_RefPartnerSideA'] ?? '',
          target: link['@_RefPartnerSideB'] ?? '',
          label: labelAttr?.['@_Value'],
        })
      })
    }

    return {
      name: workflowName,
      version: '1.0.0',
      tags: ['imported', 'aml'],
      nodes,
      edges,
    }
  }
}
