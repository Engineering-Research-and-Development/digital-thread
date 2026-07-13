import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'

export function IngestionInbox() {
  const [unassigned, setUnassigned] = useState<any[]>([])
  const [assignTarget, setAssignTarget] = useState<Record<string, string>>({})

  useEffect(() => { refresh() }, [])
  const refresh = async () => setUnassigned(await api.ingestion.unassigned())

  const assign = async (id: string) => {
    const iterationId = assignTarget[id]
    if (!iterationId) return
    await api.ingestion.assign(id, { iterationId })
    refresh()
  }

  return (
    <>
      <TopBar title="Ingestion Inbox" subtitle="Unassigned push events awaiting correlation" />
      <div className="p-6 space-y-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{unassigned.length} unassigned event(s)</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Received</TableHead><TableHead>DataSource</TableHead><TableHead>Topic / Query</TableHead><TableHead>Preview</TableHead><TableHead>Assign to iteration</TableHead></TableRow></TableHeader>
              <TableBody>
                {unassigned.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-[11px]">{new Date(r.receivedAt).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-[11px]">{r.dataSourceId.slice(0, 8)}</TableCell>
                    <TableCell className="text-[11px]">{r.resolvedQuery ?? '-'}</TableCell>
                    <TableCell className="text-[11px] max-w-xs truncate font-mono">{r.payloadPreview ?? '-'}</TableCell>
                    <TableCell className="flex gap-2">
                      <Input placeholder="iterationId" className="h-7 text-xs"
                        value={assignTarget[r.id] ?? ''}
                        onChange={(e) => setAssignTarget((m) => ({ ...m, [r.id]: e.target.value }))} />
                      <Button size="sm" onClick={() => assign(r.id)}>Assign</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {unassigned.length === 0 && <TableRow><TableCell colSpan={5} className="text-xs text-muted-foreground">Nothing to correlate</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <p className="text-[11px] text-muted-foreground">
          Unassigned events arrive when a push payload does not match any running iteration&apos;s correlation key.
          Assign to an iteration to promote it to <Badge variant="outline" className="text-[10px] mx-1">OK</Badge> status and consume the awaiting binding.
        </p>
      </div>
    </>
  )
}
