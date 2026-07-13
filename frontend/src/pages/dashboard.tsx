import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Hand,
  Hourglass,
  LayoutGrid,
  Play,
  Plus,
  ShieldCheck,
  TrendingUp,
  Upload,
  Users,
  XCircle,
} from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuthStore } from '@/stores/auth-store'
import { canStartIteration, isStaff, ROLE } from '@/lib/roles'
import { api } from '@/lib/api'
import { useMachineStore } from '@/stores/machine-store'
import { useIterationStore } from '@/stores/iteration-store'
import { usePartnerStore } from '@/stores/partner-store'
import { IterationStatus, NodeStatus } from '@/types/enums'
import { cn } from '@/lib/utils'

const BLOCKED_THRESHOLD_MS = 2 * 60 * 60 * 1000 // 2h
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`
  if (ms < 86_400_000) {
    const h = Math.floor(ms / 3_600_000)
    const m = Math.round((ms % 3_600_000) / 60_000)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  const d = Math.floor(ms / 86_400_000)
  const h = Math.round((ms % 86_400_000) / 3_600_000)
  return h > 0 ? `${d}d ${h}h` : `${d}d`
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}

/**
 * Unified, role-aware dashboard - a single page with no duplicated
 * information. What is shown depends strictly on the role:
 *
 *   SUPERADMIN  Platform view - every iteration + governance (approvals,
 *               downloads, files-by-classification) + cross-phase KPIs +
 *               team performance + blocked iterations + trend.
 *   OWNER       Operations view (partner-scoped) - own/involved iterations,
 *               cross-phase KPIs (incl. open NCs/CRs), my-partner tasks, active
 *               workflows, blocked, team performance, trend.
 *   OPERATOR    "My Work" - my pending tasks (prominent), my-partner recent
 *               uploads, and Active State Machines + Recent Activity scoped to
 *               iterations their partner is DIRECTLY INVOLVED in (responsible on
 *               a node). No platform governance / aggregates / trend.
 *
 * Live operational figures come from the (role-scoped) iteration store; the
 * governance / cross-phase / trend figures come from the backend dashboards
 * API. The two are complementary windows (now/today vs aggregate) - never the
 * same metric twice.
 */
export function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { machines } = useMachineStore()
  const { iterations, nodeStatuses, init: initIterations } = useIterationStore()
  const { partners } = usePartnerStore()

  // Backend role-tailored data (governance / cross-phase KPIs / trend). Failures
  // degrade gracefully - the live client-computed sections still render.
  const [meData, setMeData] = useState<any | null>(null)
  const [kpiData, setKpiData] = useState<any | null>(null)
  const [trend, setTrend] = useState<any[]>([])

  useEffect(() => {
    initIterations()
  }, [initIterations])

  useEffect(() => {
    let active = true
    api.dashboards.me().then((d) => active && setMeData(d)).catch(() => {})
    api.dashboards.kpis().then((d) => active && setKpiData(d)).catch(() => {})
    api.dashboards.trend('day', 14).then((d) => active && setTrend(Array.isArray(d) ? d : [])).catch(() => setTrend([]))
    return () => { active = false }
  }, [])

  const role = user?.role
  const isSuperadmin = role === ROLE.SUPERADMIN
  const isOwner = role === ROLE.OWNER
  const isOperator = role === ROLE.OPERATOR
  const isAdmin = isStaff(role) // SUPERADMIN or OWNER - "staff" (aggregate views)
  const canCreate = canStartIteration(role)
  const partnerLabel = user?.partner?.fullName ?? user?.partner?.name ?? null

  // OPERATOR view is scoped to "directly involved" work: a state machine /
  // iteration counts as the operator's only when their partner is a
  // responsible party on at least one node (multi-partner aware).
  const myPartnerId = user?.partnerId ?? null
  const myPartnerName = user?.partner?.name ?? null
  const machineInvolvesMe = useCallback(
    (machine?: { nodes: { responsiblePartner?: string; responsiblePartnerIds?: string[] }[] }) =>
      !!machine &&
      machine.nodes.some(
        (n) =>
          (!!myPartnerId && (n.responsiblePartnerIds ?? []).includes(myPartnerId)) ||
          (!!myPartnerName && n.responsiblePartner === myPartnerName),
      ),
    [myPartnerId, myPartnerName],
  )

  const iterationList = useMemo(() => Object.values(iterations), [iterations])
  const machineList = useMemo(() => Object.values(machines), [machines])

  // ── Live operational KPIs (all roles, role-scoped store) ──────────────────
  const kpis = useMemo(() => {
    const now = Date.now()
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)

    let running = 0
    let completedToday = 0
    let failed24h = 0
    let pendingManual = 0

    for (const it of iterationList) {
      if (it.status === IterationStatus.RUNNING) running++
      if (it.status === IterationStatus.COMPLETED) {
        const ca = it.completedAt ? new Date(it.completedAt).getTime() : 0
        if (ca >= startOfDay.getTime()) completedToday++
      }
      if (it.status === IterationStatus.FAILED) {
        const ca = it.completedAt ? new Date(it.completedAt).getTime() : new Date(it.createdAt).getTime()
        if (now - ca <= 24 * 60 * 60 * 1000) failed24h++
      }
    }

    for (const it of iterationList) {
      if (it.status !== IterationStatus.RUNNING) continue
      const nodes = nodeStatuses[it.id]
      if (!nodes) continue
      for (const ns of Object.values(nodes)) {
        if (ns.status === NodeStatus.PENDING) pendingManual++
      }
    }

    return { running, pendingManual, completedToday, failed24h }
  }, [iterationList, nodeStatuses])

  // ── Blocked iterations (RUNNING + node PENDING >2h) ──────────────────────
  const blockedIterations = useMemo(() => {
    const now = Date.now()
    const result: Array<{
      iterationId: string
      displayId: string
      machineName: string
      blockedNodeLabel: string
      blockedPartner?: string
      durationMs: number
    }> = []

    for (const it of iterationList) {
      if (it.status !== IterationStatus.RUNNING) continue
      const machine = machines[it.machineId]
      if (!machine) continue
      const nodes = nodeStatuses[it.id]
      if (!nodes) continue

      for (const ns of Object.values(nodes)) {
        if (ns.status !== NodeStatus.PENDING) continue
        const startMs = ns.startedAt ? new Date(ns.startedAt).getTime() : new Date(it.createdAt).getTime()
        const duration = now - startMs
        if (duration < BLOCKED_THRESHOLD_MS) continue

        const node = machine.nodes.find((n) => n.id === ns.nodeId)
        result.push({
          iterationId: it.id,
          displayId: it.displayId ?? it.id,
          machineName: it.machineName,
          blockedNodeLabel: node?.label ?? node?.name ?? ns.nodeId,
          blockedPartner: node?.responsiblePartner,
          durationMs: duration,
        })
      }
    }
    return result.sort((a, b) => b.durationMs - a.durationMs).slice(0, 5)
  }, [iterationList, nodeStatuses, machines])

  // ── My tasks: nodes PENDING assigned to the user's partner ────────────────
  const myTasks = useMemo(() => {
    if (!user) return []
    const userPartner = user.partnerId ? partners[user.partnerId]?.name : undefined

    const tasks: Array<{
      iterationId: string
      displayId: string
      machineName: string
      nodeId: string
      nodeLabel: string
      partner?: string
      startedAt?: string
      claimed: boolean
    }> = []

    for (const it of iterationList) {
      if (it.status !== IterationStatus.RUNNING) continue
      const machine = machines[it.machineId]
      if (!machine) continue
      const nodes = nodeStatuses[it.id]
      if (!nodes) continue

      for (const ns of Object.values(nodes)) {
        const isPending = ns.status === NodeStatus.PENDING
        const isRunningByMe =
          ns.status === NodeStatus.RUNNING &&
          (ns.claimedBy === user.email || (!!userPartner && ns.claimedBy === userPartner))

        if (!isPending && !isRunningByMe) continue
        const node = machine.nodes.find((n) => n.id === ns.nodeId)
        if (!node) continue

        // Multi-partner aware: the node may list several responsible partners.
        const nodePartners = new Set<string>(
          [node.responsiblePartner, ...((node.responsiblePartnerIds ?? []).map((id) => partners[id]?.name ?? id))].filter(
            (x): x is string => !!x,
          ),
        )
        const assignedToUser =
          (!!userPartner && nodePartners.has(userPartner)) ||
          ns.claimedBy === user.email ||
          (!!userPartner && ns.claimedBy === userPartner)

        if (!assignedToUser && !isAdmin) continue

        tasks.push({
          iterationId: it.id,
          displayId: it.displayId ?? it.id,
          machineName: it.machineName,
          nodeId: ns.nodeId,
          nodeLabel: node.label ?? node.name ?? node.id,
          partner: node.responsiblePartner,
          startedAt: ns.startedAt ?? it.createdAt,
          claimed: isRunningByMe,
        })
      }
    }
    return tasks.slice(0, 8)
  }, [iterationList, nodeStatuses, machines, user, partners, isAdmin])

  // ── Team performance (by partner) - staff only ────────────────────────────
  const teamPerformance = useMemo(() => {
    const byPartner: Record<string, { completed: number; inWork: number; totalDurationMs: number; completedCount: number }> = {}

    for (const it of iterationList) {
      const machine = machines[it.machineId]
      if (!machine) continue
      const nodes = nodeStatuses[it.id]
      if (!nodes) continue

      for (const ns of Object.values(nodes)) {
        const node = machine.nodes.find((n) => n.id === ns.nodeId)
        const partner = node?.responsiblePartner
        if (!partner) continue
        const entry = (byPartner[partner] ||= { completed: 0, inWork: 0, totalDurationMs: 0, completedCount: 0 })

        if (ns.status === NodeStatus.COMPLETED) {
          entry.completed++
          if (ns.startedAt && ns.completedAt) {
            entry.totalDurationMs += new Date(ns.completedAt).getTime() - new Date(ns.startedAt).getTime()
            entry.completedCount++
          }
        } else if (ns.status === NodeStatus.RUNNING || ns.status === NodeStatus.PENDING) {
          entry.inWork++
        }
      }
    }

    return Object.entries(byPartner)
      .map(([partner, v]) => ({
        partner,
        completed: v.completed,
        inWork: v.inWork,
        avgDurationMs: v.completedCount > 0 ? v.totalDurationMs / v.completedCount : null,
      }))
      .sort((a, b) => b.completed + b.inWork - (a.completed + a.inWork))
      .slice(0, 6)
  }, [iterationList, nodeStatuses, machines])

  // ── Active state machines ──────────────────────────────────────────────────────
  const activeStateMachines = useMemo(() => {
    return machineList
      // OPERATOR: only machines their partner is directly involved in.
      .filter((m) => !isOperator || machineInvolvesMe(m))
      .map((m) => {
        const iters = iterationList.filter((i) => i.machineId === m.id)
        const active = iters.filter((i) => i.status === IterationStatus.RUNNING).length
        const completedWeek = iters.filter((i) => {
          if (i.status !== IterationStatus.COMPLETED) return false
          const ca = i.completedAt ? new Date(i.completedAt).getTime() : 0
          return Date.now() - ca <= WEEK_MS
        }).length
        const lastActivity = iters.reduce((max, i) => {
          const t = new Date(i.completedAt ?? i.createdAt).getTime()
          return t > max ? t : max
        }, 0)
        return { machine: m, active, completedWeek, lastActivity }
      })
      .filter((e) => e.active > 0 || e.completedWeek > 0)
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .slice(0, 5)
  }, [machineList, iterationList, isOperator, machineInvolvesMe])

  // ── Recent activity ───────────────────────────────────────────────────────
  const recentActivity = useMemo(() => {
    // OPERATOR: only iterations their partner is directly involved in.
    const scoped = isOperator
      ? iterationList.filter((it) => machineInvolvesMe(machines[it.machineId]))
      : iterationList
    return scoped
      .slice()
      .sort((a, b) => {
        const aT = new Date(a.completedAt ?? a.createdAt).getTime()
        const bT = new Date(b.completedAt ?? b.createdAt).getTime()
        return bT - aT
      })
      .slice(0, 6)
  }, [iterationList, machines, isOperator, machineInvolvesMe])

  const hasData = iterationList.length > 0 || machineList.length > 0 || !!kpiData

  const roleTitle = isSuperadmin ? 'Platform Dashboard' : isOwner ? 'Operations Dashboard' : 'My Work'
  const partnerUploads: any[] = Array.isArray(meData?.recentUploads) ? meData.recentUploads : []

  return (
    <>
      <TopBar
        title={roleTitle}
        subtitle={
          partnerLabel
            ? `${user?.fullName ?? user?.email ?? ''} · ${partnerLabel}`
            : user?.fullName
              ? `Welcome back, ${user.fullName}`
              : 'Digital thread overview'
        }
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/machines')}>
              <LayoutGrid className="h-4 w-4 mr-1.5" />
              Browse Machines
            </Button>
            {canCreate && (
              <Button size="sm" onClick={() => navigate('/iterations')}>
                <Plus className="h-4 w-4 mr-1.5" />
                New Iteration
              </Button>
            )}
          </div>
        }
      />

      <div className="p-6 space-y-6">
        {!hasData ? (
          <EmptyDashboard onCreate={() => navigate('/machines')} />
        ) : (
          <>
            {/* ── Live operational KPIs (all roles) ──────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KpiCard icon={<Activity className="h-4 w-4" />} label="Running" value={kpis.running} accent="blue" description="Iterations in progress" />
              <KpiCard
                icon={<Hand className="h-4 w-4" />}
                label="Pending Manual"
                value={kpis.pendingManual}
                accent="amber"
                description="Nodes awaiting action"
                onClick={() => { if (blockedIterations[0]) navigate(`/iteration/${blockedIterations[0].iterationId}`) }}
              />
              <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Completed Today" value={kpis.completedToday} accent="emerald" description="Iterations finished today" />
              <KpiCard icon={<XCircle className="h-4 w-4" />} label="Failed (24h)" value={kpis.failed24h} accent={kpis.failed24h > 0 ? 'red' : 'muted'} description="Iterations failed last 24h" />
            </div>

            {/* ── SUPERADMIN: platform governance (unique to superadmin) ──── */}
            {isSuperadmin && meData?.kind === 'SUPERADMIN' && (
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <KpiCard
                  icon={<ShieldCheck className="h-4 w-4" />}
                  label="Pending Approvals"
                  value={meData.pendingApprovals ?? 0}
                  accent={meData.pendingApprovals > 0 ? 'amber' : 'muted'}
                  description="Governance queue"
                  onClick={meData.pendingApprovals > 0 ? () => navigate('/governance') : undefined}
                />
                <KpiCard icon={<Download className="h-4 w-4" />} label="Downloads (24h)" value={meData.accessLast24h ?? 0} accent="blue" description="File access events" />
                <ClassificationMixCard mix={meData.classificationMix ?? []} />
              </div>
            )}

            {/* ── Cross-phase KPIs (staff: SUPERADMIN + OWNER) ───────────── */}
            {isAdmin && kpiData && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Iterations (total)" value={String(kpiData.iterations?.total ?? 0)} />
                <StatCard
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  label="Success rate"
                  value={kpiData.iterations?.successRatePct != null ? `${kpiData.iterations.successRatePct}%` : '-'}
                  showBar={kpiData.iterations?.successRatePct != null}
                  barValue={kpiData.iterations?.successRatePct ?? 0}
                />
                <StatCard icon={<Clock className="h-4 w-4" />} label="Avg duration" value={kpiData.avgIterationDurationMs ? formatDuration(kpiData.avgIterationDurationMs) : '-'} />
                {/* <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Open NCs" value={String(kpiData.openNonConformances ?? 0)} onClick={() => navigate('/changes')} /> */}
                {/*<StatCard icon={<GitPullRequest className="h-4 w-4" />} label="Open CRs" value={String(kpiData.openChangeRequests ?? 0)} onClick={() => navigate('/changes')} />*/}
                <StatCard icon={<FileText className="h-4 w-4" />} label="Total files" value={String(kpiData.files?.total ?? 0)} onClick={() => navigate('/explorer')} />
              </div>
            )}

            {/* ── My Tasks - prominent for operators ──────────────────────── */}
            {myTasks.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Hand className="h-4 w-4 text-amber-400" />
                    {isAdmin && !isOwner ? 'Pending Manual Tasks' : isOwner ? 'My Partner’s Tasks' : 'My Tasks'}
                    <Badge variant="secondary" className="ml-1 text-[10px]">{myTasks.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {myTasks.map((t) => (
                    <button
                      key={`${t.iterationId}-${t.nodeId}`}
                      onClick={() => navigate(`/iteration/${t.iterationId}?highlight=${t.nodeId}`)}
                      className="w-full text-left flex items-center justify-between rounded-md border border-border/50 bg-muted/20 hover:border-amber-500/40 hover:bg-amber-500/5 transition-colors px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-400">
                          {t.claimed ? <Play className="h-3.5 w-3.5" /> : <Hand className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{t.nodeLabel}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {t.machineName} · <span className="font-mono">{t.displayId}</span>
                            {t.partner && ` · ${t.partner}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {t.claimed ? (
                          <Badge variant="secondary" className="text-[10px]">Claimed</Badge>
                        ) : (
                          <Badge className="text-[10px] bg-amber-500 text-black hover:bg-amber-500">Your Turn</Badge>
                        )}
                        {t.startedAt && <span className="text-[10px] text-muted-foreground tabular-nums">{formatRelative(t.startedAt)}</span>}
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* ── Active state machines + (staff: Blocked / partner: Recent) ───── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-3 flex-row items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-blue-400" />
                    Active State Machines
                  </CardTitle>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/machines')}>
                    View all
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </CardHeader>
                <CardContent className="pt-0">
                  {activeStateMachines.length === 0 ? (
                    <EmptyInline icon={<Activity className="h-4 w-4" />} text="No active iterations" />
                  ) : (
                    <div className="space-y-2">
                      {activeStateMachines.map(({ machine, active, completedWeek }) => (
                        <button
                          key={machine.id}
                          onClick={() => navigate(`/editor/${machine.id}`)}
                          className="w-full text-left flex items-center justify-between rounded-md border border-border/50 hover:border-blue-500/40 transition-colors px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold truncate">{machine.name}</p>
                            <p className="text-[10px] text-muted-foreground">{machine.nodes.length} nodes · v{machine.version}</p>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-[11px]">
                            {active > 0 && (
                              <span className="flex items-center gap-1 text-blue-400">
                                <Activity className="h-3 w-3" />
                                {active}
                              </span>
                            )}
                            {completedWeek > 0 && (
                              <span className="flex items-center gap-1 text-emerald-400">
                                <CheckCircle2 className="h-3 w-3" />
                                {completedWeek}/wk
                              </span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {isAdmin ? (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className={cn('h-4 w-4', blockedIterations.length > 0 ? 'text-amber-400' : 'text-muted-foreground')} />
                      Blocked Iterations
                      {blockedIterations.length > 0 && <Badge variant="secondary" className="ml-1 text-[10px]">{blockedIterations.length}</Badge>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {blockedIterations.length === 0 ? (
                      <EmptyInline icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} text="All iterations are on track" />
                    ) : (
                      <div className="space-y-2">
                        {blockedIterations.map((b) => (
                          <button
                            key={b.iterationId}
                            onClick={() => navigate(`/iteration/${b.iterationId}`)}
                            className="w-full text-left rounded-md border border-border/50 hover:border-amber-500/40 transition-colors px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-mono truncate">{b.displayId}</span>
                              <span className="text-[10px] text-amber-400 tabular-nums shrink-0">{formatDuration(b.durationMs)} blocked</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {b.machineName} · blocked at <span className="text-foreground/80">{b.blockedNodeLabel}</span>
                              {b.blockedPartner && ` · ${b.blockedPartner}`}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      Recent Activity
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <RecentList items={recentActivity} onClick={(id) => navigate(`/iteration/${id}`)} />
                  </CardContent>
                </Card>
              )}
            </div>

            {/* ── Team performance + recent iterations (staff only) ───────── */}
            {isAdmin && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="h-4 w-4 text-violet-400" />
                      Team Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {teamPerformance.length === 0 ? (
                      <EmptyInline icon={<Users className="h-4 w-4" />} text="No partner activity yet" />
                    ) : (
                      <div className="space-y-1.5">
                        {teamPerformance.map((t) => (
                          <div key={t.partner} className="flex items-center justify-between rounded-md px-3 py-2 bg-muted/20">
                            <span className="text-xs font-semibold">{t.partner}</span>
                            <div className="flex items-center gap-4 text-[11px] tabular-nums">
                              <span className="flex items-center gap-1 text-emerald-400" title="Completed nodes">
                                <CheckCircle2 className="h-3 w-3" />
                                {t.completed}
                              </span>
                              <span className="flex items-center gap-1 text-amber-400" title="In progress / pending">
                                <Hourglass className="h-3 w-3" />
                                {t.inWork}
                              </span>
                              <span className="text-muted-foreground min-w-[3.5rem] text-right" title="Average task duration">
                                {t.avgDurationMs !== null ? formatDuration(t.avgDurationMs) : '-'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      Recent Iterations
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <ScrollArea className="h-[240px]">
                      <RecentList items={recentActivity} onClick={(id) => navigate(`/iteration/${id}`)} />
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ── OPERATOR: recent uploads (unique to partner) ─────────────── */}
            {isOperator && partnerUploads.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    Recent Uploads
                    <Badge variant="secondary" className="ml-1 text-[10px]">{partnerUploads.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1.5">
                    {partnerUploads.slice(0, 8).map((f: any) => (
                      <button
                        key={f.id}
                        onClick={() => navigate('/explorer')}
                        className="w-full text-left flex items-center justify-between rounded-md hover:bg-muted/40 transition-colors px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      >
                        <span className="text-xs font-mono truncate min-w-0">{f.filename}</span>
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 ml-3">
                          {(f.sizeBytes / 1024).toFixed(1)} KB · {formatRelative(f.timestamp)}
                        </span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ── 14-day iteration trend (staff only - hidden for OPERATOR) ─ */}
            {!isOperator && trend.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-muted-foreground" />
                    14-day Iteration Trend
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-7 gap-2">
                    {trend.map((d: any) => (
                      <div key={d.date} className="rounded-md bg-muted/30 p-2 text-center">
                        <p className="text-[10px] text-muted-foreground">{String(d.date).slice(5)}</p>
                        <p className="text-sm font-semibold tabular-nums">{(d.completed ?? 0) + (d.failed ?? 0) + (d.running ?? 0)}</p>
                        <div className="flex justify-center gap-1 mt-1">
                          {d.completed > 0 && <Badge className="text-[8px] px-1 bg-emerald-500/80 hover:bg-emerald-500/80">{d.completed}</Badge>}
                          {d.running > 0 && <Badge variant="secondary" className="text-[8px] px-1">{d.running}</Badge>}
                          {d.failed > 0 && <Badge variant="destructive" className="text-[8px] px-1">{d.failed}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-3 text-[10px] text-muted-foreground">
                    <span><Badge className="text-[8px] px-1 mr-1 bg-emerald-500/80 hover:bg-emerald-500/80">N</Badge> completed</span>
                    <span><Badge variant="secondary" className="text-[8px] px-1 mr-1">N</Badge> running</span>
                    <span><Badge variant="destructive" className="text-[8px] px-1 mr-1">N</Badge> failed</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

const ACCENT_CLASSES = {
  blue: { border: 'border-blue-500/20', text: 'text-blue-400', bg: 'bg-blue-500/10' },
  amber: { border: 'border-amber-500/20', text: 'text-amber-400', bg: 'bg-amber-500/10' },
  emerald: { border: 'border-emerald-500/20', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  red: { border: 'border-red-500/20', text: 'text-red-400', bg: 'bg-red-500/10' },
  muted: { border: 'border-border/60', text: 'text-muted-foreground', bg: 'bg-muted/30' },
} as const

type Accent = keyof typeof ACCENT_CLASSES

function KpiCard({
  icon,
  label,
  value,
  accent,
  description,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: number
  accent: Accent
  description?: string
  onClick?: () => void
}) {
  const cls = ACCENT_CLASSES[accent]
  const content = (
    <>
      <div className="flex items-center justify-between">
        <div className={cn('flex h-8 w-8 items-center justify-center rounded-md', cls.bg, cls.text)}>{icon}</div>
        <span className={cn('text-3xl font-bold tabular-nums', cls.text)}>{value}</span>
      </div>
      <div>
        <p className="text-xs font-semibold text-foreground">{label}</p>
        {description && <p className="text-[10px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </>
  )

  if (onClick && value > 0) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'rounded-lg border bg-card p-4 flex flex-col gap-3 text-left transition-colors hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring',
          cls.border,
        )}
      >
        {content}
      </button>
    )
  }

  return <div className={cn('rounded-lg border bg-card p-4 flex flex-col gap-3', cls.border)}>{content}</div>
}

function StatCard({
  icon,
  label,
  value,
  showBar,
  barValue,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  value: string
  showBar?: boolean
  barValue?: number
  onClick?: () => void
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
          {icon}
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {showBar && <Progress value={barValue ?? 0} className="h-1.5 mt-2" />}
    </>
  )
  if (onClick) {
    return (
      <button onClick={onClick} className="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring">
        {inner}
      </button>
    )
  }
  return <div className="rounded-lg border bg-card p-4">{inner}</div>
}

function ClassificationMixCard({ mix }: { mix: Array<{ classification: string; count: number }> }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">Files by classification</p>
      <div className="space-y-1.5">
        {mix.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No files yet</p>
        ) : (
          mix.map((c) => (
            <div key={c.classification} className="flex items-center justify-between text-xs">
              <Badge variant="outline" className="text-[10px]">{c.classification}</Badge>
              <span className="font-mono font-semibold">{c.count}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function RecentList({
  items,
  onClick,
}: {
  items: Array<{ id: string; displayId: string; machineName: string; status: IterationStatus; createdAt: string; completedAt?: string }>
  onClick: (id: string) => void
}) {
  if (items.length === 0) {
    return <EmptyInline icon={<Clock className="h-4 w-4" />} text="No recent iterations" />
  }
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onClick(it.id)}
          className="w-full text-left flex items-center justify-between rounded-md hover:bg-muted/40 transition-colors px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <StatusBadge status={it.status} />
            <div className="min-w-0">
              <p className="text-xs font-mono truncate">{it.displayId}</p>
              <p className="text-[10px] text-muted-foreground truncate">{it.machineName}</p>
            </div>
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{formatRelative(it.completedAt ?? it.createdAt)}</span>
        </button>
      ))}
    </div>
  )
}

function StatusBadge({ status }: { status: IterationStatus }) {
  const map: Record<IterationStatus, { icon: React.ReactNode; cls: string; label: string }> = {
    [IterationStatus.DRAFT]: { icon: <Clock className="h-3 w-3" />, cls: 'bg-muted/40 text-muted-foreground border-border', label: 'DRAFT' },
    [IterationStatus.RUNNING]: { icon: <Activity className="h-3 w-3" />, cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30', label: 'RUNNING' },
    [IterationStatus.COMPLETED]: { icon: <CheckCircle2 className="h-3 w-3" />, cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label: 'COMPLETED' },
    [IterationStatus.FAILED]: { icon: <XCircle className="h-3 w-3" />, cls: 'bg-red-500/15 text-red-400 border-red-500/30', label: 'FAILED' },
  }
  const entry = map[status]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9px] font-bold tracking-wide', entry.cls)}>
      {entry.icon}
      {entry.label}
    </span>
  )
}

function EmptyInline({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 py-4 px-3 text-muted-foreground">
      {icon}
      <span className="text-xs">{text}</span>
    </div>
  )
}

function EmptyDashboard({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/10 text-blue-400 mb-4">
        <LayoutGrid className="h-7 w-7" />
      </div>
      <h2 className="text-base font-semibold mb-1">Welcome to Digital Thread</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">
        You don't have any state machines or iterations yet. Get started by creating your first workflow.
      </p>
      <Button onClick={onCreate}>
        <Plus className="h-4 w-4 mr-1.5" />
        Create your first state machine
      </Button>
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-2xl w-full">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  )
}
