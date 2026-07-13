import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PrismaService } from '@/database/prisma.service'
import { IterationsService } from '@/iterations/iterations.service'
import { FilesService } from '@/files/files.service'
import { sanitizeFilename, assertAllowedExtension, assertAcceptedExtension } from '@/files/files.util'
import { ROLE, type Role } from '@/auth/roles'
import type { ExtUploadFileDto } from './dto/ext-api.dto'

interface ExtUser {
  id: string
  email: string
  role: Role
  partnerId?: string | null
}

/**
 * ExtApiService — orchestration for the external REST API. It is a
 * THIN layer over the existing services: it never re-implements permission
 * logic. Partner scoping comes from IterationsService.findAll, PartnerScopeGuard
 * (on the controller) and FilesService.assert{Readable,Writable}/canRead.
 */
@Injectable()
export class ExtApiService {
  constructor(
    private prisma: PrismaService,
    private iterations: IterationsService,
    private files: FilesService,
    private config: ConfigService,
  ) {}

  async me(user: ExtUser) {
    const partner = user.partnerId
      ? await this.prisma.partner.findUnique({
          where: { id: user.partnerId },
          select: { id: true, name: true, fullName: true, country: true },
        })
      : null
    return { id: user.id, email: user.email, role: user.role, partner }
  }

  listIterations(
    user: ExtUser,
    q: { status?: string; productId?: string; componentRef?: string; page?: number; limit?: number },
  ) {
    // findAll applies partner row-scoping for OWNER/OPERATOR, the status/product/
    // component filters (before pagination) and page/limit clamping.
    return this.iterations.findAll({
      status: q.status,
      productId: q.productId,
      componentRef: q.componentRef,
      page: q.page ?? 1,
      limit: q.limit ?? 50,
      requester: { id: user.id, role: user.role, partnerId: user.partnerId ?? undefined },
    })
  }

  getIteration(id: string) {
    return this.iterations.findOne(id)
  }

  timeline(id: string) {
    return this.iterations.getTimeline(id)
  }

  /** Node view enriched with the declared contract + an `actionable`/`mine` flag. */
  async nodes(id: string, user: ExtUser) {
    const { nodes } = await this.iterations.loadIterationFlow(id)
    const { nodeStates } = await this.iterations.getNodeStates(id)
    const stateByNode = new Map(nodeStates.map((s: any) => [s.nodeId, s]))
    const partner = user.partnerId
      ? await this.prisma.partner.findUnique({ where: { id: user.partnerId }, select: { id: true, name: true } })
      : null

    return {
      nodes: nodes.map((n: any) => {
        const st: any = stateByNode.get(n.id)
        const status = st?.status ?? 'IDLE'
        const responsiblePartnerIds: string[] = n.responsiblePartnerIds ?? []
        const mine =
          user.role === ROLE.SUPERADMIN ||
          (!!partner && (responsiblePartnerIds.includes(partner.id) || n.responsiblePartner === partner.name))
        return {
          id: n.id,
          name: n.name,
          kind: n.kind,
          status,
          responsiblePartnerIds,
          mine,
          // "actionable" = the iteration is waiting for THIS partner to act on this node.
          actionable: mine && (status === 'PENDING' || status === 'RUNNING'),
          claimedBy: st?.claimedBy ?? null,
          inputs: (n.inputs ?? []).map((i: any) => ({
            id: i.id,
            name: i.name,
            required: i.required,
            cardinality: i.cardinality,
            fileTypes: i.fileTypes ?? [],
            source: i.source?.kind ?? 'MANUAL',
          })),
          outputs: (n.outputs ?? []).map((o: any) => ({
            id: o.id,
            name: o.name,
            required: o.required,
            cardinality: o.cardinality,
            fileTypes: o.fileTypes ?? [],
            defaultClassification: o.defaultClassification ?? null,
            fileIds: st?.outputsJson ? (safeParse(st.outputsJson)[o.id] ?? []) : [],
          })),
        }
      }),
    }
  }

  async listFiles(id: string, user: ExtUser, q: { page?: number; limit?: number }) {
    // FilesService.findAll already filters to what the requester may read.
    return this.files.findAll({
      iterationId: id,
      scope: 'NODE',
      page: q.page ?? 1,
      limit: q.limit ?? 50,
      requester: { id: user.id, role: user.role, partnerId: user.partnerId ?? undefined },
    })
  }

  async fileMeta(fileId: string, user: ExtUser) {
    const file = await this.files.findOne(fileId)
    await this.files.assertReadable(file, { id: user.id, role: user.role, partnerId: user.partnerId ?? undefined })
    return file
  }

  /** Upload a file to a node output the partner is responsible for and the iteration is awaiting. */
  async upload(user: ExtUser, iterationId: string, nodeId: string, dto: ExtUploadFileDto) {
    const filename = sanitizeFilename(dto.filename)
    assertAllowedExtension(filename)

    if (!dto.contentBase64) throw new BadRequestException('contentBase64 is required')
    const data = Buffer.from(dto.contentBase64, 'base64')
    if (data.length === 0) throw new BadRequestException('Uploaded file is empty')
    const maxBytes = this.config.get<number>('storage.maxUploadBytes') ?? 32 * 1024 * 1024
    if (data.length > maxBytes) {
      throw new PayloadTooLargeException(`File exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB upload limit`)
    }

    // Partner-scope + extension whitelist (same gate as the UI upload).
    const accepted = await this.files.assertWritable(
      iterationId,
      nodeId,
      { id: user.id, role: user.role, partnerId: user.partnerId ?? undefined },
      dto.outputId,
    )
    assertAcceptedExtension(filename, accepted)

    // The iteration must be WAITING for this node (PENDING or RUNNING).
    const state = await this.prisma.nodeRuntimeState.findUnique({
      where: { iterationId_nodeId: { iterationId, nodeId } },
    })
    if (!state) throw new NotFoundException(`Node ${nodeId} not found in iteration ${iterationId}`)
    if (state.status !== 'PENDING' && state.status !== 'RUNNING') {
      throw new BadRequestException(`Node is not awaiting input (current status: ${state.status})`)
    }

    const { nodes } = await this.iterations.loadIterationFlow(iterationId)
    const nodeDef = nodes.find((n: any) => n.id === nodeId)
    const nodeLabel = nodeDef?.name ?? nodeId
    // One installation = one storage bucket (default `digital-thread`); see files.controller.
    const bucket = this.config.get<string>('storage.bucket') ?? 'digital-thread'

    return this.files.saveUpload({
      filename,
      contentType: dto.contentType ?? 'application/octet-stream',
      data,
      iterationId,
      nodeId,
      nodeOutputId: dto.outputId,
      nodeLabel,
      uploadType: 'MANUAL',
      bucket,
      sourceInfo: `API: ${user.email}`,
      classification: dto.classification,
      pathKind: 'nodes',
      requesterEmail: user.email,
    })
  }

  claim(user: ExtUser, iterationId: string, nodeId: string) {
    return this.iterations.claimNode(iterationId, nodeId, user.email ?? user.id)
  }

  complete(iterationId: string, nodeId: string) {
    return this.iterations.completeNode(iterationId, nodeId)
  }
}

function safeParse(s: string): Record<string, string[]> {
  try {
    const v = JSON.parse(s)
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}
