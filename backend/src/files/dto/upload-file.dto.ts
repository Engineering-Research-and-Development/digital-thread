import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

export const UPLOAD_TYPES = ['AUTOMATIC', 'MANUAL', 'INGESTED'] as const
export const PATH_KINDS = ['nodes', 'imports', 'exports', 'raw'] as const
export const CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'PARTNER', 'CONFIDENTIAL', 'RESTRICTED'] as const
/** Raw uploads are capped at PARTNER (no workflow author to justify higher). */
export const RAW_CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'PARTNER'] as const

/**
 * Request body for POST /files/upload. Validated by the global ValidationPipe;
 * `filename` is additionally sanitized in the controller (see files.util.ts).
 */
export class UploadFileDto {
  @IsString() @MinLength(1) @MaxLength(255)
  filename!: string

  @IsOptional() @IsString() @MaxLength(255)
  contentType?: string

  @IsOptional() @IsString()
  base64Data?: string

  @IsString() @MinLength(1)
  iterationId!: string

  @IsString() @MinLength(1)
  nodeId!: string

  /** Which declared output slot of the node this upload fulfils. */
  @IsOptional() @IsString() @MaxLength(64)
  nodeOutputId?: string

  @IsString() @MinLength(1) @MaxLength(255)
  nodeLabel!: string

  @IsIn(UPLOAD_TYPES)
  uploadType!: (typeof UPLOAD_TYPES)[number]

  @IsOptional() @IsString() @MaxLength(128)
  bucket?: string

  @IsOptional() @IsString() @MaxLength(255)
  sourceInfo?: string

  @IsOptional() @IsIn(CLASSIFICATIONS)
  classification?: (typeof CLASSIFICATIONS)[number]

  @IsOptional() @IsIn(PATH_KINDS)
  pathKind?: (typeof PATH_KINDS)[number]
}

/**
 * Request body for POST /files/raw-upload — a RAW file with no
 * iteration/node context. `filename` is sanitized in the controller.
 */
export class RawUploadFileDto {
  @IsString() @MinLength(1) @MaxLength(255)
  filename!: string

  @IsOptional() @IsString() @MaxLength(255)
  contentType?: string

  @IsString() @MinLength(1)
  base64Data!: string

  @IsOptional() @IsIn(RAW_CLASSIFICATIONS)
  classification?: (typeof RAW_CLASSIFICATIONS)[number]

  @IsOptional() @IsString() @MaxLength(128)
  bucket?: string
}
