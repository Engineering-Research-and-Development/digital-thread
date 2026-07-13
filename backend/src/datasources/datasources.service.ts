import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { createAdapter } from './connectivity/adapter.factory'
import { SecretsService } from '@/common/security/secrets.service'

@Injectable()
export class DataSourcesService {
  constructor(
    private prisma: PrismaService,
    private secrets: SecretsService,
  ) {}

  async findAll() {
    const items = await this.prisma.dataSource.findMany({ orderBy: { name: 'asc' } })
    return items.map((d) => this.maskAuth(d))
  }

  async findOne(id: string) {
    const ds = await this.prisma.dataSource.findUnique({ where: { id } })
    if (!ds) throw new NotFoundException(`DataSource ${id} not found`)
    return this.maskAuth(ds)
  }

  /** Internal: returns the record with auth decrypted, for adapter calls. */
  async findOneInternal(id: string) {
    const ds = await this.prisma.dataSource.findUnique({ where: { id } })
    if (!ds) throw new NotFoundException(`DataSource ${id} not found`)
    if (ds.authEncrypted && ds.authConfigJson) {
      ds.authConfigJson = this.secrets.decrypt(ds.authConfigJson)
    }
    return ds
  }

  async create(data: any) {
    const payload = { ...data }
    if (payload.authConfigJson && typeof payload.authConfigJson === 'object') {
      payload.authConfigJson = JSON.stringify(payload.authConfigJson)
    }
    if (payload.authConfigJson) {
      payload.authConfigJson = this.secrets.encrypt(payload.authConfigJson)
      payload.authEncrypted = true
    }
    return this.maskAuth(await this.prisma.dataSource.create({ data: payload }))
  }

  async update(id: string, data: any) {
    await this.findOne(id)
    const payload: any = { ...data, updatedAt: new Date() }
    if (payload.authConfigJson !== undefined && payload.authConfigJson !== null) {
      const raw = typeof payload.authConfigJson === 'object'
        ? JSON.stringify(payload.authConfigJson)
        : String(payload.authConfigJson)
      payload.authConfigJson = this.secrets.encrypt(raw)
      payload.authEncrypted = true
    }
    return this.maskAuth(await this.prisma.dataSource.update({ where: { id }, data: payload }))
  }

  async remove(id: string) {
    await this.findOne(id)
    await this.prisma.dataSource.delete({ where: { id } })
  }

  async testConnection(id: string) {
    const ds = await this.findOneInternal(id)
    const authConfig = ds.authConfigJson ? JSON.parse(ds.authConfigJson) : null
    const protocolConfig = ds.protocolConfigJson ? JSON.parse(ds.protocolConfigJson) : null

    const adapter = createAdapter(ds.protocol, ds.endpoint, authConfig, protocolConfig)
    const result = await adapter.testConnection()

    const status = result.ok ? 'ONLINE' : 'ERROR'
    await this.prisma.dataSource.update({
      where: { id },
      data: { connectionStatus: status, lastCheckedAt: new Date(), lastErrorMsg: result.error ?? null },
    })

    return result
  }

  async getStatus(id: string) {
    const ds = await this.findOne(id)
    return {
      connectionStatus: ds.connectionStatus,
      lastCheckedAt: ds.lastCheckedAt,
      lastErrorMsg: ds.lastErrorMsg,
    }
  }

  async fetchSample(id: string) {
    const ds = await this.findOneInternal(id)
    const authConfig = ds.authConfigJson ? JSON.parse(ds.authConfigJson) : null
    const protocolConfig = ds.protocolConfigJson ? JSON.parse(ds.protocolConfigJson) : null
    const tagMapping = ds.tagMappingJson ? JSON.parse(ds.tagMappingJson) : []

    const adapter = createAdapter(ds.protocol, ds.endpoint, authConfig, protocolConfig)
    const data = await adapter.fetchLatest(tagMapping)
    return { data }
  }

  /** Hide credential payload when returning to clients — never leak plaintext. */
  private maskAuth<T extends { authConfigJson?: string | null; authEncrypted?: boolean }>(ds: T): T {
    if (ds.authConfigJson) {
      return { ...ds, authConfigJson: '***encrypted***' }
    }
    return ds
  }
}
