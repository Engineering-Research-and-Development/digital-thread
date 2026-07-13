import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

const CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'PARTNER', 'CONFIDENTIAL', 'RESTRICTED'] as const

/** Body for POST /ext/iterations/:id/nodes/:nodeId/files — upload to a node output. */
export class ExtUploadFileDto {
  @ApiPropertyOptional({ description: "Target output slot id; defaults to the node's 'default' output" })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  outputId?: string

  @ApiProperty({ description: 'File name (with extension)' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string

  @ApiPropertyOptional({ description: 'MIME type; defaults to application/octet-stream' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contentType?: string

  @ApiProperty({ description: 'File content, Base64-encoded' })
  @IsString()
  @MinLength(1)
  contentBase64!: string

  @ApiPropertyOptional({ enum: CLASSIFICATIONS, description: 'Suggested classification (the server may override from the node-def default)' })
  @IsOptional()
  @IsIn(CLASSIFICATIONS)
  classification?: 'PUBLIC' | 'INTERNAL' | 'PARTNER' | 'CONFIDENTIAL' | 'RESTRICTED'
}
