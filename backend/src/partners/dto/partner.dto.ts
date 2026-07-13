import { IsISO31661Alpha2, IsOptional, IsString, MinLength } from 'class-validator'

/**
 * Partner create/update payloads. `country` is the MANDATORY ISO 3166-1
 * alpha-2 code — enforced here at the API boundary even though the
 * DB carries a sentinel default for migration backfill.
 */
export class CreatePartnerDto {
  @IsString() @MinLength(1) name!: string
  @IsString() @MinLength(1) fullName!: string
  @IsISO31661Alpha2() country!: string
  @IsString() @MinLength(1) color!: string
  @IsOptional() @IsString() role?: string
}

export class UpdatePartnerDto {
  @IsOptional() @IsString() @MinLength(1) name?: string
  @IsOptional() @IsString() @MinLength(1) fullName?: string
  @IsOptional() @IsISO31661Alpha2() country?: string
  @IsOptional() @IsString() @MinLength(1) color?: string
  @IsOptional() @IsString() role?: string
}
