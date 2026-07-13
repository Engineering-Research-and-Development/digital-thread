export const NodeCategory = {
  TRIGGER: 'TRIGGER',
  AUTOMATIC: 'AUTOMATIC',
  MANUAL: 'MANUAL',
  GATEWAY: 'GATEWAY',
  STORAGE: 'STORAGE',
} as const
export type NodeCategory = (typeof NodeCategory)[keyof typeof NodeCategory]

export const NodeStatus = {
  IDLE: 'IDLE',
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  ERROR: 'ERROR',
  SKIPPED: 'SKIPPED',
} as const
export type NodeStatus = (typeof NodeStatus)[keyof typeof NodeStatus]

export const IterationStatus = {
  DRAFT: 'DRAFT',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const
export type IterationStatus = (typeof IterationStatus)[keyof typeof IterationStatus]

export const UploadType = {
  AUTOMATIC: 'AUTOMATIC',
  MANUAL: 'MANUAL',
} as const
export type UploadType = (typeof UploadType)[keyof typeof UploadType]

export const DataSourceType = {
  API: 'API',
  DATABASE: 'DATABASE',
  FILE_SYSTEM: 'FILE_SYSTEM',
  SENSOR: 'SENSOR',
} as const
export type DataSourceType = (typeof DataSourceType)[keyof typeof DataSourceType]

export const DataSourceProtocol = {
  HTTP: 'HTTP',
  MQTT: 'MQTT',
  KAFKA: 'KAFKA',
  OPC_UA: 'OPC_UA',
} as const
export type DataSourceProtocol = (typeof DataSourceProtocol)[keyof typeof DataSourceProtocol]

export const InputSourceType = {
  PREDECESSOR: 'PREDECESSOR',
  MANUAL: 'MANUAL',
  DATASOURCE: 'DATASOURCE',
} as const
export type InputSourceType = (typeof InputSourceType)[keyof typeof InputSourceType]

// Generic node model: kind replaces NodeCategory as the runtime
// discriminator. AUTOMATIC and MANUAL collapse into TASK — the difference is
// expressed by whether responsiblePartnerId is set, not by node type.
export const NodeKind = {
  TRIGGER: 'TRIGGER',
  TASK: 'TASK',
  GATEWAY: 'GATEWAY',
  // STORAGE removed. Legacy STORAGE nodes normalise to TASK.
} as const
export type NodeKind = (typeof NodeKind)[keyof typeof NodeKind]

export const Cardinality = {
  ONE: 'ONE',
  MANY: 'MANY',
} as const
export type Cardinality = (typeof Cardinality)[keyof typeof Cardinality]

export const GatewayLogic = {
  AND: 'AND',
  OR: 'OR',
  XOR: 'XOR',
} as const
export type GatewayLogic = (typeof GatewayLogic)[keyof typeof GatewayLogic]

/**
 * File data classification (governance §3.1). Matches `FileRecord.classification`
 * on the backend. Order matters: each step up is strictly more restrictive.
 */
export const Classification = {
  PUBLIC: 'PUBLIC',
  INTERNAL: 'INTERNAL',
  PARTNER: 'PARTNER',
  CONFIDENTIAL: 'CONFIDENTIAL',
  RESTRICTED: 'RESTRICTED',
} as const
export type Classification = (typeof Classification)[keyof typeof Classification]

export const CLASSIFICATION_LIST: Classification[] = [
  Classification.PUBLIC,
  Classification.INTERNAL,
  Classification.PARTNER,
  Classification.CONFIDENTIAL,
  Classification.RESTRICTED,
]
