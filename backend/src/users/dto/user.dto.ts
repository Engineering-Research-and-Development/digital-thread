import { IsBoolean, IsEmail, IsIn, IsISO31661Alpha2, IsOptional, IsString, MinLength } from 'class-validator'
import { ALL_ROLES, type Role } from '@/auth/roles'

export class CreateUserDto {
  @IsEmail() email!: string
  @IsString() @MinLength(8) password!: string
  @IsOptional() @IsString() fullName?: string
  @IsIn(ALL_ROLES) role!: Role
  @IsOptional() @IsString() partnerId?: string | null
}

export class UpdateUserDto {
  @IsOptional() @IsString() fullName?: string
  @IsOptional() @IsIn(ALL_ROLES) role?: Role
  @IsOptional() @IsString() partnerId?: string | null
  @IsOptional() @IsBoolean() isActive?: boolean
}

export class ChangePasswordDto {
  @IsString() @MinLength(8) newPassword!: string
}

/**
 * Self-service profile update. `partnerCountry` is the mandatory
 * ISO 3166-1 alpha-2 code; `partnerFullName` is the Partner's display name.
 * The short Partner `name` code is not editable here (it is an identifier).
 */
export class UpdateProfileDto {
  @IsOptional() @IsString() fullName?: string
  @IsOptional() @IsString() partnerFullName?: string
  @IsOptional() @IsISO31661Alpha2() partnerCountry?: string
}
