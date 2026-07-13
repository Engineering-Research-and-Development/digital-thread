import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator'

const CHANNELS = ['WEBHOOK', 'EMAIL'] as const
const AUTH_TYPES = ['NONE', 'API_KEY', 'OAUTH2'] as const

export class CreateSubscriptionDto {
  @ApiProperty({ enum: CHANNELS })
  @IsIn(CHANNELS)
  kind!: 'WEBHOOK' | 'EMAIL'

  @ApiProperty({ type: [String], description: 'Semantic event keys, or ["*"] for all relevant events' })
  @IsArray()
  @IsString({ each: true })
  eventTypes!: string[]

  @ApiProperty({ description: 'Webhook URL or email address' })
  @IsString()
  target!: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string

  @ApiPropertyOptional({ description: 'Optional HMAC signing secret (webhook)' })
  @IsOptional()
  @IsString()
  secret?: string

  @ApiPropertyOptional({ enum: AUTH_TYPES })
  @IsOptional()
  @IsIn(AUTH_TYPES)
  authType?: 'NONE' | 'API_KEY' | 'OAUTH2'

  @ApiPropertyOptional({
    description:
      'Auth config. API_KEY: { headerName, headerValue }. OAUTH2: { tokenUrl, clientId, clientSecret, scope?, audience? }.',
  })
  @IsOptional()
  @IsObject()
  authConfig?: Record<string, any>
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional({ enum: CHANNELS })
  @IsOptional()
  @IsIn(CHANNELS)
  kind?: 'WEBHOOK' | 'EMAIL'

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  eventTypes?: string[]

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  target?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  secret?: string

  @ApiPropertyOptional({ enum: AUTH_TYPES })
  @IsOptional()
  @IsIn(AUTH_TYPES)
  authType?: 'NONE' | 'API_KEY' | 'OAUTH2'

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  authConfig?: Record<string, any>

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean
}

export class SmtpConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  host?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  port?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  secure?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string

  @ApiPropertyOptional({ description: 'Omit to keep the existing password' })
  @IsOptional()
  @IsString()
  password?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromAddress?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromName?: string
}

export class TestEmailDto {
  @ApiProperty()
  @IsString()
  to!: string
}
