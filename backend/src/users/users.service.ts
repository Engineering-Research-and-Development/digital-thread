import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import * as bcrypt from 'bcrypt'
import { ROLE, type Role } from '@/auth/roles'
import { v4 as uuidv4 } from 'uuid'

const SALT_ROUNDS = 10

export interface CreateUserInput {
  email: string
  password: string
  fullName?: string
  role: Role
  partnerId?: string | null
}

export interface UpdateUserInput {
  fullName?: string
  role?: Role
  partnerId?: string | null
  isActive?: boolean
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findAll(filter?: { partnerId?: string; role?: Role }) {
    const where: any = {}
    if (filter?.partnerId) where.partnerId = filter.partnerId
    if (filter?.role) where.role = filter.role
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { email: 'asc' },
      include: { partner: true },
    })
    return users.map(this.sanitize)
  }

  async findOne(id: string) {
    const u = await this.prisma.user.findUnique({ where: { id }, include: { partner: true } })
    if (!u) throw new NotFoundException(`User ${id} not found`)
    return this.sanitize(u)
  }

  async create(input: CreateUserInput) {
    this.validateRolePartner(input.role, input.partnerId)
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } })
    if (existing) throw new BadRequestException(`Email ${input.email} already in use`)
    const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS)
    const user = await this.prisma.user.create({
      data: {
        id: uuidv4(),
        email: input.email,
        hashedPassword,
        fullName: input.fullName,
        role: input.role,
        partnerId: input.partnerId ?? null,
      },
      include: { partner: true },
    })
    return this.sanitize(user)
  }

  async update(id: string, input: UpdateUserInput) {
    const current = await this.prisma.user.findUnique({ where: { id } })
    if (!current) throw new NotFoundException(`User ${id} not found`)
    const role = input.role ?? (current.role as Role)
    const partnerId = input.partnerId === undefined ? current.partnerId : input.partnerId
    this.validateRolePartner(role, partnerId)
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: input.fullName ?? current.fullName,
        role,
        partnerId: partnerId ?? null,
        isActive: input.isActive ?? current.isActive,
      },
      include: { partner: true },
    })
    return this.sanitize(updated)
  }

  async changePassword(id: string, newPassword: string) {
    if (newPassword.length < 8) throw new BadRequestException('Password too short')
    const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS)
    await this.prisma.user.update({ where: { id }, data: { hashedPassword } })
    // Revoke all refresh tokens — force re-login.
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revoked: false },
      data: { revoked: true },
    })
    return { ok: true }
  }

  async remove(id: string) {
    await this.prisma.refreshToken.updateMany({ where: { userId: id, revoked: false }, data: { revoked: true } })
    await this.prisma.user.delete({ where: { id } })
  }

  /**
   * Self-service profile update. Any authenticated user may change
   * their own display name and, when they belong to a Partner (OWNER/OPERATOR),
   * the Partner's display name (`fullName`) and `country`. The short, unique
   * Partner `name` code is intentionally immutable here — it is an identifier
   * referenced by legacy `responsiblePartner` strings in saved workflows.
   * `country` format (ISO 3166-1 alpha-2) is validated by the controller DTO.
   */
  async updateProfile(
    userId: string,
    input: { fullName?: string; partnerFullName?: string; partnerCountry?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw new NotFoundException(`User ${userId} not found`)

    if (input.fullName !== undefined) {
      await this.prisma.user.update({ where: { id: userId }, data: { fullName: input.fullName } })
    }

    if (input.partnerFullName !== undefined || input.partnerCountry !== undefined) {
      if (!user.partnerId) {
        throw new BadRequestException('Your account is not associated with a Partner to edit')
      }
      const data: { fullName?: string; country?: string } = {}
      if (input.partnerFullName !== undefined) data.fullName = input.partnerFullName
      if (input.partnerCountry !== undefined) data.country = input.partnerCountry
      await this.prisma.partner.update({ where: { id: user.partnerId }, data })
    }

    return this.findOne(userId)
  }

  private validateRolePartner(role: Role, partnerId?: string | null) {
    // OWNER is partner-scoped (like OPERATOR) and MUST have a partnerId.
    if ((role === ROLE.OPERATOR || role === ROLE.OWNER) && !partnerId) {
      throw new BadRequestException(`${role} role requires a partnerId`)
    }
    if (role === ROLE.SUPERADMIN && partnerId) {
      throw new BadRequestException('SUPERADMIN must not be bound to a Partner')
    }
  }

  private sanitize(u: any) {
    const { hashedPassword, ...rest } = u
    return rest
  }
}
