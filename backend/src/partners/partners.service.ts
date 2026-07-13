import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import type { CreatePartnerDto, UpdatePartnerDto } from './dto/partner.dto'

@Injectable()
export class PartnersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.partner.findMany({ orderBy: { name: 'asc' } })
  }

  async findOne(id: string) {
    const p = await this.prisma.partner.findUnique({ where: { id } })
    if (!p) throw new NotFoundException(`Partner ${id} not found`)
    return p
  }

  create(data: CreatePartnerDto) {
    // country is validated (ISO 3166-1 alpha-2) + required by CreatePartnerDto.
    return this.prisma.partner.create({ data })
  }

  async update(id: string, data: UpdatePartnerDto) {
    await this.findOne(id)
    return this.prisma.partner.update({ where: { id }, data })
  }

  async remove(id: string) {
    await this.findOne(id)
    await this.prisma.partner.delete({ where: { id } })
  }
}
