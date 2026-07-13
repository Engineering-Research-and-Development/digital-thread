import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  Upload,
  Server,
  Pencil,
  Trash2,
  Play,
  Clock,
  Tag,
  Loader2,
  Search,
  X,
  Activity,
  CheckCircle2,
  XCircle,
  Download,
  BookOpen,
} from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useMachineStore } from '@/stores/machine-store'
import { useIterationStore } from '@/stores/iteration-store'
import { useAuthStore } from '@/stores/auth-store'
import { canAuthorWorkflows, canStartIteration } from '@/lib/roles'
import { useLinkedFieldIssues } from '@/hooks/use-field-issues'
import { api } from '@/lib/api'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { IterationStatus } from '@/types/enums'
import type { Iteration } from '@/types/state-machine'

export function StateMachineLibrary() {
  const { machines, addMachine, deleteMachine, loading: machineLoading } = useMachineStore()
  const { iterations, init: initIterations, loading: iterLoading } = useIterationStore()
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)
  const canEdit = canAuthorWorkflows(role)
  const canCreateIter = canStartIteration(role)
  const confirm = useConfirm()
  const [importOpen, setImportOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importType, setImportType] = useState<'aml' | 'dtdl' | 'aas' | null>(null)
  const [importing, setImporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  // useLinkedFieldIssues was used by the now-removed "Recent Iterations" block.
  // Kept here only to preload the cache for the dedicated /iterations page.
  useLinkedFieldIssues()

  // Load iterations list on mount
  useEffect(() => {
    if (Object.keys(iterations).length === 0) {
      initIterations()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const machineList = Object.values(machines)

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const m of machineList) for (const t of m.tags) set.add(t)
    return Array.from(set).sort()
  }, [machineList])

  const filteredMachines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return machineList.filter((m) => {
      if (activeTag && !m.tags.includes(activeTag)) return false
      if (!q) return true
      return (
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
      )
    })
  }, [machineList, searchQuery, activeTag])

  const handleNewMachine = async () => {
    if (!newName.trim()) return
    try {
      const machine = await addMachine({
        name: newName,
        version: '0.1.0',
        description: newDesc,
        nodes: [],
        edges: [],
        tags: [],
      })
      setNewOpen(false)
      setNewName('')
      setNewDesc('')
      toast.success(`Machine "${machine.name}" created`)
      navigate(`/editor/${machine.id}`)
    } catch (e: any) {
      toast.error(`Failed to create machine: ${e?.message ?? 'unknown error'}`)
    }
  }

  // Always route to the owner/product-aware new-iteration dialog on the
  // Iterations page (pre-targeted to this machine via `?machineId=…&new=1`).
  // The old inline quick-run dialog (no product/owner selection) was removed.
  const openStartIterationDialog = (machineId: string) => {
    navigate(`/iterations?machineId=${encodeURIComponent(machineId)}&new=1`)
  }

  const handleDeleteMachine = async (machine: { id: string; name: string }) => {
    const iterationCount = Object.values(iterations).filter((i) => i.machineId === machine.id).length
    const ok = await confirm({
      title: `Delete state machine "${machine.name}"?`,
      description: iterationCount > 0 ? (
        <>
          This will also delete <strong>{iterationCount} associated iteration{iterationCount === 1 ? '' : 's'}</strong> and
          their execution history. This action cannot be undone.
        </>
      ) : (
        <>This machine has no iterations. This action cannot be undone.</>
      ),
      confirmLabel: 'Delete machine',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteMachine(machine.id)
      toast.success(`Machine "${machine.name}" deleted`)
    } catch (e: any) {
      toast.error(`Failed to delete machine: ${e?.message ?? 'unknown error'}`)
    }
  }

  const getIterationCount = (machineId: string) =>
    Object.values(iterations).filter((i) => i.machineId === machineId).length

  const getActiveIterationCount = (machineId: string) =>
    Object.values(iterations).filter(
      (i) => i.machineId === machineId && i.status === IterationStatus.RUNNING,
    ).length

  const getLastIteration = (machineId: string): Iteration | null => {
    let latest: Iteration | null = null
    let latestTs = 0
    for (const it of Object.values(iterations)) {
      if (it.machineId !== machineId) continue
      const ts = new Date(it.completedAt ?? it.createdAt).getTime()
      if (ts > latestTs) {
        latestTs = ts
        latest = it
      }
    }
    return latest
  }

  // Import from standard file
  const handleImportFile = async () => {
    if (!importFile || !importType) return
    setImporting(true)
    try {
      const text = await importFile.text()
      let machine: any
      if (importType === 'aml') {
        machine = await api.standards.importAml({ xml: text })
      } else if (importType === 'dtdl') {
        machine = await api.standards.importDtdl(JSON.parse(text))
      } else if (importType === 'aas') {
        machine = await api.standards.importAas(JSON.parse(text))
      }
      if (machine?.id) {
        await useMachineStore.getState().init()
        toast.success(`Imported "${machine.name ?? 'workflow'}" successfully`)
        navigate(`/editor/${machine.id}`)
      }
      setImportOpen(false)
      setImportFile(null)
      setImportType(null)
    } catch (e: any) {
      toast.error(`Import failed: ${e?.message ?? 'unknown error'}`)
    } finally {
      setImporting(false)
    }
  }

  const isLoading = machineLoading || iterLoading
  const hasFilter = searchQuery.length > 0 || activeTag !== null

  return (
    <>
      <TopBar
        title="State Machine Library"
        subtitle="Manage your digital thread workflows"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Machine
            </Button>
          </div>
        }
      />
      <div className="p-6">
        {/* Search + tag filters */}
        {machineList.length > 0 && (
          <div className="mb-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
                <Input
                  type="search"
                  placeholder="Search machines by name, description or tag..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-8 h-9"
                  aria-label="Search state machines"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                    type="button"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {filteredMachines.length} of {machineList.length}
              </span>
            </div>
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tags:</span>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                    className={cn(
                      'text-[10px] px-2 py-0.5 rounded-md border transition-colors',
                      activeTag === tag
                        ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                        : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                    )}
                    type="button"
                  >
                    {tag}
                  </button>
                ))}
                {activeTag && (
                  <button
                    onClick={() => setActiveTag(null)}
                    className="text-[10px] text-muted-foreground hover:text-foreground underline"
                    type="button"
                  >
                    clear
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm mb-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredMachines.map((machine) => {
            const activeCount = getActiveIterationCount(machine.id)
            const lastIteration = getLastIteration(machine.id)
            return (
            <Card key={machine.id} className="border-border hover:border-blue-500/50 transition-colors">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-sm truncate" title={machine.name}>{machine.name}</CardTitle>
                    <CardDescription className="text-xs mt-1 line-clamp-2">{machine.description}</CardDescription>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className="text-[10px]">
                      v{machine.version}
                    </Badge>
                    {activeCount > 0 && (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse"
                        title={`${activeCount} iteration${activeCount === 1 ? '' : 's'} currently running`}
                      >
                        <Activity className="h-2.5 w-2.5 mr-0.5" aria-hidden="true" />
                        {activeCount} live
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1 tabular-nums" title="Number of nodes">
                    <Tag className="h-3 w-3" aria-hidden="true" />
                    {machine.nodes.length} nodes
                  </span>
                  <span className="flex items-center gap-1 tabular-nums" title="Number of iterations">
                    <Play className="h-3 w-3" aria-hidden="true" />
                    {getIterationCount(machine.id)} iterations
                  </span>
                  <span className="flex items-center gap-1" title={`Updated ${new Date(machine.updatedAt).toLocaleString()}`}>
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {new Date(machine.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                {lastIteration && (
                  <button
                    onClick={() => navigate(`/iteration/${lastIteration.id}`)}
                    className="mt-2 w-full flex items-center justify-between rounded-md border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    title="Open last iteration"
                    type="button"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <LastIterationStatusIcon status={lastIteration.status} />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Last:</span>
                      <span className="text-[11px] font-mono truncate">{lastIteration.displayId}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatRelative(lastIteration.completedAt ?? lastIteration.createdAt)}
                    </span>
                  </button>
                )}
                {machine.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {machine.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
              <CardFooter className="gap-2 pt-0">
                {canEdit && (
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate(`/editor/${machine.id}`)}>
                    <Pencil className="h-3 w-3 mr-1" aria-hidden="true" />
                    Edit
                  </Button>
                )}
                {canCreateIter && (
                  <Button size="sm" className="flex-1" onClick={() => openStartIterationDialog(machine.id)}>
                    <Play className="h-3 w-3 mr-1" aria-hidden="true" />
                    New Iteration
                  </Button>
                )}
                {!canEdit && !canCreateIter && (
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => navigate(`/editor/${machine.id}`)}>
                    View
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteMachine(machine)}
                    aria-label={`Delete machine ${machine.name}`}
                    title="Delete machine"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                )}
              </CardFooter>
            </Card>
          )})}

          {!isLoading && machineList.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Server className="h-12 w-12 mb-4 opacity-50" aria-hidden="true" />
              <p className="text-sm">No state machines defined yet</p>
              <p className="text-xs">Create one or import from AAS/DTDL</p>
            </div>
          )}

          {!isLoading && machineList.length > 0 && filteredMachines.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Search className="h-8 w-8 mb-3 opacity-50" aria-hidden="true" />
              <p className="text-sm">No machines match your filters</p>
              {hasFilter && (
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => { setSearchQuery(''); setActiveTag(null) }}
                  className="mt-1"
                >
                  Clear filters
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Iterations have moved to a dedicated page - see /iterations. The
            machine cards above still show count + last iteration as quick refs. */}
      </div>

      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Workflow</DialogTitle>
            <DialogDescription>
              Import a state machine definition from DTDL or AAS format.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {/* <Button
              variant={importType === 'aml' ? 'default' : 'outline'}
              className="w-full justify-start gap-2"
              onClick={() => setImportType('aml')}
            >
              <Upload className="h-4 w-4" />
              AutomationML (.aml)
            </Button> */}
            <Button
              variant={importType === 'dtdl' ? 'default' : 'outline'}
              className="w-full justify-start gap-2"
              onClick={() => setImportType('dtdl')}
            >
              <Upload className="h-4 w-4" />
              DTDL (.json)
            </Button>
            <Button
              variant={importType === 'aas' ? 'default' : 'outline'}
              className="w-full justify-start gap-2"
              onClick={() => setImportType('aas')}
            >
              <Server className="h-4 w-4" />
              AAS (.json)
            </Button>

            {importType && (
              <>
                <ImportFormatHint
                  format={importType}
                  showDocsLink={canEdit}
                  onNavigateDocs={() => { setImportOpen(false); navigate('/docs/standards') }}
                />
                <div className="mt-2">
                  <Input
                    type="file"
                    accept={importType === 'aml' ? '.aml,.xml' : '.json'}
                    onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportOpen(false); setImportType(null); setImportFile(null) }}>
              Cancel
            </Button>
            <Button onClick={handleImportFile} disabled={!importFile || !importType || importing}>
              {importing ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Importing...</> : 'Import'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Machine Dialog */}
      <Dialog
        open={newOpen}
        onOpenChange={(o) => {
          setNewOpen(o)
          if (!o) { setNewName(''); setNewDesc('') }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New State Machine</DialogTitle>
            <DialogDescription>
              Create a new digital thread workflow definition. You'll be redirected to the editor to add nodes.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => { e.preventDefault(); handleNewMachine() }}
            className="space-y-4 py-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="new-machine-name" className="text-xs">
                Name <span className="text-red-500" aria-hidden="true">*</span>
                <span className="sr-only">required</span>
              </Label>
              <Input
                id="new-machine-name"
                placeholder="e.g., Fan Cowl Manufacturing v2"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                aria-required="true"
                autoFocus
                maxLength={80}
              />
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground">Shown in the library and in iteration headers</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{newName.length}/80</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-machine-desc" className="text-xs">Description</Label>
              <Textarea
                id="new-machine-desc"
                placeholder="Describe the workflow goal, key stakeholders, expected output..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                maxLength={500}
                rows={3}
              />
              <div className="flex justify-end">
                <span className="text-[10px] text-muted-foreground tabular-nums">{newDesc.length}/500</span>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!newName.trim()}>Create &amp; Edit</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function LastIterationStatusIcon({ status }: { status: IterationStatus }) {
  switch (status) {
    case IterationStatus.COMPLETED:
      return <CheckCircle2 className="h-3 w-3 text-emerald-400" aria-hidden="true" />
    case IterationStatus.RUNNING:
      return <Activity className="h-3 w-3 text-blue-400 animate-pulse" aria-hidden="true" />
    case IterationStatus.FAILED:
      return <XCircle className="h-3 w-3 text-red-400" aria-hidden="true" />
    case IterationStatus.DRAFT:
    default:
      return <Clock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
  }
}

const IMPORT_FORMAT_INFO: Record<'aas' | 'dtdl' | 'aml', { label: string; one_liner: string }> = {
  aas: {
    label: 'AAS',
    one_liner:
      'IEC 63278 - an AAS Shell with a "WorkflowDefinition" Submodel (one SubmodelElementCollection per node, one AnnotatedRelationship per edge).',
  },
  dtdl: {
    label: 'DTDL',
    one_liner:
      'DTDL v3 JSON-LD - a root Interface with one Component per node, a "flowsTo" Relationship, and an edgesJson Property for the edge list.',
  },
  aml: {
    label: 'AutomationML',
    one_liner:
      'IEC 62714 CAEX 3.0 - one SystemUnitClass per node type (RoleRequirements → DigitalThreadRoles/CATEGORY), InternalLink entries for edges inside the InstanceHierarchy.',
  },
}

function ImportFormatHint({
  format,
  showDocsLink,
  onNavigateDocs,
}: {
  format: 'aas' | 'dtdl' | 'aml'
  showDocsLink: boolean
  onNavigateDocs: () => void
}) {
  const [busy, setBusy] = useState(false)
  const info = IMPORT_FORMAT_INFO[format]

  const handleDownload = async () => {
    setBusy(true)
    try {
      await api.standards.downloadExample(format)
      toast.success(`Example ${info.label} downloaded`)
    } catch (e: any) {
      toast.error(`Download failed: ${e?.message ?? 'unknown error'}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2 rounded-md border border-border/60 bg-muted/30 p-2.5 space-y-2">
      <p className="text-[11px] text-muted-foreground leading-relaxed">{info.one_liner}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-[11px]"
          onClick={handleDownload}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
          Download example
        </Button>
        {showDocsLink && (
          <button
            type="button"
            onClick={onNavigateDocs}
            className="text-[11px] text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
          >
            <BookOpen className="h-3 w-3" />
            Open full docs →
          </button>
        )}
      </div>
    </div>
  )
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`
  return `${Math.round(diff / 86_400_000)}d ago`
}
