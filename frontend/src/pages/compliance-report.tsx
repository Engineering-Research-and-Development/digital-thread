import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download } from 'lucide-react'
import { api } from '@/lib/api'

export function ComplianceReport() {
  const { iterationId } = useParams<{ iterationId: string }>()
  const [report, setReport] = useState<any | null>(null)

  useEffect(() => {
    if (!iterationId) return
    api.compliance.iterationReport(iterationId).then(setReport)
  }, [iterationId])

  const download = () => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `compliance-${report.iteration.displayId}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <TopBar title="Compliance Report" subtitle={report?.iteration?.displayId ?? iterationId}
        actions={<Button size="sm" onClick={download}><Download className="h-4 w-4 mr-1.5" /> Download JSON</Button>} />
      <div className="p-6 space-y-4">
        {!report ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Iteration envelope</CardTitle></CardHeader>
              <CardContent className="text-xs space-y-1">
                <p><strong>Machine:</strong> {report.iteration.machine?.name} v{report.iteration.machine?.version}</p>
                <p><strong>Status:</strong> <Badge>{report.iteration.status}</Badge>  <strong>Classification:</strong> <Badge variant="outline">{report.iteration.classification}</Badge></p>
                <p><strong>Generated:</strong> {report.generatedAt}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Node executions ({report.nodeExecutions.length})</CardTitle></CardHeader>
              <CardContent className="text-[11px] font-mono max-h-60 overflow-auto">
                {report.nodeExecutions.map((n: any) => (
                  <div key={n.nodeId}>[{n.status}] {n.nodeId} - {n.handler ?? 'manual'}</div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Files ({report.files.length}) / Manifests ({report.manifests.length})</CardTitle></CardHeader>
              <CardContent className="text-[11px] font-mono max-h-60 overflow-auto">
                {report.files.map((f: any) => (
                  <div key={f.id}>{f.filename} v{f.version} [{f.classification}] {f.contentHash?.slice(0, 10) ?? '–'}</div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Provenance export</CardTitle></CardHeader>
              <CardContent className="flex items-center gap-4">
                <Link className="text-blue-400 underline text-xs" to={`/provenance/iteration/${report.iteration.id}`}>
                  View provenance record
                </Link>
                <a className="text-blue-400 underline text-xs" href={api.provenance.ttlUrl(report.iteration.id)} target="_blank" rel="noreferrer">
                  Download PROV-O (Turtle)
                </a>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  )
}
