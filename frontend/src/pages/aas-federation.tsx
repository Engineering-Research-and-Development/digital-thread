import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'

export function AasFederation() {
  const [peers, setPeers] = useState<any[]>([])
  const [catalog, setCatalog] = useState<any[]>([])
  const [form, setForm] = useState({ name: '', registryUrl: '' })
  const [q, setQ] = useState('')

  useEffect(() => { refresh() }, [])
  const refresh = async () => {
    setPeers(await api.aasRegistry.listPeers())
    setCatalog(await api.aasRegistry.catalog({ q: q || undefined }))
  }

  const addPeer = async () => {
    if (!form.name || !form.registryUrl) return
    await api.aasRegistry.addPeer(form)
    setForm({ name: '', registryUrl: '' })
    refresh()
  }

  return (
    <>
      <TopBar title="AAS Federation" subtitle="Federated catalog of AAS shells across partner registries"
        actions={<Button size="sm" onClick={async () => { await api.aasRegistry.syncAll(); refresh() }}>Sync all</Button>} />
      <div className="p-6 grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Peers</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Registry</TableHead><TableHead>Last sync</TableHead><TableHead>Enabled</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {peers.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.name}</TableCell>
                    <TableCell className="font-mono text-[11px]">{p.registryUrl}</TableCell>
                    <TableCell className="text-[11px]">{p.lastSyncAt ? new Date(p.lastSyncAt).toLocaleString() : '-'}{p.lastError && <Badge variant="destructive" className="ml-1 text-[9px]">err</Badge>}</TableCell>
                    <TableCell>{p.enabled ? '✓' : '-'}</TableCell>
                    <TableCell className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" onClick={async () => { await api.aasRegistry.syncPeer(p.id); refresh() }}>Sync</Button>
                      <Button size="sm" variant="ghost" onClick={async () => { await api.aasRegistry.removePeer(p.id); refresh() }}>Remove</Button>
                    </TableCell>
                  </TableRow>
                ))}
                {peers.length === 0 && <TableRow><TableCell colSpan={5} className="text-xs text-muted-foreground">No peers configured</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Add peer</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Name (e.g. AIMPLAS)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="https://aas-registry.example/registry" value={form.registryUrl} onChange={(e) => setForm({ ...form, registryUrl: e.target.value })} />
            <Button size="sm" className="w-full" onClick={addPeer}>Add</Button>
          </CardContent>
        </Card>

        <Card className="col-span-3">
          <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm">Federated catalog ({catalog.length})</CardTitle>
            <div className="flex gap-2">
              <Input placeholder="filter" value={q} onChange={(e) => setQ(e.target.value)} className="h-7 text-xs w-48" />
              <Button size="sm" variant="outline" onClick={refresh}>Search</Button>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>Shell ID</TableHead><TableHead>Peer</TableHead><TableHead>Updated</TableHead></TableRow></TableHeader>
              <TableBody>
                {catalog.slice(0, 100).map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono text-[11px] max-w-md truncate">{s.shellId}</TableCell>
                    <TableCell>{s.peer}</TableCell>
                    <TableCell className="text-[11px]">{new Date(s.updatedAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
