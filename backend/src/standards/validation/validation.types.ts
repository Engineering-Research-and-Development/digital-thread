export interface ValidationError {
  path: string
  code: string
  message: string
  suggestion?: string
}

export interface ValidationWarning {
  path: string
  code: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}
