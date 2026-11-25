import { ValidationResult, ValidationError, ValidationWarning } from './validation.types'
import { semanticIdOf } from '../aas/aas-core.util'
import { isMwdSubmodel, mwdIdValue } from '../aas/mwd-mapper'
import { WF_NS } from '../aas/workflow-def-spec'

const VALID_CATEGORIES = ['TRIGGER', 'AUTOMATIC', 'MANUAL', 'GATEWAY', 'STORAGE']
const VALID_KINDS = ['TRIGGER', 'TASK', 'GATEWAY']

/**
 * The three accepted document shapes:
 *   - 'environment': AAS 3.0 Environment (`assetAdministrationShells` /
 *     `submodels` / `conceptDescriptions`), with a WorkflowDefinition submodel
 *     (the current export) or with Manufacturing Work Description submodels only;
 *   - 'legacy': the pre-Environment Digital Thread envelope, a shell with
 *     `modelType: 'AssetAdministrationShell'` and inline submodels in `submodelInline`;
 *   - 'unknown': anything else.
 */
export type AasDocumentShape = 'environment' | 'legacy' | 'unknown'

export function detectAasShape(doc: any): AasDocumentShape {
  if (!doc || typeof doc !== 'object') return 'unknown'
  if (doc.modelType === 'AssetAdministrationShell') return 'legacy'
  if (Array.isArray(doc.assetAdministrationShells)) return 'environment'
  if (Array.isArray(doc.submodels) && doc.submodels.some((sm: any) => sm?.modelType === 'Submodel')) return 'environment'
  return 'unknown'
}

/** The WorkflowDefinition submodel among Environment submodels (by idShort or semanticId). */
export function findWorkflowSubmodel(submodels: unknown): any | undefined {
  if (!Array.isArray(submodels)) return undefined
  return submodels.find((sm: any) => sm && (sm.idShort === 'WorkflowDefinition' || semanticIdOf(sm) === WF_NS))
}

export function validateAas(input: unknown): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  if (typeof input !== 'object' || !input) {
    errors.push({ path: '', code: 'AAS_INVALID_ROOT', message: 'Input must be a JSON object', suggestion: 'Provide a valid AAS JSON document' })
    return { valid: false, errors, warnings }
  }

  const doc = input as any
  const shape = detectAasShape(doc)

  if (shape === 'environment') {
    validateEnvironment(doc, errors, warnings)
  } else if (shape === 'legacy') {
    validateLegacyShell(doc, errors, warnings)
  } else {
    errors.push({
      path: 'modelType',
      code: 'AAS_INVALID_ROOT',
      message: `Expected an AAS 3.0 Environment (assetAdministrationShells, submodels) or a shell with modelType "AssetAdministrationShell", got "${doc.modelType}"`,
      suggestion: 'Provide an AAS Environment with a WorkflowDefinition or Manufacturing Work Description submodel',
    })
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ─── AAS 3.0 Environment ─────────────────────────────────────────────────────

function validateEnvironment(doc: any, errors: ValidationError[], warnings: ValidationWarning[]) {
  const shells: any[] = Array.isArray(doc.assetAdministrationShells) ? doc.assetAdministrationShells : []
  shells.forEach((shell, i) => {
    if (!shell?.assetInformation?.globalAssetId) {
      errors.push({
        path: `assetAdministrationShells[${i}].assetInformation.globalAssetId`,
        code: 'AAS_MISSING_GLOBAL_ASSET_ID',
        message: 'assetInformation.globalAssetId is required',
        suggestion: 'Add assetInformation: { assetKind: "Type", globalAssetId: "urn:..." }',
      })
    }
  })

  const submodels: any[] = Array.isArray(doc.submodels) ? doc.submodels : []
  if (submodels.length === 0) {
    errors.push({
      path: 'submodels',
      code: 'AAS_NO_SUBMODELS',
      message: 'At least one submodel is required',
      suggestion: 'Add the WorkflowDefinition submodel (and one Manufacturing Work Description per task) to "submodels"',
    })
    return
  }

  const wfSm = findWorkflowSubmodel(submodels)
  const mwdIdx = submodels.map((sm, i) => (isMwdSubmodel(sm) ? i : -1)).filter((i) => i >= 0)

  if (wfSm) {
    validateWorkflowSubmodel(wfSm, errors, warnings, `submodels[${submodels.indexOf(wfSm)}]`)
  } else if (mwdIdx.length > 0) {
    warnings.push({
      path: 'submodels',
      code: 'AAS_MWD_ONLY',
      message: `No WorkflowDefinition submodel: ${mwdIdx.length} Manufacturing Work Description submodel(s) will be imported as unconnected TASK nodes`,
    })
  } else {
    errors.push({
      path: 'submodels',
      code: 'AAS_MISSING_WORKFLOW_SUBMODEL',
      message: 'A Submodel with idShort "WorkflowDefinition" (or at least one Manufacturing Work Description submodel) is required',
      suggestion: 'Add a Submodel with idShort: "WorkflowDefinition" containing node definitions',
    })
  }

  for (const i of mwdIdx) {
    if (!mwdIdValue(submodels[i])) {
      errors.push({
        path: `submodels[${i}].submodelElements[ID]`,
        code: 'AAS_MWD_INVALID',
        message: `Manufacturing Work Description "${submodels[i].idShort ?? submodels[i].id ?? i}" has no "ID" property (cardinality One)`,
        suggestion: 'Add a Property with idShort "ID" carrying the work description identifier',
      })
    }
  }
}

// ─── Legacy Digital Thread envelope (modelType + submodelInline) ────────────

function validateLegacyShell(doc: any, errors: ValidationError[], warnings: ValidationWarning[]) {
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
    const wfSm = doc.submodelInline.find((sm: any) => sm?.idShort === 'WorkflowDefinition')
    if (!wfSm) {
      errors.push({
        path: 'submodelInline',
        code: 'AAS_MISSING_WORKFLOW_SUBMODEL',
        message: 'A Submodel with idShort "WorkflowDefinition" is required',
        suggestion: 'Add a Submodel with idShort: "WorkflowDefinition" containing node definitions',
      })
    } else {
      validateWorkflowSubmodel(wfSm, errors, warnings, 'submodelInline[WorkflowDefinition]')
    }
  }
}

