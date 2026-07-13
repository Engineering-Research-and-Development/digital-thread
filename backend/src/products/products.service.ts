import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { ROLE } from '@/auth/roles'
import { v4 as uuidv4 } from 'uuid'
import type { CreateProductDto, UpdateProductDto } from './dto/product.dto'

export interface ProductRequester {
  id: string
  role: string
  partnerId?: string | null
}

/**
 * Product registry. Products are owned by a Partner. Visibility:
 *   - SUPERADMIN sees/edits all products.
 *   - OWNER sees/edits only products owned by their own partner.
 *   - OPERATOR may LIST/READ their own partner's products (read-only;
 *     product authoring is OWNER/SUPERADMIN, enforced by the controller @Roles).
 */
@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  private isSuper(r: ProductRequester) {
    return r.role === ROLE.SUPERADMIN
  }

  async findAll(requester: ProductRequester) {
    const where = this.isSuper(requester)
      ? {}
      : { ownerPartnerId: requester.partnerId ?? '__none__' }
    const rows = await this.prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        ownerPartner: { select: { id: true, name: true, color: true } },
        _count: { select: { iterations: true } },
      },
    })
    return rows.map(({ _count, ...p }) => ({ ...p, iterationCount: _count.iterations }))
  }

  async findOne(id: string, requester: ProductRequester) {
    const p = await this.prisma.product.findUnique({
      where: { id },
      include: {
        ownerPartner: { select: { id: true, name: true, color: true } },
        _count: { select: { iterations: true } },
      },
    })
    if (!p) throw new NotFoundException(`Product ${id} not found`)
    this.assertVisible(p.ownerPartnerId, requester)
    const { _count, ...rest } = p
    return { ...rest, iterationCount: _count.iterations }
  }

  async create(input: CreateProductDto, requester: ProductRequester) {
    const ownerPartnerId = this.resolveOwnerPartner(input.ownerPartnerId, requester)
    await this.assertPartnerExists(ownerPartnerId)
    await this.assertUrnFree(input.urn)
    return this.prisma.product.create({
      data: {
        id: uuidv4(),
        urn: input.urn.trim(),
        name: input.name.trim(),
        description: input.description ?? null,
        ownerPartnerId,
        createdById: requester.id,
      },
      include: { ownerPartner: { select: { id: true, name: true, color: true } } },
    })
  }

  async update(id: string, input: UpdateProductDto, requester: ProductRequester) {
    const existing = await this.prisma.product.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException(`Product ${id} not found`)
    this.assertVisible(existing.ownerPartnerId, requester)

    const data: Record<string, unknown> = {}
    if (input.urn !== undefined && input.urn !== existing.urn) {
      await this.assertUrnFree(input.urn)
      data.urn = input.urn.trim()
    }
    if (input.name !== undefined) data.name = input.name.trim()
    if (input.description !== undefined) data.description = input.description
    // Only SUPERADMIN may re-assign ownership to another partner.
    if (input.ownerPartnerId !== undefined && this.isSuper(requester)) {
      await this.assertPartnerExists(input.ownerPartnerId)
      data.ownerPartnerId = input.ownerPartnerId
    }
    return this.prisma.product.update({
      where: { id },
      data,
      include: { ownerPartner: { select: { id: true, name: true, color: true } } },
    })
  }

  async remove(id: string, requester: ProductRequester) {
    const existing = await this.prisma.product.findUnique({ where: { id } })
    if (!existing) throw new NotFoundException(`Product ${id} not found`)
    this.assertVisible(existing.ownerPartnerId, requester)
    // Iteration.productId is ON DELETE SET NULL — iterations are preserved, just un-linked.
    await this.prisma.product.delete({ where: { id } })
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  /** OWNER → forced to own partner; SUPERADMIN → must supply a target partner. */
  private resolveOwnerPartner(requested: string | undefined, requester: ProductRequester): string {
    if (this.isSuper(requester)) {
      if (!requested) throw new BadRequestException('ownerPartnerId is required for SUPERADMIN')
      return requested
    }
    if (!requester.partnerId) throw new ForbiddenException('You are not associated with a Partner')
    return requester.partnerId
  }

  private assertVisible(ownerPartnerId: string, requester: ProductRequester) {
    if (this.isSuper(requester)) return
    if (ownerPartnerId !== requester.partnerId) {
      throw new ForbiddenException('This product belongs to another partner')
    }
  }

  private async assertPartnerExists(partnerId: string) {
    const p = await this.prisma.partner.findUnique({ where: { id: partnerId } })
    if (!p) throw new BadRequestException(`Partner ${partnerId} not found`)
  }

  private async assertUrnFree(urn: string) {
    const clash = await this.prisma.product.findUnique({ where: { urn: urn.trim() } })
    if (clash) throw new BadRequestException(`A product with urn "${urn}" already exists`)
  }
}
