import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Sparkles, Play, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'
import { canAuthorWorkflows } from '@/lib/roles'
import { toast } from '@/components/ui/sonner'

interface EnrichmentRecord {
  id: string
  fileId: string
  enricherId: string
  enricherVersion: string
  status: string
  resultJson: string | null
  errorMsg: string | null
  createdAt: string
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  OK: 'default',
  SKIPPED: 'secondary',
  ERROR: 'destructive',
}

function prettyJson(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2)
  } catch {
    return s
  }
}

/**
 * File Enrichment - surfaces the derived metadata produced by the backend
 * `enrichment` enrichers (pdf-text, preview, c-scan header) for a single file
 * via `/enrichment/files/:id`. SUPERADMIN/OWNER can re-run enrichers on demand.
 */
export function FileEnrichment() {
  const { fileId } = useParams<{ fileId: string }>()
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.user?.role)
  const [records, setRecords] = useState<EnrichmentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const load = useCallback(() => {
    if (!fileId) return
    setLoading(true)
    api.enrichment
      .forFile(fileId)
      .then((r) => setRecords(r as EnrichmentRecord[]))
      .catch((e) => toast.error(e?.message ?? 'Failed to load enrichment'))
      .finally(() => setLoading(false))
  }, [fileId])

  useEffect(() => {
    load()
  }, [load])

  const run = async () => {
    if (!fileId) return
    setRunning(true)
    try {
      await api.enrichment.run(fileId)
      toast.success('Enrichers executed')
      load()
    } catch (e: any) {
      toast.error(e?.message ?? 'Enrichment run failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <TopBar
        title="File Enrichment"
        subtitle={fileId ? `Derived metadata for file ${fileId.slice(0, 8)}…` : ''}
        actions={
          <div className="flex items-center gap-2">
            {canAuthorWorkflows(role) && (
              <Button size="sm" onClick={run} disabled={running}>
                {running
                  ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  : <Play className="h-4 w-4 mr-1.5" />}
                Run enrichers
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4 mr-1" /> Back
            </Button>
          </div>
        }
      />
      <div className="p-6 space-y-4">
        {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

        {!loading && records.length === 0 && (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No enrichment records for this file yet.
              {canAuthorWorkflows(role) && ' Use “Run enrichers” to generate them.'}
            </CardContent>
          </Card>
        )}

        {!loading && records.map((rec) => (
          <Card key={rec.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                {rec.enricherId}
                <Badge variant="outline" className="text-[10px]">v{rec.enricherVersion}</Badge>
                <Badge variant={STATUS_VARIANT[rec.status] ?? 'outline'} className="text-[10px]">
                  {rec.status}
                </Badge>
                <span className="ml-auto text-[10px] font-normal text-muted-foreground">
                  {new Date(rec.createdAt).toLocaleString()}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rec.errorMsg && <p className="text-xs text-red-400 mb-2">{rec.errorMsg}</p>}
              {rec.resultJson
                ? (
                  <pre className="text-[11px] font-mono overflow-auto max-h-72 bg-muted/40 rounded p-2">
                    {prettyJson(rec.resultJson)}
                  </pre>
                )
                : <p className="text-xs text-muted-foreground">No payload.</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  )
}
