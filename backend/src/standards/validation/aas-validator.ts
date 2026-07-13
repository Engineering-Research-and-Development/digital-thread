import { ValidationResult, ValidationError, ValidationWarning } from './validation.types'

const VALID_CATEGORIES = ['TRIGGER', 'AUTOMATIC', 'MANUAL', 'GATEWAY', 'STORAGE']

export function validateAas(input: unknown): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  if (typeof input !== 'object' || !input) {
    errors.push({ path: '', code: 'AAS_INVALID_ROOT', message: 'Input must be a JSON object', suggestion: 'Provide a valid AAS JSON document' })
    return { valid: false, errors, warnings }
  }

  const doc = input as any

  // Root modelType
  if (doc.modelType !== 'AssetAdministrationShell') {
    errors.push({
      path: 'modelType',
      code: 'AAS_INVALID_ROOT',
      message: `Expected modelType "AssetAdministrationShell", got "${doc.modelType}"`,
      suggestion: 'Set modelType to "AssetAdministrationShell" at the root',
    })
  }

  // globalAssetId
  if (!doc.assetInformation?.globalAssetId) {
    errors.push({
      path: 'assetInformation.globalAssetId',
      code: 'AAS_MISSING_GLOBAL_ASSET_ID',
      message: 'assetInformation.globalAssetId is required',
      suggestion: 'Add assetInformation: { assetKind: "Type", globalAssetId: "urn:..." }',
    })
  }

  // submodels array
  if (!Array.isArray(doc.submodels) || doc.submodels.length === 0) {
    errors.push({
      path: 'submodels',
      code: 'AAS_NO_SUBMODELS',
      message: 'At least one submodel reference is required',
      suggestion: 'Add a reference to the WorkflowDefinition submodel',
    })
  }

  // WorkflowDefinition submodel — look in a "submodelInline" array if present
  if (Array.isArray(doc.submodelInline)) {
    const wfSm = doc.submodelInline.find((sm: any) => sm.idShort === 'WorkflowDefinition')
    if (!wfSm) {
      errors.push({
        path: 'submodelInline',
        code: 'AAS_MISSING_WORKFLOW_SUBMODEL',
        message: 'A Submodel with idShort "WorkflowDefinition" is required',
        suggestion: 'Add a Submodel with idShort: "WorkflowDefinition" containing node definitions',
      })
    } else {
      validateWorkflowSubmodel(wfSm, errors, warnings)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}

function validateWorkflowSubmodel(sm: any, errors: ValidationError[], warnings: ValidationWarning[]) {
  const elements = sm.submodelElements ?? []
  if (!Array.isArray(elements) || elements.length === 0) {
    errors.push({
      path: 'submodelInline[WorkflowDefinition].submodelElements',
      code: 'AAS_EMPTY_WORKFLOW',
      message: 'WorkflowDefinition must contain at least one SubmodelElementCollection (node)',
      suggestion: 'Add at least one node definition as a SubmodelElementCollection',
    })
    return
  }

  let hasStartNode = false

  elements.forEach((smc: any, i: number) => {
    const base = `submodelInline[WorkflowDefinition].submodelElements[${i}]`
    if (smc.modelType !== 'SubmodelElementCollection') return

    const props: any = {}
    ;(smc.value ?? []).forEach((p: any) => {
      if (p.idShort) props[p.idShort] = p.value
    })

    if (!props.nodeCategory) {
      errors.push({ path: `${base}.nodeCategory`, code: 'AAS_NODE_MISSING_FIELDS', message: 'Property "nodeCategory" is required in each node SMC', suggestion: 'Add a Property with idShort "nodeCategory"' })
    } else if (!VALID_CATEGORIES.includes(props.nodeCategory)) {
      errors.push({ path: `${base}.nodeCategory`, code: 'AAS_INVALID_CATEGORY', message: `Invalid nodeCategory "${props.nodeCategory}"`, suggestion: `Use one of: ${VALID_CATEGORIES.join(', ')}` })
    } else if (props.nodeCategory === 'TRIGGER' || props.nodeCategory === 'MANUAL') {
      hasStartNode = true
    }

    if (!props.nodeTypeId) {
      errors.push({ path: `${base}.nodeTypeId`, code: 'AAS_NODE_MISSING_FIELDS', message: 'Property "nodeTypeId" is required', suggestion: 'Add a Property with idShort "nodeTypeId"' })
    }

    if (!props.label) {
      errors.push({ path: `${base}.label`, code: 'AAS_NODE_MISSING_FIELDS', message: 'Property "label" is required', suggestion: 'Add a Property with idShort "label"' })
    }
  })

  if (!hasStartNode) {
    warnings.push({ path: 'submodelInline[WorkflowDefinition]', code: 'AAS_NO_START_NODE', message: 'No TRIGGER or MANUAL node found — workflow may have no entry point' })
  }
}
