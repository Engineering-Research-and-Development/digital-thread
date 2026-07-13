/**
 * InputBinding shape — declares how a node's input is resolved at runtime.
 *
 * Persisted in the `InputBinding` Prisma model as a `(stateMachineId, nodeId, inputId)`
 * row with `bindingType` + JSON `configJson`. The concrete config shape varies by type.
 */
export type BindingType =
  | 'MANUAL'
  | 'FROM_NODE'
  | 'FROM_DATASOURCE_QUERY'
  | 'FROM_DATASOURCE_EVENT'
  | 'FROM_AAS_SUBMODEL'
  | 'FROM_METADATA'

export interface ManualBindingConfig { hint?: string }

export interface FromNodeBindingConfig { sourceNodeId: string; outputId?: string }

export interface FromDataSourceQueryConfig {
  queryTemplate: string // URL template, SQL with :params, HTTP path etc.
  parameters?: Record<string, string> // Handlebars templates
  onMissing?: 'WAIT_FOR_EVENT' | 'FAIL' | 'USE_DEFAULT'
  default?: string
  timeoutMs?: number
}

export interface FromDataSourceEventConfig {
  topicTemplate: string
  payloadPath?: string       // JSONPath / dotted path to the correlation key
  correlationMetadataKey?: string
  timeoutMs?: number
}

export interface FromAasSubmodelConfig {
  submodelUri: string
  elementPath: string
}

export interface FromMetadataConfig {
  metadataPath: string
  default?: string
}

export type BindingConfig =
  | ManualBindingConfig
  | FromNodeBindingConfig
  | FromDataSourceQueryConfig
  | FromDataSourceEventConfig
  | FromAasSubmodelConfig
  | FromMetadataConfig

export interface BindingRecord {
  id: string
  stateMachineId: string
  nodeId: string
  inputId: string
  bindingType: BindingType
  dataSourceId?: string | null
  configJson: string
}

export interface ResolvedBinding {
  inputId: string
  bindingType: BindingType
  status: 'RESOLVED' | 'WAITING_FOR_EVENT' | 'FAILED' | 'DEFERRED'
  value?: string
  resolvedTarget?: string // query/topic after template expansion
  error?: string
}
