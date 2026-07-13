import {
  Controller, Get, Post, Delete, Param, Query, Body,
  HttpCode, UseGuards, Res, HttpStatus, BadRequestException, PayloadTooLargeException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { FilesService } from './files.service'
import { FileAccessRequestsService } from './file-access-requests.service'
import { UploadFileDto, RawUploadFileDto } from './dto/upload-file.dto'
import { sanitizeFilename, assertAllowedExtension, assertAcceptedExtension } from './files.util'
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard'
import { RolesGuard } from '@/auth/guards/roles.guard'
import { Roles } from '@/auth/decorators/roles.decorator'
import { ROLE, type Role } from '@/auth/roles'
import { CurrentUser } from '@/auth/decorators/current-user.decorator'
import { FastifyReply } from 'fastify'

@ApiTags('files')
@ApiBearerAuth('jwt')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('files')
export class FilesController {
  constructor(
    private svc: FilesService,
    private accessRequests: FileAccessRequestsService,
    private config: ConfigService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: { id: string; role: Role; partnerId?: string },
    @Query('iterationId') iterationId?: string,
    @Query('nodeId') nodeId?: string,
    @Query('scope') scope?: 'RAW' | 'NODE' | 'ALL',
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.svc.findAll({
      iterationId,
      nodeId,
      scope,
      page: page ? +page : 1,
      limit: limit ? +limit : 50,
      requester: user,
    })
  }

  /** Partner-side helper: list my own (pending / decided) access requests. */
  @Get('access-requests/mine')
  myAccessRequests(@CurrentUser() user: { id: string }) {
    return this.accessRequests.listForRequester(user.id)
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const file = await this.svc.findOne(id)
    await this.svc.assertReadable(file, user)
    const refs = await this.svc.collectFileReferences([id])
    return { ...file, references: refs.get(id) ?? [] }
  }

  /**
   * All (iteration × node) references that mention this file — origin OUTPUT
   * plus any INPUT usages (forked iterations, downstream re-wires). Read-only
   * cross-iteration view used by the File Explorer.
   */
  @Get(':id/references')
  async references(@Param('id') id: string, @CurrentUser() user: any) {
    const file = await this.svc.findOne(id)
    await this.svc.assertReadable(file, user)
    const refs = await this.svc.collectFileReferences([id])
    return { fileId: id, references: refs.get(id) ?? [] }
  }

  @Get(':id/versions')
  async listVersions(@Param('id') id: string, @CurrentUser() user: any) {
    const f = await this.svc.findOne(id)
    await this.svc.assertReadable(f, user)
    return this.svc.listVersions(id)
  }

  @Get(':id/download')
  async download(
    @Param('id') id: string,
    @Query('version') version: string | undefined,
    @CurrentUser() user: any,
    @Res() reply: FastifyReply,
  ) {
    const file = await this.svc.findOne(id)
    await this.svc.assertReadable(file, user)
    const { stream, contentType, filename, contentHash } = await this.svc.getDownloadStream(
      id,
      version !== undefined ? +version : undefined,
    )
    await this.svc.recordAccess({ userId: user.id, resourceId: id, action: 'DOWNLOAD', classification: file.classification })
    // Defence-in-depth: a storage stream can still error AFTER headers are sent
    // (file removed mid-read, disk/permission error). Attaching an 'error'
    // listener guarantees the event is handled — an unhandled stream 'error'
    // would otherwise throw and CRASH the whole process. We never re-throw here.
    stream.on('error', (err: unknown) => {
      if (!reply.sent) {
        reply
          .status(HttpStatus.NOT_FOUND)
          .send({ statusCode: 404, message: 'File content is not available' })
      } else {
        // Headers already flushed — just tear down the socket cleanly.
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

  @Post('upload')
  async upload(
    @Body() body: UploadFileDto,
    @CurrentUser() user: { id: string; role: Role; partnerId?: string; email: string },
  ) {
    // Sanitize the filename (path-traversal defence) and reject
    // executable content before anything touches storage.
    const filename = sanitizeFilename(body.filename)
    assertAllowedExtension(filename)

    if (!body.base64Data) {
      throw new BadRequestException('base64Data is required')
    }
    const data = Buffer.from(body.base64Data, 'base64')
    if (data.length === 0) {
      throw new BadRequestException('Uploaded file is empty')
    }
    const maxBytes = this.config.get<number>('storage.maxUploadBytes') ?? 32 * 1024 * 1024
    if (data.length > maxBytes) {
      throw new PayloadTooLargeException(
        `File exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB upload limit`,
      )
    }

    // Verify the iteration/node exist, the requester may write here, and
    // the file extension matches the declared output whitelist.
    const acceptedExtensions = await this.svc.assertWritable(
      body.iterationId,
      body.nodeId,
      user,
      body.nodeOutputId,
    )
    assertAcceptedExtension(filename, acceptedExtensions)

    // Single installation bucket (default `digital-thread`); the node /
    // iteration grouping lives in the object path. An explicit body.bucket still
    // overrides (e.g. per-partner routing). The legacy per-nodeId bucket scheme
    // was dropped: it created one MinIO bucket per node and risked invalid S3
    // bucket names.
    const bucket = body.bucket ?? this.config.get<string>('storage.bucket') ?? 'digital-thread'
    return this.svc.saveUpload({
      filename,
      contentType: body.contentType ?? 'application/octet-stream',
      data,
      iterationId: body.iterationId,
      nodeId: body.nodeId,
      nodeOutputId: body.nodeOutputId,
      nodeLabel: body.nodeLabel,
      uploadType: body.uploadType ?? 'MANUAL',
      bucket,
      sourceInfo: body.sourceInfo ?? (body.uploadType === 'AUTOMATIC' ? 'API: internal' : `User: ${user.email}`),
      classification: body.classification,
      pathKind: body.pathKind ?? 'nodes',
      requesterEmail: user.email,
    })
  }

  /**
   * Upload a RAW file not attached to any iteration/node. Any
   * authenticated user may upload; attribution is the uploader's own partner.
   * Classification is capped at PARTNER by RawUploadFileDto + the service.
   */
  @Post('raw-upload')
  async rawUpload(
    @Body() body: RawUploadFileDto,
    @CurrentUser() user: { id: string; role: Role; partnerId?: string; email: string },
  ) {
    const filename = sanitizeFilename(body.filename)
    assertAllowedExtension(filename)
    const data = Buffer.from(body.base64Data, 'base64')
    if (data.length === 0) throw new BadRequestException('Uploaded file is empty')
    const maxBytes = this.config.get<number>('storage.maxUploadBytes') ?? 32 * 1024 * 1024
    if (data.length > maxBytes) {
      throw new PayloadTooLargeException(
        `File exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB upload limit`,
      )
    }
    return this.svc.saveRawUpload({
      filename,
      contentType: body.contentType ?? 'application/octet-stream',
      data,
      classification: body.classification,
      bucket: body.bucket,
      requester: user,
    })
  }

  @Delete(':id')
  @Roles(ROLE.SUPERADMIN, ROLE.OWNER)
  @HttpCode(204)
  remove(@Param('id') id: string) { return this.svc.remove(id) }

  /**
   * Partner-side helper: raise a FileAccessRequest for a file the requester
   * cannot currently read. Idempotent on (fileId, requesterId, PENDING).
   * Reachable from the iteration UI when a download returns 403.
   */
  @Post(':id/request-access')
  async requestAccess(
    @Param('id') id: string,
    @Body() body: { reason?: string; iterationId?: string } | undefined,
    @CurrentUser() user: { id: string; role: Role; partnerId?: string },
  ) {
    // Surface "you already have access" cleanly so the UI can suppress the
    // request flow rather than queuing a no-op approval.
    const file = await this.svc.findOne(id)
    try {
      await this.svc.assertReadable(file, user)
      return { status: 'ALREADY_READABLE' as const, fileId: id }
    } catch {
      // intentional fallthrough — caller needs governance approval
    }
    return this.accessRequests.request({
      fileId: id,
      requesterId: user.id,
      requesterPartnerId: user.partnerId,
      reason: body?.reason,
      // The iteration the partner was viewing — governance links back to it.
      iterationId: body?.iterationId,
    })
  }

}
