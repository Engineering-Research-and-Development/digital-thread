import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'

export function DataExchange() {
  const [exports, setExports] = useState<any[]>([])
  const [imports, setImports] = useState<any[]>([])

  useEffect(() => { refresh() }, [])
  const refresh = async () => {
    setExports(await api.usage.listExports())
    setImports(await api.usage.listImports())
  }

  return (
    <>
      <TopBar title="Data Exchange" subtitle="Data space - signed exports + imports with ODRL usage policies" />
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Exports</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Iteration</TableHead><TableHead>Target partner</TableHead><TableHead>Policy</TableHead><TableHead>Status</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
              <TableBody>
                {exports.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-[11px]">{e.iteration?.displayId ?? e.iterationId?.slice(0, 8)}</TableCell>
                    <TableCell>{e.targetPartner?.name ?? '-'}</TableCell>
                    <TableCell>{e.policyJson ? '✓' : '-'}</TableCell>
                    <TableCell><Badge>{e.status}</Badge></TableCell>
                    <TableCell className="text-[11px]">{new Date(e.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {exports.length === 0 && <TableRow><TableCell colSpan={5} className="text-xs text-muted-foreground">No exports yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Imports</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Source</TableHead><TableHead>Hash</TableHead><TableHead>Verified</TableHead><TableHead>Accepted</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {imports.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.sourcePartner}</TableCell>
                    <TableCell className="font-mono text-[10px]">{i.manifestHash.slice(0, 16)}…</TableCell>
                    <TableCell>{i.verified ? <Badge>verified</Badge> : <Badge variant="outline">{i.verifyReason ?? 'unchecked'}</Badge>}</TableCell>
                    <TableCell>{i.acceptedAt ? '✓' : '-'}</TableCell>
                    <TableCell className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" onClick={async () => { await api.usage.verifyImport(i.id); refresh() }}>Verify</Button>
                      {i.verified && !i.acceptedAt && <Button size="sm" onClick={async () => { await api.usage.acceptImport(i.id); refresh() }}>Accept</Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {imports.length === 0 && <TableRow><TableCell colSpan={5} className="text-xs text-muted-foreground">No imports yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
