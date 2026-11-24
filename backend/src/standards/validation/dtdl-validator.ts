import { ValidationResult, ValidationError, ValidationWarning } from './validation.types'

const VALID_KINDS = ['TRIGGER', 'TASK', 'GATEWAY']

export function validateDtdl(input: unknown): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const docs = Array.isArray(input) ? input : [input]

  if (!Array.isArray(docs) || docs.length === 0 || typeof docs[0] !== 'object') {
    errors.push({ path: '', code: 'DTDL_INVALID_JSON', message: 'Input must be a JSON array or object', suggestion: 'Provide a DTDL v3 JSON array of Interface definitions' })
    return { valid: false, errors, warnings }
  }

  // Check @context
  const hasContext = docs.some((d: any) =>
    d['@context']?.includes?.('dtdl') || d['@context'] === 'dtmi:dtdl:context;3' || d['@context'] === 'dtmi:dtdl:context;2',
  )
  if (!hasContext) {
    errors.push({ path: '[0].@context', code: 'DTDL_MISSING_CONTEXT', message: 'No DTDL @context found', suggestion: 'Add "@context": "dtmi:dtdl:context;3" to at least one Interface' })
  }

  // Find workflow Interface (has Components + Relationship flowsTo)
  const interfaces = docs.filter((d: any) => d['@type'] === 'Interface')
  if (interfaces.length === 0) {
    errors.push({ path: '', code: 'DTDL_NO_INTERFACE', message: 'No Interface found', suggestion: 'Add at least one Interface definition with @type: "Interface"' })
    return { valid: false, errors, warnings }
  }

  // Build map of all Interface @ids
  const interfaceIds = new Set(interfaces.map((i: any) => i['@id']))

  // Find candidate workflow Interface: has Component and Relationship "flowsTo"
  let workflowInterface: any = null
  for (const iface of interfaces) {
    const contents = iface.contents ?? []
    const hasComponent = contents.some((c: any) => c['@type'] === 'Component')
    const hasFlowsTo = contents.some((c: any) => c['@type'] === 'Relationship' && c.name === 'flowsTo')
    if (hasComponent && hasFlowsTo) { workflowInterface = iface; break }
  }

  if (!workflowInterface) {
    errors.push({ path: '', code: 'DTDL_NO_COMPONENTS', message: 'No workflow Interface found (needs Components + Relationship "flowsTo")', suggestion: 'Add Components for each node and a Relationship named "flowsTo" for edges' })
    return { valid: false, errors, warnings }
  }

  const contents = workflowInterface.contents ?? []

  const components = contents.filter((c: any) => c['@type'] === 'Component')
  const flowsTo = contents.filter((c: any) => c['@type'] === 'Relationship' && c.name === 'flowsTo')

  if (components.length === 0) {
    errors.push({ path: `${workflowInterface['@id']}.contents`, code: 'DTDL_NO_COMPONENTS', message: 'Workflow Interface must have at least one Component', suggestion: 'Add Component entries for each workflow node' })
  }

  if (flowsTo.length === 0) {
    errors.push({ path: `${workflowInterface['@id']}.contents`, code: 'DTDL_NO_EDGES', message: 'Workflow Interface must have a Relationship named "flowsTo"', suggestion: 'Add { "@type": "Relationship", "name": "flowsTo", "properties": [...] }' })
  }

  // Check Component schema references
  for (const comp of components) {
    const schemaId = comp.schema
    if (!schemaId || !interfaceIds.has(schemaId)) {
      errors.push({
        path: `${workflowInterface['@id']}.contents[${comp.name}].schema`,
        code: 'DTDL_BROKEN_SCHEMA_REF',
        message: `Component "${comp.name}" references unknown schema "${schemaId}"`,
        suggestion: `Add an Interface with @id "${schemaId}" to the document`,
      })
      continue
    }

    // Referenced Interface must declare the node kind: canonical `kind`
    // (what the exporter emits) or legacy `category`.
    const refIface = interfaces.find((i: any) => i['@id'] === schemaId)
    const refContents = refIface?.contents ?? []
    const kindProp = refContents.find((c: any) => c['@type'] === 'Property' && c.name === 'kind')
    const hasCategory = refContents.some((c: any) => c['@type'] === 'Property' && c.name === 'category')
    if (kindProp) {
      if (kindProp.comment && !VALID_KINDS.includes(kindProp.comment)) {
        errors.push({
          path: `${schemaId}.contents[kind]`,
          code: 'DTDL_INVALID_KIND',
          message: `Interface "${schemaId}" has invalid kind "${kindProp.comment}"`,
          suggestion: `Set the "kind" Property comment to one of: ${VALID_KINDS.join(', ')}`,
        })
      }
    } else if (!hasCategory) {
      errors.push({
        path: `${schemaId}.contents`,
        code: 'DTDL_NODE_MISSING_CATEGORY',
        message: `Interface "${schemaId}" must have a Property named "kind" (or legacy "category")`,
        suggestion: 'Add { "@type": "Property", "name": "kind", "schema": "string", "comment": "TASK" }',
      })
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
