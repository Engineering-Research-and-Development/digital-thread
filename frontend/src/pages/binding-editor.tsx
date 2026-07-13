import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useDataSourceStore } from '@/stores/datasource-store'
import { api } from '@/lib/api'

const BINDING_TYPES = ['MANUAL', 'FROM_NODE', 'FROM_DATASOURCE_QUERY', 'FROM_DATASOURCE_EVENT', 'FROM_AAS_SUBMODEL', 'FROM_METADATA']

/**
 * Binding editor for a single state machine - one row per (node, input) binding.
 * Live-preview of a resolved template against sample context.
 */
export function BindingEditor() {
  const { machineId } = useParams<{ machineId: string }>()
  const [bindings, setBindings] = useState<any[]>([])
  const [preview, setPreview] = useState<any[]>([])
  const { sources } = useDataSourceStore()

  useEffect(() => {
    if (!machineId) return
    api.bindings.list({ stateMachineId: machineId }).then(setBindings)
  }, [machineId])

  const resolveDry = async (iterationId: string, nodeId: string) => {
    try {
      const res = await api.bindings.resolve({ iterationId, nodeId })
      setPreview(res)
    } catch (e: any) { setPreview([{ error: e.message }]) }
  }

  return (
    <>
      <TopBar title="Input Bindings" subtitle={`State machine ${machineId?.slice(0, 8)}`} />
      <div className="p-6 space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Bindings</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Node</TableHead><TableHead>Input</TableHead><TableHead>Type</TableHead><TableHead>Data source</TableHead><TableHead>Config</TableHead></TableRow></TableHeader>
              <TableBody>
                {bindings.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-[11px]">{b.nodeId}</TableCell>
                    <TableCell className="font-mono text-[11px]">{b.inputId}</TableCell>
                    <TableCell><Badge variant="outline">{b.bindingType}</Badge></TableCell>
                    <TableCell className="text-[11px]">{b.dataSourceId ? (sources[b.dataSourceId]?.name ?? '-') : '-'}</TableCell>
                    <TableCell className="text-[10px] font-mono max-w-sm truncate">{b.configJson}</TableCell>
                  </TableRow>
                ))}
                {bindings.length === 0 && <TableRow><TableCell colSpan={5} className="text-xs text-muted-foreground">No bindings declared</TableCell></TableRow>}
              </TableBody>
            </Table>
            <p className="text-[11px] text-muted-foreground mt-3">
              Bindings are created via <code>POST /api/v1/bindings</code>. Supported types: {BINDING_TYPES.join(', ')}.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Resolve dry-run</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <p className="text-[11px] text-muted-foreground">Call a node resolution against a running iteration to see how each binding evaluates.</p>
            <div className="flex gap-2">
              <Input placeholder="iterationId" id="iterationId" />
              <Input placeholder="nodeId" id="nodeId" />
              <Button size="sm" onClick={() => {
                const iter = (document.getElementById('iterationId') as HTMLInputElement).value
                const node = (document.getElementById('nodeId') as HTMLInputElement).value
                if (iter && node) resolveDry(iter, node)
              }}>Resolve</Button>
            </div>
            <pre className="mt-2 p-2 bg-muted/30 rounded text-[10px] font-mono overflow-auto">{JSON.stringify(preview, null, 2)}</pre>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
