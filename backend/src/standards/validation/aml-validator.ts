import { ValidationResult, ValidationError, ValidationWarning } from './validation.types'

const VALID_ROLES = ['TRIGGER', 'AUTOMATIC', 'MANUAL', 'GATEWAY', 'STORAGE']

export function validateAml(parsed: any): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  if (!parsed || typeof parsed !== 'object') {
    errors.push({ path: '', code: 'AML_INVALID_ROOT', message: 'Input must be a parsed CAEX XML object', suggestion: 'Provide a valid AutomationML .aml file' })
    return { valid: false, errors, warnings }
  }

  // Root must be CAEXFile
  const caex = parsed.CAEXFile
  if (!caex) {
    errors.push({ path: 'CAEXFile', code: 'AML_INVALID_ROOT', message: 'Root element must be CAEXFile', suggestion: 'Ensure the XML root element is <CAEXFile SchemaVersion="3.0">' })
    return { valid: false, errors, warnings }
  }

  const schemaVersion = caex['@_SchemaVersion'] ?? caex.SchemaVersion
  if (!schemaVersion) {
    warnings.push({ path: 'CAEXFile.SchemaVersion', code: 'AML_MISSING_SCHEMA_VERSION', message: 'SchemaVersion attribute missing — expected "3.0"' })
  }

  // Must have SystemUnitClassLib or InstanceHierarchy
  const hasLib = caex.SystemUnitClassLib || caex.InstanceHierarchy
  if (!hasLib) {
    errors.push({ path: 'CAEXFile', code: 'AML_EMPTY_DOCUMENT', message: 'Document must contain SystemUnitClassLib or InstanceHierarchy', suggestion: 'Add at least one <SystemUnitClassLib> with workflow node definitions' })
    return { valid: false, errors, warnings }
  }

  // Validate SystemUnitClassLib
  const libs = Array.isArray(caex.SystemUnitClassLib) ? caex.SystemUnitClassLib : (caex.SystemUnitClassLib ? [caex.SystemUnitClassLib] : [])

  for (const lib of libs) {
    const classes = lib.SystemUnitClass ? (Array.isArray(lib.SystemUnitClass) ? lib.SystemUnitClass : [lib.SystemUnitClass]) : []

    for (const suc of classes) {
      const name = suc['@_Name'] ?? suc.Name ?? '(unknown)'
      const base = `SystemUnitClassLib[${lib['@_Name']}].SystemUnitClass[${name}]`

      // Must have RoleRequirements
      if (!suc.RoleRequirements) {
        errors.push({ path: `${base}.RoleRequirements`, code: 'AML_MISSING_ROLE', message: `SystemUnitClass "${name}" is missing RoleRequirements`, suggestion: 'Add <RoleRequirements RefBaseRoleClassPath="DigitalThreadRoles/MANUAL"/>' })
      } else {
        const refPath: string = suc.RoleRequirements['@_RefBaseRoleClassPath'] ?? ''
        const roleValue = refPath.split('/').pop() ?? ''
        if (!VALID_ROLES.includes(roleValue)) {
          errors.push({ path: `${base}.RoleRequirements`, code: 'AML_INVALID_ROLE', message: `Invalid role "${roleValue}" in "${refPath}"`, suggestion: `Use one of: ${VALID_ROLES.map((r) => `DigitalThreadRoles/${r}`).join(', ')}` })
        }
      }

      // Must have nodeTypeId attribute or class name is used as nodeTypeId
      const attrs = suc.Attribute ? (Array.isArray(suc.Attribute) ? suc.Attribute : [suc.Attribute]) : []
      const nodeTypeAttr = attrs.find((a: any) => (a['@_Name'] ?? a.Name) === 'nodeTypeId')
      if (!nodeTypeAttr && !name) {
        errors.push({ path: `${base}`, code: 'AML_MISSING_NODE_TYPE', message: 'SystemUnitClass must have a nodeTypeId Attribute or a meaningful Name', suggestion: 'Add <Attribute Name="nodeTypeId" Value="MY_NODE_TYPE"/>' })
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
