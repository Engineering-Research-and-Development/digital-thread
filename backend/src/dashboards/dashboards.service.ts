import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { ROLE, type Role } from '@/auth/roles'

/**
 * DashboardsService — produces role-tailored dashboards:
 *   - SUPERADMIN → platform health (governance queue, login audit, classification mix)
 *   - OWNER      → workflow throughput, iteration funnel, NC/CR queue
 *   - OPERATOR   → "my work" — my partner's pending nodes, recent uploads
 *
 * Plus cross-phase KPIs and a simple historical series for iteration duration.
 */
@Injectable()
export class DashboardsService {
  constructor(private prisma: PrismaService) {}

  async forRole(user: { id: string; role: Role; partnerId?: string | null }) {
    switch (user.role) {
      case ROLE.SUPERADMIN: return this.superadmin()
      case ROLE.OWNER:      return this.owner()
      case ROLE.OPERATOR:    return this.partner(user.partnerId ?? null)
      default:              return {}
    }
  }

  async crossPhaseKpis() {
    const [iter, completed, failed, files, avgDurationMs] = await Promise.all([
      this.prisma.iteration.count(),
      this.prisma.iteration.count({ where: { status: 'COMPLETED' } }),
      this.prisma.iteration.count({ where: { status: 'FAILED' } }),
      this.prisma.fileRecord.count(),
      this.averageIterationDurationMs(),
    ])
    const nc = await this.prisma.nonConformance.count({ where: { status: { not: 'CLOSED' } } })
    const cr = await this.prisma.changeRequest.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } })
    return {
      iterations: { total: iter, completed, failed, successRatePct: iter ? Math.round((completed / iter) * 100) : 0 },
      avgIterationDurationMs: avgDurationMs,
      files: { total: files },
      openNonConformances: nc,
      openChangeRequests: cr,
    }
  }

  async historicalTrend(bucket: 'day' | 'week' = 'day', last = 30) {
    const since = new Date(Date.now() - last * (bucket === 'day' ? 86400000 : 604800000))
    const iters = await this.prisma.iteration.findMany({
      where: { createdAt: { gte: since } },
      select: { createdAt: true, completedAt: true, status: true },
    })
    const series: Record<string, { completed: number; failed: number; running: number }> = {}
    for (const it of iters) {
      const key = this.bucketKey(it.createdAt, bucket)
      series[key] ??= { completed: 0, failed: 0, running: 0 }
      if (it.status === 'COMPLETED') series[key].completed++
      else if (it.status === 'FAILED') series[key].failed++
      else series[key].running++
    }
    return Object.entries(series).map(([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date))
  }

  // ── Role-specific ─────────────────────────────────────────────────────────

  private async superadmin() {
    const [pendingApprovals, lockedUsers, accessLast24h, classification] = await Promise.all([
      this.prisma.approvalRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.user.count({ where: { lockedUntil: { gt: new Date() } } }),
      this.prisma.accessLog.count({ where: { timestamp: { gte: new Date(Date.now() - 86400000) } } }),
      this.prisma.fileRecord.groupBy({ by: ['classification'], _count: { _all: true } }),
    ])
    return {
      kind: 'SUPERADMIN',
      pendingApprovals,
      lockedUsers,
      accessLast24h,
      classificationMix: classification.map((c) => ({ classification: c.classification, count: c._count._all })),
      kpis: await this.crossPhaseKpis(),
    }
  }

  private async owner() {
    const [running, pendingManual, openNc, openCr] = await Promise.all([
      this.prisma.iteration.count({ where: { status: 'RUNNING' } }),
      this.prisma.nodeRuntimeState.count({ where: { status: 'PENDING' } }),
      this.prisma.nonConformance.count({ where: { status: { not: 'CLOSED' } } }),
      this.prisma.changeRequest.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
    ])
    return {
      kind: 'OWNER',
      runningIterations: running,
      pendingManualNodes: pendingManual,
      openNonConformances: openNc,
      openChangeRequests: openCr,
      trend: await this.historicalTrend('day', 14),
    }
  }

  private async partner(partnerId: string | null) {
    if (!partnerId) return { kind: 'OPERATOR', error: 'no partner bound' }
    const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } })
    if (!partner) return { kind: 'OPERATOR', error: 'partner not found' }

    const machines = await this.prisma.stateMachine.findMany()
    const myNodeIds: { machineId: string; nodeIds: string[] }[] = []
    for (const m of machines) {
      const nodes: Array<{ id: string; responsiblePartner?: string }> = JSON.parse(m.nodesJson || '[]')
      const mine = nodes.filter((n) => n.responsiblePartner === partner.name).map((n) => n.id)
      if (mine.length) myNodeIds.push({ machineId: m.id, nodeIds: mine })
    }

    // Pending node states on my partner's nodes
    const pendingAssigned = await Promise.all(myNodeIds.map((mm) =>
      this.prisma.nodeRuntimeState.findMany({
        where: { nodeId: { in: mm.nodeIds }, status: 'PENDING' },
        include: { iteration: { select: { id: true, displayId: true, machineName: true } } },
      })),
    ).then((r) => r.flat())

    const recentUploads = await this.prisma.fileRecord.findMany({
      where: { uploadType: 'MANUAL', sourceInfo: { contains: partner.name } },
      orderBy: { timestamp: 'desc' },
      take: 10,
    })

    return {
      kind: 'OPERATOR',
      partner: { id: partner.id, name: partner.name, fullName: partner.fullName },
      pendingAssigned,
      recentUploads,
    }
  }

  private async averageIterationDurationMs(): Promise<number> {
    const completed = await this.prisma.iteration.findMany({
      where: { status: 'COMPLETED', completedAt: { not: null } },
      select: { createdAt: true, completedAt: true },
      take: 200,
    })
    if (completed.length === 0) return 0
    const total = completed.reduce((sum, i) => sum + ((i.completedAt?.getTime() ?? 0) - i.createdAt.getTime()), 0)
    return Math.round(total / completed.length)
  }

  private bucketKey(d: Date, bucket: 'day' | 'week'): string {
    if (bucket === 'day') return d.toISOString().slice(0, 10)
    const onejan = new Date(d.getFullYear(), 0, 1)
    const week = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7)
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
  }
}
