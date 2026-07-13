import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { TopBar } from '@/components/layout/top-bar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'

export function ComponentPassport() {
  const { componentRef } = useParams<{ componentRef: string }>()
  const [passport, setPassport] = useState<any | null>(null)
  const [dpp, setDpp] = useState<any | null>(null)

  useEffect(() => {
    if (!componentRef) return
    api.compliance.componentPassport(componentRef).then(setPassport)
    api.compliance.dpp(componentRef).then(setDpp).catch(() => setDpp(null))
  }, [componentRef])

  return (
    <>
      <TopBar title="Component Passport" subtitle={componentRef ?? ''} />
      <div className="p-6 space-y-4">
        {!passport ? <p className="text-sm text-muted-foreground">Loading…</p> : (
          <>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">Lifecycle phases - {passport.iterationCount} iteration(s)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {passport.phases.map((p: any) => (
                  <div key={p.phase}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{p.phase}</p>
                    {p.entries.length === 0
                      ? <p className="text-[11px] text-muted-foreground italic">- no artifacts yet -</p>
                      : p.entries.map((e: any, i: number) => (
                          <div key={i} className="text-[11px] font-mono">
                            <Badge variant="outline" className="mr-2 text-[10px]">{e.nodeTypeId}</Badge>
                            {e.label ?? e.nodeTypeId} → {e.files.length} file(s)
                          </div>
                        ))
                    }
                  </div>
                ))}
              </CardContent>
            </Card>
            {dpp && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Digital Product Passport (ESPR / AAS)</CardTitle></CardHeader>
                <CardContent className="text-[11px] font-mono">
                  <div>Version: {dpp.passportVersion}</div>
                  <div>Origins: {dpp.origins.join(', ') || '-'}</div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </>
  )
}
