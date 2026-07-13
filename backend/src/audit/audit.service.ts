import { Injectable } from '@nestjs/common'
import { PrismaService } from '@/database/prisma.service'
import { MetricsService } from '@/common/observability/metrics.service'

export interface AuditListFilter {
  limit?: number
  offset?: number
  from?: Date
  to?: Date
}

export interface AdminAuditFilter extends AuditListFilter {
  actorUserId?: string
  actorRole?: string
  targetType?: string
  action?: string
  search?: string
}

export interface AccessLogFilter extends AuditListFilter {
  userId?: string
  resourceType?: string
  classification?: string
  action?: string
}

export interface LoginAuditFilter extends AuditListFilter {
  email?: string
  success?: boolean
  reason?: string
}

export interface ParsedMetric {
  name: string
  type: 'counter' | 'gauge' | 'summary'
  samples: Array<{ labels: Record<string, string>; value: number; suffix?: string }>
}

const MAX_LIMIT = 500
const DEFAULT_LIMIT = 100

const clampLimit = (n?: number): number => {
  if (!n || !Number.isFinite(n)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(n)))
}

const clampOffset = (n?: number): number => {
  if (!n || !Number.isFinite(n)) return 0
  return Math.max(0, Math.floor(n))
}

/**
 * AuditService — read-only access to the system's append-only audit tables
 * (AdminAuditLog, AccessLog, LoginAuditLog) plus a parsed snapshot of the
 * in-process Prometheus metrics exposition.
 *
 * All listings are paginated, ordered by timestamp desc, and bounded by
 * MAX_LIMIT to keep responses small. Filters narrow on indexed columns where
 * available (actorUserId, resourceType+resourceId, email+timestamp, …).
 */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService, private metrics: MetricsService) {}

  async listAdminAudit(filter: AdminAuditFilter) {
    const where: any = {}
    if (filter.actorUserId) where.actorUserId = filter.actorUserId
    if (filter.actorRole) where.actorRole = filter.actorRole
    if (filter.targetType) where.targetType = filter.targetType
    if (filter.action) where.action = { contains: filter.action }
    if (filter.from || filter.to) {
      where.timestamp = {}
      if (filter.from) where.timestamp.gte = filter.from
      if (filter.to) where.timestamp.lte = filter.to
    }
    if (filter.search) {
      where.OR = [
        { action: { contains: filter.search } },
        { targetType: { contains: filter.search } },
        { targetId: { contains: filter.search } },
        { detail: { contains: filter.search } },
      ]
    }
    const limit = clampLimit(filter.limit)
    const offset = clampOffset(filter.offset)
    const [items, total] = await Promise.all([
      this.prisma.adminAuditLog.findMany({
        where,
        include: { actor: { select: { id: true, email: true, fullName: true, role: true, partnerId: true } } },
        orderBy: { timestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.adminAuditLog.count({ where }),
    ])
    return { total, limit, offset, items }
  }

  async listAccessLog(filter: AccessLogFilter) {
    const where: any = {}
    if (filter.userId) where.userId = filter.userId
    if (filter.resourceType) where.resourceType = filter.resourceType
    if (filter.classification) where.classification = filter.classification
    if (filter.action) where.action = filter.action
    if (filter.from || filter.to) {
      where.timestamp = {}
      if (filter.from) where.timestamp.gte = filter.from
      if (filter.to) where.timestamp.lte = filter.to
    }
    const limit = clampLimit(filter.limit)
    const offset = clampOffset(filter.offset)
    const [items, total] = await Promise.all([
      this.prisma.accessLog.findMany({
        where,
        include: { user: { select: { id: true, email: true, fullName: true, role: true } } },
        orderBy: { timestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.accessLog.count({ where }),
    ])
    return { total, limit, offset, items }
  }

  async listLoginAudit(filter: LoginAuditFilter) {
    const where: any = {}
    if (filter.email) where.email = filter.email
    if (typeof filter.success === 'boolean') where.success = filter.success
    if (filter.reason) where.reason = filter.reason
    if (filter.from || filter.to) {
      where.timestamp = {}
      if (filter.from) where.timestamp.gte = filter.from
      if (filter.to) where.timestamp.lte = filter.to
    }
    const limit = clampLimit(filter.limit)
    const offset = clampOffset(filter.offset)
    const [items, total] = await Promise.all([
      this.prisma.loginAuditLog.findMany({
        where,
        include: { user: { select: { id: true, email: true, fullName: true, role: true } } },
        orderBy: { timestamp: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.prisma.loginAuditLog.count({ where }),
    ])
    return { total, limit, offset, items }
  }

  /**
   * Aggregate counters for the audit dashboard header — last 24h activity.
   * Cheap (few count() queries).
   */
  async summary() {
    const since = new Date(Date.now() - 24 * 3600_000)
    const [
      adminTotal,
      adminLast24h,
      accessTotal,
      accessLast24h,
      loginsLast24h,
      failedLoginsLast24h,
      byRole,
    ] = await Promise.all([
      this.prisma.adminAuditLog.count(),
      this.prisma.adminAuditLog.count({ where: { timestamp: { gte: since } } }),
      this.prisma.accessLog.count(),
      this.prisma.accessLog.count({ where: { timestamp: { gte: since } } }),
      this.prisma.loginAuditLog.count({ where: { timestamp: { gte: since }, success: true } }),
      this.prisma.loginAuditLog.count({ where: { timestamp: { gte: since }, success: false } }),
      this.prisma.adminAuditLog.groupBy({
        by: ['actorRole'],
        _count: { _all: true },
        where: { timestamp: { gte: since } },
      }),
    ])
    return {
      windowHours: 24,
      adminAudit: { total: adminTotal, last24h: adminLast24h },
      accessLog: { total: accessTotal, last24h: accessLast24h },
      login: { last24hSuccess: loginsLast24h, last24hFailed: failedLoginsLast24h },
      adminActionsByRoleLast24h: byRole.map((b) => ({
        role: b.actorRole ?? 'unknown',
        count: b._count?._all ?? 0,
      })),
    }
  }

  /**
   * Parse the in-process Prometheus exposition into a structured payload.
   * Keeps the same source of truth as `GET /metrics`, but easier to render.
   */
  parsedMetrics(): { generatedAt: string; raw: string; metrics: ParsedMetric[] } {
    const raw = this.metrics.exposition()
    const lines = raw.split('\n')
    const byName = new Map<string, ParsedMetric>()
    let currentType: ParsedMetric['type'] | null = null
    let currentName: string | null = null

    for (const line of lines) {
      if (!line) continue
      if (line.startsWith('# TYPE ')) {
        const [, , name, type] = line.split(' ')
        currentName = name
        currentType = (type as ParsedMetric['type']) ?? 'counter'
        if (!byName.has(name)) byName.set(name, { name, type: currentType!, samples: [] })
        continue
      }
      if (line.startsWith('#')) continue
      // Sample line: name{l="v",l2="v2"} 42  OR  name_sum{...} 42  OR  name 42
      const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*?)(_count|_sum|_bucket)?(\{[^}]*\})?\s+(-?[\d.eE+-]+)$/.exec(line.trim())
      if (!match) continue
      const [, baseName, suffix, labelsBlock, valueStr] = match
      const value = Number(valueStr)
      if (!Number.isFinite(value)) continue
      const labels = parseLabels(labelsBlock)
      const targetName = byName.has(baseName) ? baseName : currentName ?? baseName
      const metric =
        byName.get(targetName) ??
        ({ name: targetName, type: (currentType ?? 'counter') as ParsedMetric['type'], samples: [] } as ParsedMetric)
      metric.samples.push({ labels, value, suffix: suffix ? suffix.slice(1) : undefined })
      byName.set(targetName, metric)
    }

    // Sort samples per metric for deterministic rendering.
    for (const m of byName.values()) {
      m.samples.sort((a, b) => JSON.stringify(a.labels).localeCompare(JSON.stringify(b.labels)))
    }

    return {
      generatedAt: new Date().toISOString(),
      raw,
      metrics: Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name)),
    }
  }
}

function parseLabels(block: string | undefined): Record<string, string> {
  if (!block) return {}
  const inner = block.slice(1, -1)
  if (!inner.trim()) return {}
  const out: Record<string, string> = {}
  // naive parse — Prometheus exposition labels are key="value" pairs separated by commas;
  // values cannot contain unescaped quotes, so a regex is sufficient for our case.
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(inner)) !== null) {
    out[m[1]] = m[2].replace(/\\"/g, '"')
  }
  return out
}
