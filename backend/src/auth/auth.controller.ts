import {
  Controller, Post, Get, Body, Headers, HttpCode, UseGuards, SetMetadata, Req,
} from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { AuthService } from './auth.service'
import { JwtAuthGuard, IS_PUBLIC_KEY } from './guards/jwt-auth.guard'
import { CurrentUser } from './decorators/current-user.decorator'
import type { FastifyRequest } from 'fastify'

class LoginDto {
  email: string
  password: string
}

class RefreshDto {
  refresh_token: string
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @SetMetadata(IS_PUBLIC_KEY, true)
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: FastifyRequest) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.ip
    const userAgent = req.headers['user-agent']
    return this.auth.login(dto.email, dto.password, { ip, userAgent })
  }

  @SetMetadata(IS_PUBLIC_KEY, true)
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token)
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(200)
  logout(@CurrentUser() user: any) {
    return this.auth.logout(user.id)
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return this.auth.me(user.id)
  }
}
