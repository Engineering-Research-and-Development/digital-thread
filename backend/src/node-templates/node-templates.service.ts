import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { v4 as uuidv4 } from 'uuid'

export interface NodeTemplateDto {
  id: string
  slug: string
  label: string
  kind: 'TRIGGER' | 'TASK' | 'GATEWAY'
  icon: string
  color: string
  description: string
  tags: string[]
  defaultPartnerId?: string | null
  inputs: any[]
  outputs: any[]
  enabled: boolean
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

function isValidKind(k: unknown): k is NodeTemplateDto['kind'] {
  return k === 'TRIGGER' || k === 'TASK' || k === 'GATEWAY'
}

function slugify(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'template'
}

@Injectable()
export class NodeTemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAll(opts: { enabledOnly?: boolean } = {}) {
    const rows = await this.prisma.nodeTemplate.findMany({
      where: opts.enabledOnly ? { enabled: true } : undefined,
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    })
    return rows.map(this.serialize)
  }

  async findOne(id: string): Promise<NodeTemplateDto> {
    const row = await this.prisma.nodeTemplate.findUnique({ where: { id } })
    if (!row) throw new NotFoundException(`Node template ${id} not found`)
    return this.serialize(row)
  }

  async create(body: Partial<NodeTemplateDto>): Promise<NodeTemplateDto> {
    if (!body.label?.trim()) throw new BadRequestException('label is required')
    const kind = body.kind ?? 'TASK'
    if (!isValidKind(kind)) throw new BadRequestException(`invalid kind: ${kind}`)
    const slug = body.slug?.trim() || slugify(body.label)
    const existing = await this.prisma.nodeTemplate.findUnique({ where: { slug } })
    if (existing) throw new ConflictException(`slug "${slug}" already in use`)

    const row = await this.prisma.nodeTemplate.create({
      data: {
        id: uuidv4(),
        slug,
        label: body.label,
        kind,
        icon: body.icon ?? 'Box',
        color: body.color ?? '#3B82F6',
        description: body.description ?? '',
        tagsJson: JSON.stringify(body.tags ?? []),
        defaultPartnerId: body.defaultPartnerId ?? null,
        inputsJson: JSON.stringify(body.inputs ?? []),
        outputsJson: JSON.stringify(body.outputs ?? []),
        enabled: body.enabled ?? true,
        sortOrder: body.sortOrder ?? 100,
      },
    })
    return this.serialize(row)
  }

  async update(id: string, body: Partial<NodeTemplateDto>): Promise<NodeTemplateDto> {
    await this.findOne(id) // throws if missing
    if (body.kind !== undefined && !isValidKind(body.kind)) {
      throw new BadRequestException(`invalid kind: ${body.kind}`)
    }
    if (body.slug !== undefined) {
      const slug = body.slug.trim()
      if (!slug) throw new BadRequestException('slug cannot be empty')
      const conflict = await this.prisma.nodeTemplate.findFirst({
        where: { slug, NOT: { id } },
      })
      if (conflict) throw new ConflictException(`slug "${slug}" already in use`)
    }
    const row = await this.prisma.nodeTemplate.update({
      where: { id },
      data: {
        ...(body.slug !== undefined ? { slug: body.slug.trim() } : {}),
        ...(body.label !== undefined ? { label: body.label } : {}),
        ...(body.kind !== undefined ? { kind: body.kind } : {}),
        ...(body.icon !== undefined ? { icon: body.icon } : {}),
        ...(body.color !== undefined ? { color: body.color } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.tags !== undefined ? { tagsJson: JSON.stringify(body.tags) } : {}),
        ...(body.defaultPartnerId !== undefined ? { defaultPartnerId: body.defaultPartnerId } : {}),
        ...(body.inputs !== undefined ? { inputsJson: JSON.stringify(body.inputs) } : {}),
        ...(body.outputs !== undefined ? { outputsJson: JSON.stringify(body.outputs) } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
      },
    })
    return this.serialize(row)
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id)
    await this.prisma.nodeTemplate.delete({ where: { id } })
  }

  private serialize = (row: any): NodeTemplateDto => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    kind: row.kind,
    icon: row.icon,
    color: row.color,
    description: row.description,
    tags: this.safeJsonArray(row.tagsJson),
    defaultPartnerId: row.defaultPartnerId,
    inputs: this.safeJsonArray(row.inputsJson),
    outputs: this.safeJsonArray(row.outputsJson),
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

  private safeJsonArray(raw: string | null | undefined): any[] {
    if (!raw) return []
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v : []
    } catch {
      return []
    }
  }
}
