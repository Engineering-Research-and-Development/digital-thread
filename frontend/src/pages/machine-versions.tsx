import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { ArrowLeft, History, Loader2, Users } from 'lucide-react'
import { TopBar } from '@/components/layout/top-bar'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { useMachineStore } from '@/stores/machine-store'
import { toast } from '@/components/ui/sonner'

interface VersionRow {
  id: string
  versionNumber: number
  versionLabel: string | null
  createdAt: string
  createdById: string | null
  nodeCount: number
  edgeCount: number
  iterationCount: number
}

/**
 * Immutable version history of a state machine. Shows when each version was
 * created, what shape it had (#nodes/#edges) and how many iterations were
 * instantiated from it.
 */
export function MachineVersions() {
  const { machineId } = useParams<{ machineId: string }>()
  const navigate = useNavigate()
  const machine = useMachineStore((s) => (machineId ? s.machines[machineId] : undefined))
  const [versions, setVersions] = useState<VersionRow[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!machineId) return
    setLoading(true)
    api.machines
      .listVersions(machineId)
      .then((rows) => setVersions(rows))
      .catch((e: any) => toast.error(`Failed to load versions: ${e?.message ?? 'unknown error'}`))
      .finally(() => setLoading(false))
  }, [machineId])

  if (!machineId) return null

  return (
    <>
      <TopBar
        title={machine?.name ?? 'State machine'}
        subtitle="Version history"
        actions={
          <Button variant="ghost" size="sm" onClick={() => navigate(`/machines`)}>
            <ArrowLeft className="h-4 w-4 mr-1" aria-hidden="true" />
            Back to machines
          </Button>
        }
      />
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="h-4 w-4" aria-hidden="true" />
          <span>
            Every save in the editor creates a new immutable version. Iterations are
            bound to the version active when they were started - subsequent edits do
            not affect them.
          </span>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span className="text-sm">Loading version history…</span>
          </div>
        )}

        {!loading && versions && versions.length === 0 && (
          <div className="text-center text-muted-foreground py-12 text-sm">
            No versions yet. Save the state machine to create the first one.
          </div>
        )}

        {!loading && versions && versions.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[14%]">Version</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Nodes</TableHead>
                <TableHead className="text-right">Edges</TableHead>
                <TableHead className="text-right">Iterations</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v, idx) => {
                const isLatest = idx === 0
                return (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-sm font-bold">v{v.versionNumber}</span>
                        {isLatest && (
                          <Badge className="text-[9px] bg-violet-500/15 text-violet-300 border-violet-500/30">
                            latest
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {v.versionLabel ? (
                        <code className="text-foreground/70">{v.versionLabel}</code>
                      ) : (
                        <span className="text-muted-foreground italic">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground tabular-nums">
                      {new Date(v.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{v.nodeCount}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{v.edgeCount}</TableCell>
                    <TableCell className="text-right">
                      {v.iterationCount > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs text-blue-400">
                          <Users className="h-3 w-3" aria-hidden="true" />
                          {v.iterationCount}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground tabular-nums">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {isLatest ? (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-6 text-[11px] px-1"
                          asChild
                        >
                          <Link to={`/editor/${machineId}`}>Open in editor</Link>
                        </Button>
                      ) : (
                        <a
                          href={`/api/v1/machines/${machineId}/versions/${v.versionNumber}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-blue-400 hover:underline"
                          title="View raw JSON snapshot"
                        >
                          View JSON
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </>
  )
}
