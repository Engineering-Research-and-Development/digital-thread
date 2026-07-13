import {
  Controller, Get, Post, Param, Body, Query, Res, HttpStatus,
  SetMetadata, UseGuards,
} from '@nestjs/common'
import { ApiOperation, ApiQuery, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { FastifyReply } from 'fastify'
import { IS_PUBLIC_KEY } from '@/auth/guards/jwt-auth.guard'
import { PartnerScopeGuard } from '@/auth/guards/partner-scope.guard'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { type Role } from '@/auth/roles'
import { FilesService } from '@/files/files.service'
import { ApiKeyGuard } from '@/api-key/api-key.guard'
import { ExtApiService } from './ext-api.service'
import { ExtUploadFileDto } from './dto/ext-api.dto'

interface ExtUser {
  id: string
  email: string
  role: Role
  partnerId?: string | null
}

/**
 * External REST API — a dedicated, API-key-authenticated surface
 * (`/api/v1/ext`) for OPERATOR/OWNER systems to drive their iterations.
 *
 *  - `@SetMetadata(IS_PUBLIC_KEY, true)` makes the global JwtAuthGuard step
 *    aside (no frontend JWT); `ApiKeyGuard` authenticates via `X-API-Key` and
 *    attaches `request.user` in the JWT shape.
 *  - Routes with `:id`/`:nodeId` add `PartnerScopeGuard` — the SAME row-scope
 *    enforcement the UI uses. List/me endpoints scope in the service layer.
 *
 * Documented in the dedicated Swagger doc at `/docs/ext`.
 */
@ApiTags('external')
@ApiSecurity('apiKey')
@SetMetadata(IS_PUBLIC_KEY, true)
@UseGuards(ApiKeyGuard)
@Controller('ext')
export class ExtApiController {
  constructor(
    private ext: ExtApiService,
    private files: FilesService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Identity of the API key owner (role + partner)' })
  me(@CurrentUser() user: ExtUser) {
    return this.ext.me(user)
  }

  @Get('iterations')
  @ApiOperation({ summary: 'List iterations you can act on (partner-scoped)' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status', enum: ['DRAFT', 'RUNNING', 'COMPLETED', 'FAILED'] })
  @ApiQuery({ name: 'productId', required: false, description: 'Filter by linked Product id' })
  @ApiQuery({ name: 'componentRef', required: false, description: "Filter by the iteration's component reference (URN, exact match)" })
  @ApiQuery({ name: 'page', required: false, description: '1-based page number (default 1)', schema: { type: 'integer', minimum: 1, default: 1 } })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (1–200, default 50)', schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 } })
  listIterations(
    @CurrentUser() user: ExtUser,
    @Query('status') status?: string,
    @Query('productId') productId?: string,
    @Query('componentRef') componentRef?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ext.listIterations(user, {
      status,
      productId,
      componentRef,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    })
  }

  @Get('iterations/:id')
  @UseGuards(PartnerScopeGuard)
  @ApiOperation({ summary: 'Get a single iteration by id (frozen workflow + node states)' })
  getIteration(@Param('id') id: string) {
    return this.ext.getIteration(id)
  }

  @Get('iterations/:id/nodes')
  @UseGuards(PartnerScopeGuard)
  @ApiOperation({ summary: "Nodes of an iteration with their input/output contract and an 'actionable' flag" })
  nodes(@Param('id') id: string, @CurrentUser() user: ExtUser) {
    return this.ext.nodes(id, user)
  }

  @Get('iterations/:id/timeline')
  @UseGuards(PartnerScopeGuard)
  @ApiOperation({ summary: 'Timeline (audit trail) of an iteration' })
  timeline(@Param('id') id: string) {
    return this.ext.timeline(id)
  }

  @Get('iterations/:id/files')
  @UseGuards(PartnerScopeGuard)
  @ApiOperation({ summary: 'List files of an iteration you are allowed to read' })
  files_(
    @Param('id') id: string,
    @CurrentUser() user: ExtUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ext.listFiles(id, user, { page: page ? +page : undefined, limit: limit ? +limit : undefined })
  }

  @Get('files/:fileId')
  @ApiOperation({ summary: 'File metadata (if you are allowed to read it)' })
  fileMeta(@Param('fileId') fileId: string, @CurrentUser() user: ExtUser) {
    return this.ext.fileMeta(fileId, user)
  }

  @Get('files/:fileId/content')
  @ApiOperation({ summary: 'Download file content (permission-gated, audited)' })
  async fileContent(
    @Param('fileId') fileId: string,
    @CurrentUser() user: ExtUser,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.files.findOne(fileId)
    await this.files.assertReadable(file, { id: user.id, role: user.role, partnerId: user.partnerId ?? undefined })
    const { stream, contentType, filename, contentHash } = await this.files.getDownloadStream(fileId)
    await this.files.recordAccess({ userId: user.id, resourceId: fileId, action: 'DOWNLOAD', classification: file.classification })
    stream.on('error', (err: unknown) => {
      if (!reply.sent) {
        reply.status(HttpStatus.NOT_FOUND).send({ statusCode: 404, message: 'File content is not available' })
      } else {
        try { reply.raw.destroy(err instanceof Error ? err : undefined) } catch { /* noop */ }
      }
    })
    reply
      .status(HttpStatus.OK)
      .header('Content-Type', contentType)
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .header('X-Content-SHA256', contentHash ?? '')
      .send(stream)
  }

  @Post('iterations/:id/nodes/:nodeId/files')
  @UseGuards(PartnerScopeGuard)
  @ApiOperation({ summary: 'Upload a file to a node output your partner is responsible for and the iteration is awaiting' })
  upload(
    @Param('id') id: string,
    @Param('nodeId') nodeId: string,
    @Body() body: ExtUploadFileDto,
    @CurrentUser() user: ExtUser,
  ) {
    return this.ext.upload(user, id, nodeId, body)
  }

  @Post('iterations/:id/nodes/:nodeId/claim')
  @UseGuards(PartnerScopeGuard)
  @ApiOperation({ summary: 'Claim a PENDING node (→ RUNNING)' })
  claim(@Param('id') id: string, @Param('nodeId') nodeId: string, @CurrentUser() user: ExtUser) {
    return this.ext.claim(user, id, nodeId)
  }

  @Post('iterations/:id/nodes/:nodeId/complete')
  @UseGuards(PartnerScopeGuard)
  @ApiOperation({ summary: 'Complete a RUNNING node (advances the workflow)' })
  complete(@Param('id') id: string, @Param('nodeId') nodeId: string) {
    return this.ext.complete(id, nodeId)
  }
}
