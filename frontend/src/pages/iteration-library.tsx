import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Activity, AlertTriangle, Box, Building2, CheckCircle2, Clock, Hash, History,
  Loader2, Play, PlayCircle, Plus, Search, X, XCircle,
} from 'lucide-react'
import { useIterationStore } from '@/stores/iteration-store'
import { useMachineStore } from '@/stores/machine-store'
import { usePartnerStore } from '@/stores/partner-store'
import { useAuthStore } from '@/stores/auth-store'
import { canStartIteration, ROLE } from '@/lib/roles'
import { useLinkedFieldIssues, hasOpenIssue, type FieldIssue } from '@/hooks/use-field-issues'
import { IterationStatus } from '@/types/enums'
import { api } from '@/lib/api'
import { countryLabel } from '@/data/countries'
import { toast } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import type { Iteration, Product } from '@/types/state-machine'

type StatusFilter = 'all' | IterationStatus
type SortKey = 'recent' | 'oldest' | 'machine' | 'status'

/**
 * Dedicated iteration library - promoted from a nested block under the State
 * Machine page to a first-class section so iterations have room to breathe.
 * Filters by status / machine / search, sortable, "New Iteration" action.
 */
export function IterationLibrary() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const iterations = useIterationStore((s) => s.iterations)
  const initIterations = useIterationStore((s) => s.init)
  const iterLoading = useIterationStore((s) => s.loading)
  const createIteration = useIterationStore((s) => s.createIteration)
  const machines = useMachineStore((s) => s.machines)
  const initMachines = useMachineStore((s) => s.init)
  const user = useAuthStore((s) => s.user)
  const role = user?.role
  const canCreate = canStartIteration(role)
  const isSuperadmin = role === ROLE.SUPERADMIN

  const partners = usePartnerStore((s) => s.partners)
  const initPartners = usePartnerStore((s) => s.init)

  const { byIteration: fieldIssuesByIteration } = useLinkedFieldIssues()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [machineFilter, setMachineFilter] = useState<string>('all')
  const [productFilter, setProductFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('recent')

  // Product registry (shared between the filter and the new-iteration dialog).
  const [products, setProducts] = useState<Product[]>([])

  // New-iteration dialog
  const [newIterOpen, setNewIterOpen] = useState(false)
  const [newIterMachineId, setNewIterMachineId] = useState<string>('')
  const [newIterOwnerPartnerId, setNewIterOwnerPartnerId] = useState<string>('')
  const [newIterProductId, setNewIterProductId] = useState<string>('')
  const [newIterComponentRef, setNewIterComponentRef] = useState('')
  const [newIterKnown, setNewIterKnown] = useState<Array<{ componentRef: string; iterationCount: number; lastSeenAt: string }>>([])
  const [creating, setCreating] = useState(false)
  // Inline product creation (urn + name).
  const [creatingProduct, setCreatingProduct] = useState(false)
  const [newProductUrn, setNewProductUrn] = useState('')
  const [newProductName, setNewProductName] = useState('')
  const [savingProduct, setSavingProduct] = useState(false)

  useEffect(() => { initIterations() }, [initIterations])
  useEffect(() => { initMachines() }, [initMachines])
  useEffect(() => { if (isSuperadmin) initPartners() }, [isSuperadmin, initPartners])

  // Load the product registry once for the filter + new-iteration selector.
  const loadProducts = async () => {
    try {
      const list = await api.products.list()
      setProducts(Array.isArray(list) ? (list as Product[]) : [])
    } catch {
      setProducts([])
    }
  }
  useEffect(() => { loadProducts() }, [])

  const machineList = useMemo(() => Object.values(machines).sort((a, b) => a.name.localeCompare(b.name)), [machines])
  const partnerList = useMemo(() => Object.values(partners).sort((a, b) => a.name.localeCompare(b.name)), [partners])
  const productList = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return Object.values(iterations).filter((it) => {
      if (statusFilter !== 'all' && it.status !== statusFilter) return false
      if (machineFilter !== 'all' && it.machineId !== machineFilter) return false
      if (productFilter !== 'all' && (it.product?.id ?? it.productId) !== productFilter) return false
      if (!q) return true
      return (
        it.displayId?.toLowerCase().includes(q) ||
        it.id.toLowerCase().includes(q) ||
        it.machineName?.toLowerCase().includes(q) ||
        it.product?.name?.toLowerCase().includes(q) ||
        it.ownerPartner?.name?.toLowerCase().includes(q) ||
        Object.values(it.metadata ?? {}).some((v) => String(v).toLowerCase().includes(q))
      )
    })
  }, [iterations, statusFilter, machineFilter, productFilter, search])

  const sorted = useMemo(() => {
    const list = [...filtered]
    switch (sortKey) {
      case 'oldest':
        list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        break
      case 'machine':
        list.sort((a, b) => a.machineName.localeCompare(b.machineName) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
      case 'status':
        list.sort((a, b) => statusRank(a.status) - statusRank(b.status))
        break
      case 'recent':
      default:
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    }
    return list
  }, [filtered, sortKey])

  // Status counters for the inline filter pills
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, DRAFT: 0, RUNNING: 0, COMPLETED: 0, FAILED: 0 }
    for (const it of Object.values(iterations)) {
      counts.all++
      counts[it.status] = (counts[it.status] ?? 0) + 1
    }
    return counts
  }, [iterations])

  const openNewDialog = async () => {
    setNewIterMachineId('')
    setNewIterOwnerPartnerId('')
    setNewIterProductId('')
    setNewIterComponentRef('')
    setCreatingProduct(false)
    setNewProductUrn('')
    setNewProductName('')
    setNewIterOpen(true)
    try {
      const known = await api.compliance.listComponents()
      setNewIterKnown(known)
    } catch {
      setNewIterKnown([])
    }
  }

  const submitNewIteration = async () => {
    if (!newIterMachineId) return
    // SUPERADMIN must pick an owning partner; OWNER's owner auto-resolves.
    if (isSuperadmin && !newIterOwnerPartnerId) {
      toast.error('Select an owning partner')
      return
    }
    const ref = newIterComponentRef.trim()
    const metadata = ref ? { componentRef: ref } : undefined
    setCreating(true)
    try {
      const id = await createIteration(newIterMachineId, {
        metadata,
        ownerPartnerId: isSuperadmin ? newIterOwnerPartnerId : undefined,
        productId: newIterProductId || undefined,
      })
      if (id) {
        toast.success(ref ? `Iteration started for ${ref}` : 'Iteration started')
        navigate(`/iteration/${id}`)
      }
      setNewIterOpen(false)
    } catch (e: any) {
      toast.error(`Failed to start iteration: ${e?.message ?? 'unknown error'}`)
    } finally {
      setCreating(false)
    }
  }

  // Inline product creation from within the new-iteration dialog. SUPERADMIN
  // creating a product needs an owning partner; the backend honours
  // ownerPartnerId for SUPERADMIN only and resolves OWNER to their own partner.
  const submitNewProduct = async () => {
    const urn = newProductUrn.trim()
    const name = newProductName.trim()
    if (!urn || !name) return
    if (isSuperadmin && !newIterOwnerPartnerId) {
      toast.error('Select an owning partner before creating a product')
      return
    }
    setSavingProduct(true)
    try {
      const created = await api.products.create({
        urn,
        name,
        ownerPartnerId: isSuperadmin ? newIterOwnerPartnerId : undefined,
      }) as Product
      setProducts((prev) => [created, ...prev.filter((p) => p.id !== created.id)])
      setNewIterProductId(created.id)
      setCreatingProduct(false)
      setNewProductUrn('')
      setNewProductName('')
      toast.success(`Product "${created.name}" created`)
    } catch (e: any) {
      toast.error(`Failed to create product: ${e?.message ?? 'unknown error'}`)
    } finally {
      setSavingProduct(false)
    }
  }

  // Deep-link from the State Machine Library: a SUPERADMIN starting an
  // iteration is routed here (the owner-aware dialog) pre-targeted to a machine
  // via `?machineId=…&new=1`. Open the dialog, preselect the machine, then
  // strip the params so a refresh/back doesn't re-trigger it.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return
    const mid = searchParams.get('machineId') ?? ''
    void openNewDialog().then(() => { if (mid) setNewIterMachineId(mid) })
    const next = new URLSearchParams(searchParams)
    next.delete('new')
    next.delete('machineId')
    setSearchParams(next, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasAnyFilter = search.length > 0 || statusFilter !== 'all' || machineFilter !== 'all' || productFilter !== 'all'

  return (
    <>
      <TopBar
        title="Iterations"
        subtitle="All in-flight and historical workflow executions"
        actions={
          canCreate ? (
            <Button size="sm" onClick={openNewDialog}>
              <Play className="h-4 w-4 mr-1" aria-hidden="true" />
              New iteration
            </Button>
          ) : undefined
        }
      />

      <div className="p-6 max-w-7xl mx-auto space-y-4">
        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <Input
              type="search"
              placeholder="Search by id, machine name, metadata…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-8 h-9"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Select value={machineFilter} onValueChange={setMachineFilter}>
            <SelectTrigger className="h-9 text-xs w-[220px]">
              <SelectValue placeholder="All machines" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All machines</SelectItem>
              {machineList.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="h-9 text-xs w-[200px]">
              <SelectValue placeholder="All products" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All products</SelectItem>
              {productList.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-9 text-xs w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent first</SelectItem>
              <SelectItem value="oldest">Oldest first</SelectItem>
              <SelectItem value="machine">By machine</SelectItem>
              <SelectItem value="status">By status</SelectItem>
            </SelectContent>
          </Select>

          <span className="text-xs text-muted-foreground tabular-nums ml-auto">
            {sorted.length} of {Object.keys(iterations).length}
          </span>
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusPill label="All" value="all" current={statusFilter} count={statusCounts.all} onClick={setStatusFilter} />
          <StatusPill label="Draft"     value={IterationStatus.DRAFT}     current={statusFilter} count={statusCounts.DRAFT}     onClick={setStatusFilter} className="text-muted-foreground" />
          <StatusPill label="Running"   value={IterationStatus.RUNNING}   current={statusFilter} count={statusCounts.RUNNING}   onClick={setStatusFilter} className="text-blue-300 border-blue-500/30" />
          <StatusPill label="Completed" value={IterationStatus.COMPLETED} current={statusFilter} count={statusCounts.COMPLETED} onClick={setStatusFilter} className="text-emerald-300 border-emerald-500/30" />
          <StatusPill label="Failed"    value={IterationStatus.FAILED}    current={statusFilter} count={statusCounts.FAILED}    onClick={setStatusFilter} className="text-red-300 border-red-500/30" />
          {hasAnyFilter && (
            <Button
              variant="link"
              size="sm"
              className="h-7 text-[11px]"
              onClick={() => { setSearch(''); setStatusFilter('all'); setMachineFilter('all'); setProductFilter('all') }}
            >
              Clear all
            </Button>
          )}
        </div>

        {iterLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading iterations…
          </div>
        )}

        {/* List of iterations */}
        <div className="space-y-2">
          {!iterLoading && sorted.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border border-dashed border-border rounded-md">
              <PlayCircle className="h-10 w-10 mb-3 opacity-50" aria-hidden="true" />
              {Object.keys(iterations).length === 0 ? (
                <>
                  <p className="text-sm">No iterations yet</p>
                  <p className="text-xs">Start one from a state machine to populate this list.</p>
                  {canCreate && (
                    <Button size="sm" className="mt-3" onClick={openNewDialog}>
                      <Play className="h-3.5 w-3.5 mr-1" />
                      Start an iteration
                    </Button>
                  )}
                </>
              ) : (
                <p className="text-sm">No iterations match your filters.</p>
              )}
            </div>
          )}

          {sorted.map((it) => (
            <IterationRow
              key={it.id}
              iteration={it}
              onOpen={(id) => navigate(`/iteration/${id}`)}
              fieldIssues={fieldIssuesByIteration[it.id] ?? []}
            />
          ))}
        </div>
      </div>

      {/* New iteration dialog */}
      <Dialog open={newIterOpen} onOpenChange={(o) => { if (!creating) setNewIterOpen(o) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new iteration</DialogTitle>
            <DialogDescription>
              Pick a state machine and optionally tag the run with a component reference (URN).
              Iterations sharing the same <code className="text-[11px]">componentRef</code> feed the same Component Passport.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); submitNewIteration() }}
            className="space-y-4 py-2"
          >
            <div className="space-y-1.5">
              <Label className="text-xs">State machine</Label>
              <Select value={newIterMachineId || '__pick'} onValueChange={(v) => setNewIterMachineId(v === '__pick' ? '' : v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select machine…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__pick" disabled>Select machine…</SelectItem>
                  {machineList.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      <div className="flex flex-col">
                        <span className="font-semibold">{m.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          v{m.version}{typeof m.latestVersion === 'number' ? ` · snapshot v${m.latestVersion}` : ''}
                          {m.nodes.length > 0 ? ` · ${m.nodes.length} nodes` : ''}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Owning partner */}
            {isSuperadmin ? (
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Owner (partner) <span className="text-red-500" aria-hidden="true">*</span>
                  <span className="sr-only">required</span>
                </Label>
                <Select value={newIterOwnerPartnerId || '__pick'} onValueChange={(v) => setNewIterOwnerPartnerId(v === '__pick' ? '' : v)}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select owning partner…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__pick" disabled>Select owning partner…</SelectItem>
                    {partnerList.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold">{p.name}</span>
                          {p.country && (
                            <span className="text-[10px] text-muted-foreground">{countryLabel(p.country)}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  The iteration is owned by this partner. Only their products can be attached below.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Owner</Label>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-2">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="text-xs font-semibold">{user?.partner?.name ?? '-'}</span>
                  {user?.partner?.country && (
                    <span className="text-[10px] text-muted-foreground">{countryLabel(user.partner.country)}</span>
                  )}
                </div>
              </div>
            )}

            {/* Product (optional) */}
            <div className="space-y-1.5">
              <Label className="text-xs">Product - optional</Label>
              {creatingProduct ? (
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-2.5">
                  <Input
                    placeholder="urn:digital-thread:product:wing-panel"
                    value={newProductUrn}
                    onChange={(e) => setNewProductUrn(e.target.value)}
                    className="h-8 text-xs"
                    aria-label="Product URN"
                  />
                  <Input
                    placeholder="Product name"
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="h-8 text-xs"
                    aria-label="Product name"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={submitNewProduct}
                      disabled={!newProductUrn.trim() || !newProductName.trim() || savingProduct}
                    >
                      {savingProduct ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
                      Create product
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={() => { setCreatingProduct(false); setNewProductUrn(''); setNewProductName('') }}
                      disabled={savingProduct}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Select value={newIterProductId || '__none'} onValueChange={(v) => setNewIterProductId(v === '__none' ? '' : v)}>
                    <SelectTrigger className="h-9 text-xs flex-1">
                      <SelectValue placeholder="No product" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">No product</SelectItem>
                      {productList.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          <div className="flex flex-col">
                            <span className="font-semibold">{p.name}</span>
                            <span className="text-[10px] text-muted-foreground font-mono">{p.urn}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 text-xs shrink-0"
                    onClick={() => { setCreatingProduct(true); setNewIterProductId('') }}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                    New
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="new-iter-ref" className="text-xs">Component reference (URN) - optional</Label>
              <Input
                id="new-iter-ref"
                placeholder="urn:digital-thread:component:wing-panel-42"
                value={newIterComponentRef}
                onChange={(e) => setNewIterComponentRef(e.target.value)}
                list="new-iter-known-refs"
              />
              <datalist id="new-iter-known-refs">
                {newIterKnown.map((c) => (
                  <option key={c.componentRef} value={c.componentRef}>
                    {c.iterationCount} iteration(s) - last {new Date(c.lastSeenAt).toLocaleDateString()}
                  </option>
                ))}
              </datalist>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewIterOpen(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" disabled={!newIterMachineId || (isSuperadmin && !newIterOwnerPartnerId) || creatingProduct || creating}>
                {creating ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
                Start iteration
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function statusRank(s: IterationStatus): number {
  // Sort order: RUNNING first, then DRAFT, then COMPLETED, then FAILED.
  return {
    [IterationStatus.RUNNING]: 0,
    [IterationStatus.DRAFT]: 1,
    [IterationStatus.COMPLETED]: 2,
    [IterationStatus.FAILED]: 3,
  }[s] ?? 9
}

function StatusPill({
  label, value, current, count, onClick, className,
}: {
  label: string
  value: StatusFilter
  current: StatusFilter
  count: number
  onClick: (v: StatusFilter) => void
  className?: string
}) {
  const active = current === value
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : cn('hover:border-foreground/30', className ?? 'text-foreground/80 border-border'),
      )}
    >
      <span className="font-semibold">{label}</span>
      <span className="text-[10px] tabular-nums opacity-70">{count}</span>
    </button>
  )
}

function IterationRow({
  iteration, onOpen, fieldIssues,
}: {
  iteration: Iteration
  onOpen: (id: string) => void
  fieldIssues: FieldIssue[]
}) {
  const status = iteration.status
  const issuesAlarm = hasOpenIssue(fieldIssues)
  return (
    <Card
      className="cursor-pointer hover:border-blue-500/50 transition-colors"
      onClick={() => onOpen(iteration.id)}
    >
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <StatusIcon status={status} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Hash className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-mono font-semibold">{iteration.displayId || iteration.id}</span>

            <Badge
              variant="outline"
              className={cn(
                'text-[10px] gap-1',
                status === IterationStatus.RUNNING && 'bg-blue-500/15 text-blue-400 border-blue-500/30',
                status === IterationStatus.COMPLETED && 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                status === IterationStatus.FAILED && 'bg-red-500/15 text-red-400 border-red-500/30',
                status === IterationStatus.DRAFT && 'text-muted-foreground',
              )}
            >
              {status}
            </Badge>

            <span className="text-xs text-muted-foreground truncate">{iteration.machineName}</span>

            {iteration.ownerPartner && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 text-sky-300 border-sky-500/30"
                title={`Owner: ${iteration.ownerPartner.name}${iteration.ownerPartner.country ? ` · ${countryLabel(iteration.ownerPartner.country)}` : ''}`}
              >
                <Building2 className="h-2.5 w-2.5" aria-hidden="true" />
                {iteration.ownerPartner.name}
              </Badge>
            )}

            {iteration.product && (
              <Badge
                variant="outline"
                className="text-[10px] gap-1 text-teal-300 border-teal-500/30"
                title={`Product: ${iteration.product.name} (${iteration.product.urn})`}
              >
                <Box className="h-2.5 w-2.5" aria-hidden="true" />
                {iteration.product.name}
              </Badge>
            )}

            {iteration.version && (
              <Badge variant="outline" className="text-[10px] gap-0.5 border-violet-500/30 text-violet-300">
                <History className="h-2.5 w-2.5" aria-hidden="true" />
                v{iteration.version.versionNumber}
              </Badge>
            )}

            {iteration.parentIterationId && (
              <Badge variant="outline" className="text-[10px] gap-0.5 text-muted-foreground">
                ← {iteration.parentIterationId}
              </Badge>
            )}

            {fieldIssues.length > 0 && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] gap-1',
                  issuesAlarm
                    ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                    : 'bg-muted/40 text-muted-foreground',
                )}
                title={
                  issuesAlarm
                    ? `${fieldIssues.filter((f) => f.status !== 'CLOSED').length} open field issue(s)`
                    : 'Linked field issues - all resolved'
                }
              >
                <AlertTriangle className="h-2.5 w-2.5" aria-hidden="true" />
                {fieldIssues.length} field issue{fieldIssues.length === 1 ? '' : 's'}
              </Badge>
            )}
          </div>

          {iteration.metadata && Object.keys(iteration.metadata).length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.entries(iteration.metadata).slice(0, 4).map(([k, v]) => (
                <span
                  key={k}
                  className="text-[10px] font-mono text-muted-foreground"
                  title={`${k}: ${v}`}
                >
                  <span className="text-muted-foreground/60">{k}=</span>
                  <span className="text-foreground/80">{String(v)}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="text-right shrink-0 text-xs text-muted-foreground">
          <div>{new Date(iteration.createdAt).toLocaleString()}</div>
          {iteration.completedAt && (
            <div className="text-[10px]">
              Completed {new Date(iteration.completedAt).toLocaleString()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StatusIcon({ status }: { status: IterationStatus }) {
  switch (status) {
    case IterationStatus.COMPLETED:
      return <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" aria-hidden="true" />
    case IterationStatus.RUNNING:
      return <Activity className="h-5 w-5 text-blue-400 animate-pulse shrink-0" aria-hidden="true" />
    case IterationStatus.FAILED:
      return <XCircle className="h-5 w-5 text-red-400 shrink-0" aria-hidden="true" />
    case IterationStatus.DRAFT:
    default:
      return <Clock className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />
  }
}
