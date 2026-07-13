import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE, type Role } from '@/auth/roles'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { UsersService } from './users.service'
import { ChangePasswordDto, CreateUserDto, UpdateProfileDto, UpdateUserDto } from './dto/user.dto'
import { ApiKeyService } from '@/api-key/api-key.service'
import { API_KEY_HEADER } from '@/api-key/api-key.guard'

/** Connection hints surfaced alongside the API key so the Profile page can
 *  show the user exactly how to call the external API. Paths are relative —
 *  the frontend prepends window.location.origin. */
const EXT_API_HINTS = {
  headerName: 'X-API-Key',
  basePath: '/api/v1/ext',
  docsPath: '/docs/ext',
}

@ApiTags('users')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private svc: UsersService,
    private apiKeys: ApiKeyService,
  ) {}

  // ── Self-service profile (any authenticated user) ──────────────────────────
  // Declared BEFORE the ':id' routes so 'me' is not captured as an id param.

  @Get('me')
  me(@CurrentUser() actor: { id: string }) {
    return this.svc.findOne(actor.id)
  }

  @Patch('me/profile')
  updateProfile(@CurrentUser() actor: { id: string }, @Body() body: UpdateProfileDto) {
    return this.svc.updateProfile(actor.id, body)
  }

  // ── External API key management (OPERATOR/OWNER only) ──────────────────────

  /** Metadata about the caller's external API key (never the secret) + how to use it. */
  @Get('me/api-key')
  @Roles(ROLE.OPERATOR, ROLE.OWNER)
  async getApiKey(@CurrentUser() actor: { id: string }) {
    const meta = await this.apiKeys.getMeta(actor.id)
    return { ...meta, ...EXT_API_HINTS }
  }

  /** (Re)generate the caller's API key. Returns the plaintext token ONCE. */
  @Post('me/api-key')
  @Roles(ROLE.OPERATOR, ROLE.OWNER)
  async generateApiKey(@CurrentUser() actor: { id: string }) {
    const { token, prefix } = await this.apiKeys.issue(actor.id)
    return { token, prefix, ...EXT_API_HINTS }
  }

  /** Invalidate the caller's current API key. */
  @Delete('me/api-key')
  @Roles(ROLE.OPERATOR, ROLE.OWNER)
  @HttpCode(204)
  async revokeApiKey(@CurrentUser() actor: { id: string }) {
    await this.apiKeys.revoke(actor.id)
  }

  @Get()
  @Roles(ROLE.SUPERADMIN)
  findAll(@Query('partnerId') partnerId?: string, @Query('role') role?: Role) {
    return this.svc.findAll({ partnerId, role })
  }

  @Get(':id')
  @Roles(ROLE.SUPERADMIN)
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id)
  }

  @Post()
  @Roles(ROLE.SUPERADMIN)
  create(@Body() body: CreateUserDto) {
    return this.svc.create(body)
  }

  @Patch(':id')
  @Roles(ROLE.SUPERADMIN)
  update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.svc.update(id, body)
  }

  @Patch(':id/password')
  @HttpCode(200)
  changePassword(
    @Param('id') id: string,
    @Body() body: ChangePasswordDto,
    @CurrentUser() actor: any,
  ) {
    // Self-service password change OR SUPERADMIN reset
    if (actor.role !== ROLE.SUPERADMIN && actor.id !== id) {
      throw new Error('Forbidden')
    }
    return this.svc.changePassword(id, body.newPassword)
  }

  @Delete(':id')
  @Roles(ROLE.SUPERADMIN)
  @HttpCode(204)
  remove(@Param('id') id: string) {
    return this.svc.remove(id)
  }
}
