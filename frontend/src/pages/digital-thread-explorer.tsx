import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Filter,
  FileText,
  Clock,
  Cpu,
  User,
  ExternalLink,
  Download,
  X,
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  FolderSearch,
  GitBranch,
  Sparkles,
  Upload,
  FileUp,
  Loader2,
} from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useIterationStore } from '@/stores/iteration-store'
import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'
import { api } from '@/lib/api'
import { uploadRawFile } from '@/lib/uploads'
import { UploadType } from '@/types/enums'
import type { FileRecord, FileReference } from '@/types/minio'
import type { Iteration } from '@/types/state-machine'
import { toast } from '@/components/ui/sonner'
import { cn } from '@/lib/utils'
import { FileDownloadButton } from '@/components/governance/file-download-button'
import { RequestAccessDialog } from '@/components/governance/request-access-dialog'
import { useDownloadOrRequest } from '@/hooks/use-download-or-request'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type SortKey = 'timestamp' | 'filename' | 'size' | 'node' | 'type'
type SortDir = 'asc' | 'desc'
type Scope = 'ALL' | 'RAW' | 'NODE'

const PAGE_SIZE = 50

const RAW_CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'PARTNER'] as const
type RawClassification = (typeof RAW_CLASSIFICATIONS)[number]

export function DigitalThreadExplorer() {
  const { iterations } = useIterationStore()
  const role = useAuthStore((s) => s.user?.role)
  const partnerName = useAuthStore((s) => s.user?.partner?.name ?? null)
  // Scoped download/request flow - same governance gate as everywhere else.
  // The explorer is a cross-iteration view (no machine context), so the access
  // decision is UNKNOWN for OPERATOR → the button probes the backend (which
  // honours classification, partner-scope AND active grants) before downloading.
  const dl = useDownloadOrRequest()
  const [allFiles, setAllFiles] = useState<FileRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [scope, setScope] = useState<Scope>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [nodeFilter, setNodeFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [iterationFilter, setIterationFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('timestamp')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)

  // Raw-upload dialog
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadClassification, setUploadClassification] = useState<RawClassification>('INTERNAL')
  const [uploading, setUploading] = useState(false)

  const loadFiles = (s: Scope) => {
    setLoading(true)
    api.files.list(undefined, undefined, s).then((res: any) => {
      const items: FileRecord[] = Array.isArray(res) ? res : (res?.items ?? [])
      setAllFiles(items)
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    loadFiles(scope)
  }, [scope])

  const files = useMemo(() => {
    let result = allFiles

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (f) =>
          (f.filename ?? '').toLowerCase().includes(q) ||
          (f.nodeSourceLabel ?? '').toLowerCase().includes(q) ||
          (f.sourceInfo ?? '').toLowerCase().includes(q) ||
          (f.path ?? '').toLowerCase().includes(q),
      )
    }
    if (nodeFilter !== 'all') {
      result = result.filter((f) => f.nodeSourceId === nodeFilter)
    }
    if (typeFilter !== 'all') {
      result = result.filter((f) => f.uploadType === typeFilter)
    }
    if (iterationFilter !== 'all') {
      result = result.filter((f) => f.iterationId === iterationFilter)
    }

    const dirMul = sortDir === 'asc' ? 1 : -1
    return result.slice().sort((a, b) => {
      switch (sortKey) {
        case 'filename':
          return (a.filename ?? '').localeCompare(b.filename ?? '') * dirMul
        case 'size':
          return (a.sizeBytes - b.sizeBytes) * dirMul
        case 'node':
          return (a.nodeSourceLabel ?? '').localeCompare(b.nodeSourceLabel ?? '') * dirMul
        case 'type':
          return (a.uploadType ?? '').localeCompare(b.uploadType ?? '') * dirMul
        case 'timestamp':
        default:
          return (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()) * dirMul
      }
    })
  }, [allFiles, searchQuery, nodeFilter, typeFilter, iterationFilter, sortKey, sortDir])

  // Reset pagination when filters change
  useEffect(() => {
    setPage(1)
  }, [scope, searchQuery, nodeFilter, typeFilter, iterationFilter, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(files.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = files.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const uniqueNodes = useMemo(() => {
    const map = new Map<string, string>()
    allFiles.forEach((f) => {
      if (f.nodeSourceId) map.set(f.nodeSourceId, f.nodeSourceLabel ?? f.nodeSourceId)
    })
    return Array.from(map.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [allFiles])

  const iterationIds = Object.keys(iterations)

  const hasActiveFilters =
    searchQuery !== '' ||
    nodeFilter !== 'all' ||
    typeFilter !== 'all' ||
    iterationFilter !== 'all'

  const clearFilters = () => {
    setSearchQuery('')
    setNodeFilter('all')
    setTypeFilter('all')
    setIterationFilter('all')
  }

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'timestamp' || key === 'size' ? 'desc' : 'asc')
    }
  }

  const exportCsv = () => {
    if (files.length === 0) return
    const header = ['timestamp', 'filename', 'path', 'iteration', 'node', 'attachment', 'classification', 'uploadType', 'sizeBytes']
    const rows = files.map((f) => [
      f.timestamp ?? '',
      f.filename ?? '',
      f.path ?? '',
      f.iterationId ? iterations[f.iterationId]?.displayId || f.iterationId : 'Unattached (fresh)',
      f.nodeSourceLabel ?? '',
      attachmentLabel(f),
      f.classification ?? '',
      f.uploadType ?? '',
      (f.sizeBytes ?? 0).toString(),
    ])
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `digital-thread-files-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success(`Exported ${files.length} file${files.length === 1 ? '' : 's'} to CSV`)
  }

  const resetUploadDialog = () => {
    setUploadFile(null)
    setUploadClassification('INTERNAL')
    setUploading(false)
  }

  const handleRawUpload = async () => {
    if (!uploadFile) return
    setUploading(true)
    try {
      await uploadRawFile(uploadFile, uploadClassification)
      toast.success(`Uploaded "${uploadFile.name}" as a fresh raw file`)
      setUploadOpen(false)
      resetUploadDialog()
      loadFiles(scope)
    } catch (e: any) {
      toast.error(e?.message ?? 'Upload failed')
      setUploading(false)
    }
  }

  return (
    <>
      <TopBar
        title="Digital File Explorer"
        subtitle={
          loading
            ? 'Loading files...'
            : `${files.length} of ${allFiles.length} file${allFiles.length === 1 ? '' : 's'} tracked`
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUploadOpen(true)}
              title="Upload a fresh (unattached) raw file into the library"
            >
              <Upload className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Upload raw file
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportCsv}
              disabled={files.length === 0 || loading}
              title="Download filtered results as CSV"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
              Export CSV
            </Button>
          </div>
        }
      />
      <div className="p-6 space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Scope segmented control */}
          <div
            className="inline-flex items-center rounded-md border border-border p-0.5 h-9"
            role="group"
            aria-label="Filter by file scope"
          >
            {([
              { value: 'ALL' as const, label: 'All' },
              { value: 'RAW' as const, label: 'Fresh (raw)' },
              { value: 'NODE' as const, label: 'From iterations' },
            ]).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setScope(opt.value)}
                aria-pressed={scope === opt.value}
                className={cn(
                  'px-2.5 h-full rounded-[5px] text-xs transition-colors',
                  scope === opt.value
                    ? 'bg-accent text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
            <Input
              type="search"
              placeholder="Search filename, path, node..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-8 h-9"
              aria-label="Search files"
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
          <div className="flex items-center gap-1.5">
            <Filter className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </div>
          <Select value={nodeFilter} onValueChange={setNodeFilter}>
            <SelectTrigger className="w-[200px] h-9 text-xs" aria-label="Filter by node">
              <SelectValue placeholder="Node source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Nodes</SelectItem>
              {uniqueNodes.map(({ id, label }) => (
                <SelectItem key={id} value={id}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px] h-9 text-xs" aria-label="Filter by upload type">
              <SelectValue placeholder="Upload type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="AUTOMATIC">Automatic</SelectItem>
              <SelectItem value="MANUAL">Manual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={iterationFilter} onValueChange={setIterationFilter}>
            <SelectTrigger className="w-[200px] h-9 text-xs" aria-label="Filter by iteration">
              <SelectValue placeholder="Iteration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Iterations</SelectItem>
              {iterationIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {iterations[id].displayId || id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs">
              <X className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
              Clear filters
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs w-[180px]">
                  <SortableHeader
                    active={sortKey === 'timestamp'}
                    dir={sortDir}
                    onClick={() => toggleSort('timestamp')}
                    icon={<Clock className="h-3 w-3" />}
                    label="Timestamp"
                  />
                </TableHead>
                <TableHead className="text-xs w-[320px]">
                  <SortableHeader
                    active={sortKey === 'filename'}
                    dir={sortDir}
                    onClick={() => toggleSort('filename')}
                    icon={<FileText className="h-3 w-3" />}
                    label="Filename"
                  />
                </TableHead>
                <TableHead className="text-xs w-[140px]">Iteration</TableHead>
                <TableHead className="text-xs w-[160px]">
                  <SortableHeader
                    active={sortKey === 'node'}
                    dir={sortDir}
                    onClick={() => toggleSort('node')}
                    label="Node"
                  />
                </TableHead>
                <TableHead className="text-xs w-[110px]">Attachment</TableHead>
                <TableHead className="text-xs w-[110px]">
                  <SortableHeader
                    active={sortKey === 'type'}
                    dir={sortDir}
                    onClick={() => toggleSort('type')}
                    label="Upload Type"
                  />
                </TableHead>
                <TableHead className="text-xs w-[90px] text-right">
                  <SortableHeader
                    active={sortKey === 'size'}
                    dir={sortDir}
                    onClick={() => toggleSort('size')}
                    label="Size"
                    align="right"
                  />
                </TableHead>
                <TableHead className="text-xs w-[200px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`}>
                      <TableCell colSpan={8}>
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}

              {!loading && paginated.map((file) => {
                const isRaw = isRawFile(file)
                return (
                <TableRow key={file.id} className="hover:bg-accent/50">
                  <TableCell className="text-xs font-mono text-muted-foreground tabular-nums">
                    {new Date(file.timestamp).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-start gap-2 w-[320px]">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium break-words overflow-hidden" title={file.filename ?? ''}>{file.filename ?? '(unnamed)'}</p>
                        <p className="text-[10px] text-muted-foreground font-mono break-all overflow-hidden" title={file.path ?? ''}>
                          {file.path ?? ''}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isRaw ? (
                      <span className="text-[10px] italic text-muted-foreground">Unattached (fresh)</span>
                    ) : (
                      <FileReferenceList
                        kind="iteration"
                        references={file.references ?? []}
                        fallbackIterationId={file.iterationId}
                        fallbackNodeId={file.nodeSourceId}
                        fallbackNodeLabel={file.nodeSourceLabel}
                        iterationLookup={iterations}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {isRaw ? (
                      <span className="text-[10px] text-muted-foreground">-</span>
                    ) : (
                      <FileReferenceList
                        kind="node"
                        references={file.references ?? []}
                        fallbackIterationId={file.iterationId}
                        fallbackNodeId={file.nodeSourceId}
                        fallbackNodeLabel={file.nodeSourceLabel}
                        iterationLookup={iterations}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={isRaw ? 'outline' : 'secondary'}
                      className={cn(
                        'text-[10px]',
                        isRaw && 'border-amber-500/30 bg-amber-500/10 text-amber-400',
                      )}
                      title={isRaw
                        ? 'Fresh raw file - not attached to any iteration node yet'
                        : 'Produced or consumed by an iteration node'}
                    >
                      <span className="flex items-center gap-1">
                        {isRaw
                          ? <FileUp className="h-2.5 w-2.5" aria-hidden="true" />
                          : <GitBranch className="h-2.5 w-2.5" aria-hidden="true" />}
                        {attachmentLabel(file)}
                      </span>
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={file.uploadType === UploadType.AUTOMATIC ? 'secondary' : 'outline'}
                      className="text-[10px]"
                      title={file.uploadType === UploadType.AUTOMATIC ? 'Uploaded by automatic service' : 'Uploaded manually by operator'}
                    >
                      <span className="flex items-center gap-1">
                        {file.uploadType === UploadType.AUTOMATIC
                          ? <Cpu className="h-2.5 w-2.5" aria-hidden="true" />
                          : <User className="h-2.5 w-2.5" aria-hidden="true" />
                        }
                        {file.uploadType}
                      </span>
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-right text-muted-foreground tabular-nums">
                    {formatBytes(file.sizeBytes)}
                  </TableCell>
                  <TableCell>
                    {role === ROLE.OPERATOR ? (
                      /* For OPERATOR the explorer is a read-only registry of
                         their own uploads: no download/trace actions here
                         (downloads happen on the iteration page, gated by
                         classification + grants). */
                      <div className="flex items-center justify-end pr-1 text-[10px] text-muted-foreground/50">-</div>
                    ) : (
                    <div className="flex items-center justify-end gap-1.5">
                      {/* Scoped download - respects classification, partner-scope
                          and active grants (probe-first for OPERATOR). */}
                      <FileDownloadButton
                        fileId={file.id}
                        filename={file.filename ?? undefined}
                        role={role}
                        partnerName={partnerName}
                        classification={file.classification}
                        variant="emerald"
                        onRequest={(fid, fname) => dl.openRequest(fid, fname)}
                        onProbe={(fid, fname) => dl.tryDownload(fid, fname)}
                      />
                      {isRaw ? (
                        <span
                          className="text-[10px] text-muted-foreground italic"
                          title="Lineage and enrichment become available once this file is attached to an iteration node"
                        >
                          unattached
                        </span>
                      ) : (
                        <>
                          <Button asChild variant="ghost" size="icon-sm" title="Lineage graph - upstream / downstream derivation" aria-label="Lineage graph">
                            <Link to={`/lineage/${file.id}`}>
                              <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                            </Link>
                          </Button>
                          <Button asChild variant="ghost" size="icon-sm" title="Enrichment - derived metadata" aria-label="Enrichment metadata">
                            <Link to={`/enrichment/${file.id}`}>
                              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                            </Link>
                          </Button>
                        </>
                      )}
                    </div>
                    )}
                  </TableCell>
                </TableRow>
                )
              })}

              {!loading && files.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center gap-2">
                      <FolderSearch className="h-8 w-8 opacity-50" aria-hidden="true" />
                      {hasActiveFilters ? (
                        <>
                          <p className="text-sm">No files match your filters</p>
                          <Button variant="link" size="sm" onClick={clearFilters} className="text-xs">
                            Clear filters
                          </Button>
                        </>
                      ) : (
                        <>
                          <p className="text-sm">No files tracked yet</p>
                          <p className="text-xs">Files will appear here as iterations produce outputs</p>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {!loading && files.length > PAGE_SIZE && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, files.length)} of {files.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="px-2 tabular-nums">
                Page {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Raw-file upload dialog */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          if (uploading) return
          setUploadOpen(open)
          if (!open) resetUploadDialog()
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload raw file</DialogTitle>
            <DialogDescription>
              Add a fresh file to the library. It stays unattached until you wire it into an iteration node.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="raw-upload-file" className="text-xs">File</Label>
              <Input
                id="raw-upload-file"
                type="file"
                disabled={uploading}
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="h-9 text-xs file:mr-2 file:text-xs"
              />
              {uploadFile && (
                <p className="text-[10px] text-muted-foreground truncate" title={uploadFile.name}>
                  {uploadFile.name} · {formatBytes(uploadFile.size)}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="raw-upload-classification" className="text-xs">Classification</Label>
              <Select
                value={uploadClassification}
                onValueChange={(v) => setUploadClassification(v as RawClassification)}
                disabled={uploading}
              >
                <SelectTrigger id="raw-upload-classification" className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RAW_CLASSIFICATIONS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setUploadOpen(false)
                resetUploadDialog()
              }}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleRawUpload}
              disabled={!uploadFile || uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" aria-hidden="true" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Governance request-access dialog - opened when a scoped download probe
          returns 403 (file out of the partner's scope, no active grant). */}
      <RequestAccessDialog
        open={dl.state.kind === 'forbidden' || dl.state.kind === 'submitting' || dl.state.kind === 'submitted'}
        filename={dl.state.kind === 'forbidden' ? dl.state.filename : undefined}
        fileId={
          dl.state.kind === 'forbidden' || dl.state.kind === 'submitting' || dl.state.kind === 'submitted'
            ? (dl.state as { fileId: string }).fileId
            : undefined
        }
        submitting={dl.state.kind === 'submitting'}
        submitted={dl.state.kind === 'submitted' ? { status: dl.state.status } : null}
        errorMessage={dl.state.kind === 'error' ? dl.state.message : null}
        onSubmit={(reason) => {
          const fid = (dl.state as { fileId?: string }).fileId
          if (fid) dl.submitRequest(fid, reason)
        }}
        onDownload={(fid) => { window.open(api.files.downloadUrl(fid), '_blank') }}
        onClose={dl.dismiss}
      />
    </>
  )
}

/** A file with no iteration/node attachment is a fresh RAW upload. */
function isRawFile(f: FileRecord): boolean {
  if (f.attachmentKind) return f.attachmentKind === 'RAW'
  return !f.iterationId && !f.nodeSourceId
}

/** Short label for the attachment-kind badge / CSV column. */
function attachmentLabel(f: FileRecord): string {
  return isRawFile(f) ? 'RAW' : (f.attachmentKind ?? 'NODE')
}

/**
 * Cell renderer that lists every (iteration × node) that references the file -
 * shared between the Iteration column (`kind="iteration"`) and the Node column
 * (`kind="node"`) so they stack in lockstep. Falls back to the legacy single
 * origin (`file.iterationId` + `nodeSourceLabel`) when the backend response is
 * missing the `references` array.
 */
function FileReferenceList({
  kind,
  references,
  fallbackIterationId,
  fallbackNodeId,
  fallbackNodeLabel,
  iterationLookup,
}: {
  kind: 'iteration' | 'node'
  references: FileReference[]
  fallbackIterationId: string | null
  fallbackNodeId: string | null
  fallbackNodeLabel: string | null
  iterationLookup: Record<string, Iteration>
}) {
  const resolved: FileReference[] = references.length
    ? references
    : [{
        fileId: '',
        iterationId: fallbackIterationId ?? '',
        iterationDisplayId: fallbackIterationId ? iterationLookup[fallbackIterationId]?.displayId : undefined,
        nodeId: fallbackNodeId ?? '',
        nodeLabel: fallbackNodeLabel ?? undefined,
        role: 'OUTPUT' as const,
      }]

  // Sort so OUTPUT origin appears first, then INPUT consumers grouped by iteration.
  const sorted = [...resolved].sort((a, b) => {
    if (a.role !== b.role) return a.role === 'OUTPUT' ? -1 : 1
    const ai = a.iterationDisplayId ?? a.iterationId
    const bi = b.iterationDisplayId ?? b.iterationId
    return ai.localeCompare(bi)
  })

  return (
    <div className="flex flex-col gap-1">
      {sorted.map((ref, idx) => {
        const iterLabel = ref.iterationDisplayId ?? iterationLookup[ref.iterationId]?.displayId ?? ref.iterationId
        const nodeLabel = ref.nodeLabel ?? ref.nodeId
        const roleTone = ref.role === 'OUTPUT'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
          : 'border-blue-500/30 bg-blue-500/10 text-blue-400'
        if (kind === 'iteration') {
          return (
            <Link
              key={`${ref.iterationId}-${ref.nodeId}-${ref.role}-${ref.outputId ?? ref.inputId ?? idx}`}
              to={`/iteration/${ref.iterationId}?highlight=${ref.nodeId}`}
              className="inline-flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/40 rounded px-0.5"
              title={`${ref.role} · ${iterLabel}${ref.iterationStatus ? ` (${ref.iterationStatus})` : ''}`}
            >
              <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{iterLabel}</span>
              <Badge variant="outline" className={cn('text-[9px] py-0 px-1 leading-none', roleTone)}>
                {ref.role === 'OUTPUT' ? 'OUT' : 'IN'}
              </Badge>
            </Link>
          )
        }
        return (
          <Link
            key={`${ref.iterationId}-${ref.nodeId}-${ref.role}-${ref.outputId ?? ref.inputId ?? idx}`}
            to={`/iteration/${ref.iterationId}?highlight=${ref.nodeId}`}
            className="inline-flex items-center gap-1"
            title={ref.role === 'OUTPUT'
              ? `Produced as output${ref.outputId ? ` "${ref.outputId}"` : ''} in ${iterLabel}`
              : `Wired as input${ref.inputId ? ` "${ref.inputId}"` : ''} in ${iterLabel}`}
          >
            <Badge variant="outline" className="text-[10px] hover:bg-accent/50 cursor-pointer transition-colors truncate max-w-[150px]">
              {nodeLabel}
            </Badge>
          </Link>
        )
      })}
    </div>
  )
}

function SortableHeader({
  active,
  dir,
  onClick,
  icon,
  label,
  align,
}: {
  active: boolean
  dir: SortDir
  onClick: () => void
  icon?: React.ReactNode
  label: string
  align?: 'left' | 'right'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 w-full hover:text-foreground transition-colors',
        align === 'right' ? 'justify-end' : 'justify-start',
        active ? 'text-foreground' : 'text-muted-foreground'
      )}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {icon}
      <span>{label}</span>
      {active ? (
        dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />
      ) : (
        <ChevronsUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
      )}
    </button>
  )
}
