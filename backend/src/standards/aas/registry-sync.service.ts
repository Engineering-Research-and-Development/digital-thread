import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'

/**
 * Federated AAS Registry sync. Each peer is a remote AAS Registry URL we
 * periodically poll for shell descriptors; results land in `AasRegistryShell`
 * rows so the local Digital Thread instance can show a unified "federated
 * catalog" without proxy-calls at read time.
 *
 * Enable auto-sync with `AAS_REGISTRY_SYNC_ENABLED=true`; period via
 * `AAS_REGISTRY_SYNC_MS` (default 10 minutes).
 */
@Injectable()
export class AasRegistrySyncService implements OnModuleInit {
  private readonly logger = new Logger(AasRegistrySyncService.name)
  private timer: NodeJS.Timeout | null = null

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    if (process.env.AAS_REGISTRY_SYNC_ENABLED !== 'true') return
    const ms = parseInt(process.env.AAS_REGISTRY_SYNC_MS ?? String(10 * 60 * 1000), 10)
    this.timer = setInterval(() => this.syncAllPeers().catch((e) => this.logger.warn(e?.message)), ms)
    setTimeout(() => this.syncAllPeers().catch(() => {}), 5_000)
    this.logger.log(`AAS Registry federation sync every ${Math.round(ms / 60_000)} min`)
  }

  // ── Peer CRUD ────────────────────────────────────────────────────────────

  listPeers() { return this.prisma.aasRegistryPeer.findMany({ orderBy: { name: 'asc' } }) }

  async addPeer(input: { name: string; registryUrl: string }) {
    return this.prisma.aasRegistryPeer.create({ data: input })
  }

  async updatePeer(id: string, input: Partial<{ name: string; registryUrl: string; enabled: boolean }>) {
    return this.prisma.aasRegistryPeer.update({ where: { id }, data: input })
  }

  async removePeer(id: string) { await this.prisma.aasRegistryPeer.delete({ where: { id } }) }

  // ── Sync ─────────────────────────────────────────────────────────────────

  async syncAllPeers() {
    const peers = await this.prisma.aasRegistryPeer.findMany({ where: { enabled: true } })
    const results: Array<{ peer: string; updated?: number; error?: string }> = []
    for (const peer of peers) results.push(await this.syncPeer(peer.id))
    return { results }
  }

  async syncPeer(peerId: string) {
    const peer = await this.prisma.aasRegistryPeer.findUnique({ where: { id: peerId } })
    if (!peer) throw new NotFoundException('Registry peer not found')
    const started = Date.now()
    try {
      const res = await fetch(`${peer.registryUrl.replace(/\/$/, '')}/shell-descriptors`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body: any = await res.json()
      const descriptors: any[] = Array.isArray(body) ? body : body?.result ?? body?.items ?? []
      let updated = 0
      for (const d of descriptors) {
        const shellId: string = d.id ?? d.identification ?? d.shellId
        if (!shellId) continue
        await this.prisma.aasRegistryShell.upsert({
          where: { peerId_shellId: { peerId: peer.id, shellId } },
          create: { peerId: peer.id, shellId, descriptorJson: JSON.stringify(d) },
          update: { descriptorJson: JSON.stringify(d), updatedAt: new Date() },
        })
        updated++
      }
      await this.prisma.aasRegistryPeer.update({
        where: { id: peer.id },
        data: { lastSyncAt: new Date(), lastError: null },
      })
      this.logger.log(`Synced ${updated} shells from ${peer.name} in ${Date.now() - started}ms`)
      return { peer: peer.name, updated }
    } catch (e: any) {
      await this.prisma.aasRegistryPeer.update({
        where: { id: peer.id }, data: { lastSyncAt: new Date(), lastError: e?.message ?? 'unknown' },
      })
      return { peer: peer.name, error: e?.message }
    }
  }

  // ── Federated catalog ────────────────────────────────────────────────────

  async federatedCatalog(filter?: { peerId?: string; q?: string }) {
    const where: any = {}
    if (filter?.peerId) where.peerId = filter.peerId
    if (filter?.q) where.descriptorJson = { contains: filter.q }
    const items = await this.prisma.aasRegistryShell.findMany({
      where,
      take: 500,
      include: { peer: { select: { name: true, registryUrl: true } } },
      orderBy: { updatedAt: 'desc' },
    })
    return items.map((s) => ({
      shellId: s.shellId,
      peer: s.peer.name,
      peerUrl: s.peer.registryUrl,
      updatedAt: s.updatedAt,
      descriptor: JSON.parse(s.descriptorJson),
    }))
  }
}
