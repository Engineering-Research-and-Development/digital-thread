import { useRef, useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Loader2, Check, CircleDot, Download, ChevronDown, History, Code2, Group as GroupIcon, Ungroup } from 'lucide-react'
import { Link } from 'react-router-dom'
import { JsonPreviewDialog } from '@/components/editor/json-preview-dialog'
import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NodePalette } from '@/components/editor/node-palette'
import { EditorCanvas, type EditorCanvasHandle } from '@/components/editor/editor-canvas'
import { NodePropertiesPanel } from '@/components/editor/node-properties-panel'
import { useMachineStore } from '@/stores/machine-store'
import { toast } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import type { FlowNodeDef, FlowEdgeDef, FlowGroupDef } from '@/types/state-machine'

// Palette of soft container colours cycled per new group.
const GROUP_COLORS = ['#6366F1', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6']

export function GraphicalEditor() {
  const { machineId } = useParams<{ machineId: string }>()
  const navigate = useNavigate()
  const { machines, loading, updateMachineGraph } = useMachineStore()
  const canvasRef = useRef<EditorCanvasHandle>(null)

  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  // Live working graph mirrored from the canvas - drives the properties panel.
  const [workingNodes, setWorkingNodes] = useState<FlowNodeDef[]>([])
  const [workingEdges, setWorkingEdges] = useState<FlowEdgeDef[]>([])
  // Live working groups + the "name this group" dialog state.
  const [workingGroups, setWorkingGroups] = useState<FlowGroupDef[]>([])
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [pendingGroupName, setPendingGroupName] = useState('')
  const [pendingGroupNodeIds, setPendingGroupNodeIds] = useState<string[]>([])
  // When set, the group dialog is renaming an existing group rather than creating one.
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
  const [jsonPreviewOpen, setJsonPreviewOpen] = useState(false)

  const machine = machineId ? machines[machineId] : undefined

  // Keyboard shortcut: Cmd/Ctrl+S
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        const saveFn = (window as unknown as Record<string, unknown>).__editorSave as (() => void) | undefined
        saveFn?.()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Warn before leaving with unsaved changes
  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const handleSave = useCallback(async (nodes: FlowNodeDef[], edges: FlowEdgeDef[], groups: FlowGroupDef[]) => {
    if (!machine) return
    setSaving(true)
    try {
      await updateMachineGraph(machine.id, nodes, edges, groups)
      setDirty(false)
      setLastSavedAt(Date.now())
      toast.success('Workflow saved')
    } catch (e: any) {
      toast.error(`Save failed: ${e?.message ?? 'unknown error'}`)
    } finally {
      setSaving(false)
    }
  }, [machine, updateMachineGraph])

  // Node edits and deletes mutate the canvas working graph; they are persisted
  // on Save (consistent with the dirty indicator), not on every keystroke.
  const handleUpdateNode = (nodeId: string, updates: Partial<FlowNodeDef>) => {
    canvasRef.current?.updateNodeData(nodeId, updates)
  }

  const handleDeleteNode = (nodeId: string) => {
    canvasRef.current?.deleteNode(nodeId)
    toast.success('Node removed - save to persist')
  }

  // ─── Visual node groups ─────────────────────────────────────────────────
  // "Group selected" opens a small dialog to name the group; on confirm we
  // create a FlowGroupDef from the selected node ids, stamp `groupId` onto each
  // member node, and replace the canvas group set. Persisted on Save.
  const handleGroupSelected = () => {
    const ids = canvasRef.current?.getSelectedNodeIds() ?? []
    if (ids.length < 1) {
      toast.error('Select one or more nodes on the canvas first')
      return
    }
    setEditingGroupId(null)
    setPendingGroupNodeIds(ids)
    setPendingGroupName(`Group ${(canvasRef.current?.getGroups().length ?? 0) + 1}`)
    setGroupDialogOpen(true)
  }

  // Rename an existing group (triggered by clicking the group's title on the canvas).
  const handleEditGroup = (groupId: string) => {
    const g = canvasRef.current?.getGroups().find((x) => x.id === groupId)
    if (!g) return
    setEditingGroupId(groupId)
    setPendingGroupNodeIds([])
    setPendingGroupName(g.name)
    setGroupDialogOpen(true)
  }

  const confirmGroup = () => {
    const name = pendingGroupName.trim() || 'Group'
    // Rename mode - just update the existing group's name.
    if (editingGroupId) {
      const existing = canvasRef.current?.getGroups() ?? []
      canvasRef.current?.setGroups(existing.map((g) => (g.id === editingGroupId ? { ...g, name } : g)))
      setGroupDialogOpen(false)
      setEditingGroupId(null)
      toast.success('Group renamed - save to persist')
      return
    }
    const ids = pendingGroupNodeIds
    if (ids.length === 0) {
      setGroupDialogOpen(false)
      return
    }
    const existing = canvasRef.current?.getGroups() ?? []
    const groupId = `grp-${Date.now()}`
    const color = GROUP_COLORS[existing.length % GROUP_COLORS.length]
    const newGroup: FlowGroupDef = { id: groupId, name, color, nodeIds: ids }
    // Drop these node ids from any prior group (a node lives in one group), then
    // add the new group. Prune groups left empty.
    const next = existing
      .map((g) => ({ ...g, nodeIds: g.nodeIds.filter((id) => !ids.includes(id)) }))
      .filter((g) => g.nodeIds.length > 0)
    canvasRef.current?.setGroups([...next, newGroup])
    // Stamp groupId onto each member node for round-trip on save.
    for (const id of ids) {
      canvasRef.current?.updateNodeData(id, { groupId })
    }
    setGroupDialogOpen(false)
    setPendingGroupNodeIds([])
    toast.success(`Grouped ${ids.length} node${ids.length === 1 ? '' : 's'} - save to persist`)
  }

  // Ungroup: remove any group that contains a currently-selected node (or, if
  // nothing is selected, prompt that there's nothing to ungroup) and clear the
  // `groupId` of the affected member nodes.
  const handleUngroupSelected = () => {
    const selected = canvasRef.current?.getSelectedNodeIds() ?? []
    const existing = canvasRef.current?.getGroups() ?? []
    const targetGroups =
      selected.length > 0
        ? existing.filter((g) => g.nodeIds.some((id) => selected.includes(id)))
        : existing
    if (targetGroups.length === 0) {
      toast.error('No group to ungroup')
      return
    }
    const removedIds = new Set(targetGroups.map((g) => g.id))
    const affectedNodeIds = targetGroups.flatMap((g) => g.nodeIds)
    canvasRef.current?.setGroups(existing.filter((g) => !removedIds.has(g.id)))
    for (const id of affectedNodeIds) {
      canvasRef.current?.updateNodeData(id, { groupId: undefined })
    }
    toast.success(`Ungrouped ${targetGroups.length} group${targetGroups.length === 1 ? '' : 's'} - save to persist`)
  }

  const handleBack = () => {
    if (dirty) {
      if (!window.confirm('You have unsaved changes. Leave without saving?')) return
    }
    navigate('/machines')
  }

  // Export to AAS / DTDL / AML via existing /api/v1/{aas,dtdl,aml}/machines/:id.
  const exportMachine = useCallback(
    async (format: 'aas' | 'dtdl' | 'aml') => {
      if (!machine) return
      try {
        let body: string
        let filename: string
        let mime: string
        if (format === 'aas') {
          const json = await api.standards.exportAas(machine.id)
          body = JSON.stringify(json, null, 2)
          filename = `${machine.name.replace(/\s+/g, '_')}.aas.json`
          mime = 'application/json'
        } else if (format === 'dtdl') {
          const json = await api.standards.exportDtdl(machine.id)
          body = JSON.stringify(json, null, 2)
          filename = `${machine.name.replace(/\s+/g, '_')}.dtdl.json`
          mime = 'application/json'
        } else {
          body = await api.standards.exportAml(machine.id)
          filename = `${machine.name.replace(/\s+/g, '_')}.aml`
          mime = 'application/xml'
        }
        const blob = new Blob([body], { type: mime })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
        toast.success(`Exported ${filename}`)
      } catch (e: any) {
        toast.error(`Export failed: ${e?.message ?? 'unknown error'}`)
      }
    },
    [machine],
  )

  if (loading && !machine) {
    return (
      <>
        <TopBar title="Editor" subtitle="Loading..." />
        <div className="flex items-center justify-center h-[80vh] text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" aria-hidden="true" />
          <span className="text-sm">Loading state machine...</span>
        </div>
      </>
    )
  }

  if (!machine) {
    return (
      <>
        <TopBar title="Editor" subtitle="Machine not found" />
        <div className="flex items-center justify-center h-[80vh] text-muted-foreground">
          <p>State machine not found. <Button variant="link" onClick={() => navigate('/machines')}>Go back</Button></p>
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar
        title={machine.name}
        subtitle={`Graphical Editor - v${machine.version}`}
        actions={
          <div className="flex items-center gap-2">
            {/* Show the latest immutable version. On Save we auto-bump this;
                iterations launched after the save will be pinned to the new
                version, while running ones stay on theirs. */}
            {typeof machine.latestVersion === 'number' && (
              <Link
                to={`/machines/${machine.id}/versions`}
                className="inline-flex items-center gap-1 rounded-md border border-violet-500/30 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-300 hover:bg-violet-500/20 transition-colors"
                title={`Editing latest snapshot (v${machine.latestVersion}). Every save creates a new immutable version. Click to see history.`}
              >
                <History className="h-3 w-3" aria-hidden="true" />
                <span>v{machine.latestVersion}</span>
                {dirty && <span className="text-[9px] text-violet-400/70 font-normal">→ v{machine.latestVersion + 1}</span>}
              </Link>
            )}
            <SaveIndicator dirty={dirty} saving={saving} lastSavedAt={lastSavedAt} />
            <Button variant="ghost" size="sm" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
              Back
            </Button>

            {/* Visual node groups */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleGroupSelected}
              title="Group the selected canvas nodes into a labelled visual container"
            >
              <GroupIcon className="h-4 w-4 mr-1" aria-hidden="true" />
              Group
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUngroupSelected}
              disabled={workingGroups.length === 0}
              title="Remove the group(s) containing the selected nodes"
            >
              <Ungroup className="h-4 w-4 mr-1" aria-hidden="true" />
              Ungroup
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setJsonPreviewOpen(true)}
              title="Preview the internal Digital Thread JSON representation"
            >
              <Code2 className="h-4 w-4 mr-1" aria-hidden="true" />
              View JSON
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" title="Export this state machine">
                  <Download className="h-4 w-4 mr-1" aria-hidden="true" />
                  Export
                  <ChevronDown className="h-3 w-3 ml-1 opacity-70" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Standards-compliant export
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => exportMachine('aas')}>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">AAS (Asset Administration Shell)</span>
                    <span className="text-[10px] text-muted-foreground">IEC 63278 · JSON</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportMachine('dtdl')}>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">DTDL v3</span>
                    <span className="text-[10px] text-muted-foreground">Microsoft / Azure ADT · JSON-LD</span>
                  </div>
                </DropdownMenuItem>
                {/* <DropdownMenuItem onSelect={() => exportMachine('aml')}>
                  <div className="flex flex-col">
                    <span className="text-xs font-semibold">AutomationML</span>
                    <span className="text-[10px] text-muted-foreground">IEC 62714 · CAEX XML</span>
                  </div>
                </DropdownMenuItem> */}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button
              size="sm"
              onClick={() => {
                const saveFn = (window as unknown as Record<string, unknown>).__editorSave as (() => void) | undefined
                saveFn?.()
              }}
              disabled={saving || !dirty}
              title={dirty ? 'Save changes (Ctrl+S)' : 'No changes to save'}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4 mr-1" aria-hidden="true" />
              )}
              Save
            </Button>
          </div>
        }
      />
      <div className="flex flex-1 overflow-hidden" style={{ height: 'calc(100vh - 3.5rem)' }}>
        <NodePalette />
        <EditorCanvas
          ref={canvasRef}
          initialNodes={machine.nodes}
          initialEdges={machine.edges}
          initialGroups={machine.groups}
          onSave={handleSave}
          onDirtyChange={setDirty}
          onWorkingNodesChange={setWorkingNodes}
          onWorkingEdgesChange={setWorkingEdges}
          onWorkingGroupsChange={setWorkingGroups}
          onEditGroup={handleEditGroup}
        />
        <NodePropertiesPanel
          nodes={workingNodes}
          edges={workingEdges}
          onDeleteNode={handleDeleteNode}
          onUpdateNode={handleUpdateNode}
        />
      </div>

      <JsonPreviewDialog
        open={jsonPreviewOpen}
        onOpenChange={setJsonPreviewOpen}
        machine={machine}
        nodes={workingNodes.length > 0 ? workingNodes : machine.nodes}
        edges={workingEdges.length > 0 ? workingEdges : machine.edges}
      />

      {/* Name a new visual group / rename an existing one */}
      <Dialog open={groupDialogOpen} onOpenChange={(o) => { setGroupDialogOpen(o); if (!o) setEditingGroupId(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingGroupId ? 'Rename group' : 'Name this group'}</DialogTitle>
            <DialogDescription>
              {editingGroupId
                ? 'Update the label of this visual group. Groups are presentational only and are frozen with each saved version.'
                : `Group ${pendingGroupNodeIds.length} selected node${pendingGroupNodeIds.length === 1 ? '' : 's'} into a labelled visual container. Groups are presentational only and are frozen with each saved version.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="group-name" className="text-xs">Group name</Label>
            <Input
              id="group-name"
              value={pendingGroupName}
              onChange={(e) => setPendingGroupName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmGroup()
                }
              }}
              placeholder="e.g. Design phase"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setGroupDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirmGroup}>
              Create group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SaveIndicator({ dirty, saving, lastSavedAt }: { dirty: boolean; saving: boolean; lastSavedAt: number | null }) {
  if (saving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
        Saving...
      </span>
    )
  }
  if (dirty) {
    return (
      <span
        className={cn('flex items-center gap-1.5 text-xs text-amber-400')}
        title="You have unsaved changes"
      >
        <CircleDot className="h-3 w-3" aria-hidden="true" />
        Unsaved changes
      </span>
    )
  }
  if (lastSavedAt) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-400" title={`Saved at ${new Date(lastSavedAt).toLocaleTimeString()}`}>
        <Check className="h-3 w-3" aria-hidden="true" />
        All changes saved
      </span>
    )
  }
  return null
}
