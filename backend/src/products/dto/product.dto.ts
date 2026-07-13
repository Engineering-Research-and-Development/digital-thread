import { IsOptional, IsString, MinLength } from 'class-validator'

/**
 * Product registry payloads. `urn` is the globally-unique
 * project-managed identifier. `ownerPartnerId` is honoured only for SUPERADMIN;
 * for an OWNER the owning partner is forced to the caller's own partner.
 */
export class CreateProductDto {
  @IsString() @MinLength(1) urn!: string
  @IsString() @MinLength(1) name!: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() ownerPartnerId?: string
}

export class UpdateProductDto {
  @IsOptional() @IsString() @MinLength(1) urn?: string
  @IsOptional() @IsString() @MinLength(1) name?: string
  @IsOptional() @IsString() description?: string | null
  @IsOptional() @IsString() ownerPartnerId?: string
}
