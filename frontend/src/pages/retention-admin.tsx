import { useEffect, useState } from 'react'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'

export function RetentionAdmin() {
  const [policy, setPolicy] = useState<Record<string, number> | null>(null)
  const [sweepOutput, setSweepOutput] = useState<any>(null)
  const [subject, setSubject] = useState('')
  const [reason, setReason] = useState('')
  const [erasureOut, setErasureOut] = useState<any>(null)

  useEffect(() => { api.retention.policy().then((p) => setPolicy(p.days)) }, [])

  return (
    <>
      <TopBar title="Retention & GDPR" subtitle="Classification retention windows, erasure workflow" />
      <div className="p-6 grid grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Retention policy (days)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {policy && Object.entries(policy).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between text-xs">
                <Badge variant="outline">{k}</Badge>
                <span className="font-mono">{v} days</span>
              </div>
            ))}
            <Button size="sm" className="w-full mt-4" onClick={async () => setSweepOutput(await api.retention.sweep())}>Run sweep now</Button>
            {sweepOutput && <pre className="text-[10px] font-mono bg-muted/30 rounded p-2 overflow-auto">{JSON.stringify(sweepOutput, null, 2)}</pre>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">GDPR right-to-erasure (Art. 17)</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="subject userId (target)" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <Input placeholder="reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
            <Button size="sm" className="w-full" onClick={async () => {
              if (!subject) return
              setErasureOut(await api.retention.requestErasure(subject, reason))
            }}>File erasure request</Button>
            <Button size="sm" variant="outline" className="w-full" onClick={async () => {
              if (!subject) return
              setErasureOut(await api.retention.exportData(subject))
            }}>Export subject data (Art. 15)</Button>
            {erasureOut && <pre className="text-[10px] font-mono bg-muted/30 rounded p-2 overflow-auto max-h-60">{JSON.stringify(erasureOut, null, 2)}</pre>}
            <p className="text-[10px] text-muted-foreground">Erasure requests go through the SUPERADMIN approval queue; on approval use <code>POST /retention/erasure/execute/:approvalRequestId</code>.</p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