// ─── WorkflowDefinition content (shared by both shapes) ──────────────────────

function validateWorkflowSubmodel(sm: any, errors: ValidationError[], warnings: ValidationWarning[], basePath: string) {
  const elements = sm.submodelElements ?? []
  if (!Array.isArray(elements) || elements.length === 0) {
    errors.push({
      path: `${basePath}.submodelElements`,
      code: 'AAS_EMPTY_WORKFLOW',
      message: 'WorkflowDefinition must contain at least one SubmodelElementCollection (node)',
      suggestion: 'Add at least one node definition as a SubmodelElementCollection',
    })
    return
  }

  let hasStartNode = false

  elements.forEach((smc: any, i: number) => {
    const base = `${basePath}.submodelElements[${i}]`
    if (smc.modelType !== 'SubmodelElementCollection') return
    // Visual node groups container — not a node.
    if (smc.idShort === 'groups') return

    const props: any = {}
    ;(smc.value ?? []).forEach((p: any) => {
      if (p.idShort) props[p.idShort] = p.value
    })

    // Canonical shape (what the exporter emits): `kind` + `name`.
    // Legacy shape: `nodeCategory` + `nodeTypeId` + `label`.
    if (props.kind) {
      if (!VALID_KINDS.includes(props.kind)) {
        errors.push({ path: `${base}.kind`, code: 'AAS_INVALID_KIND', message: `Invalid kind "${props.kind}"`, suggestion: `Use one of: ${VALID_KINDS.join(', ')}` })
      } else if (props.kind === 'TRIGGER' || props.kind === 'TASK') {
        hasStartNode = true
      }
    } else {
      if (!props.nodeCategory) {
        errors.push({ path: `${base}.kind`, code: 'AAS_NODE_MISSING_FIELDS', message: 'Property "kind" (or legacy "nodeCategory") is required in each node SMC', suggestion: `Add a Property with idShort "kind" (${VALID_KINDS.join(', ')})` })
      } else if (!VALID_CATEGORIES.includes(props.nodeCategory)) {
        errors.push({ path: `${base}.nodeCategory`, code: 'AAS_INVALID_CATEGORY', message: `Invalid nodeCategory "${props.nodeCategory}"`, suggestion: `Use one of: ${VALID_CATEGORIES.join(', ')}` })
      } else if (props.nodeCategory === 'TRIGGER' || props.nodeCategory === 'MANUAL') {
        hasStartNode = true
      }
      if (!props.nodeTypeId) {
        errors.push({ path: `${base}.nodeTypeId`, code: 'AAS_NODE_MISSING_FIELDS', message: 'Property "nodeTypeId" is required', suggestion: 'Add a Property with idShort "nodeTypeId"' })
      }
    }

    if (!props.name && !props.label) {
      errors.push({ path: `${base}.name`, code: 'AAS_NODE_MISSING_FIELDS', message: 'Property "name" (or legacy "label") is required', suggestion: 'Add a Property with idShort "name"' })
    }
  })

  if (!hasStartNode) {
    warnings.push({ path: basePath, code: 'AAS_NO_START_NODE', message: 'No TRIGGER or MANUAL node found — workflow may have no entry point' })
  }
}
