import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

export type FieldIssue = {
  id: string
  componentRef: string
  description: string
  severity: string
  status: string
  capturedAt: string
  linkedIterationId?: string | null
  linkedFileRecordId?: string | null
}

/**
 * Fetches every field issue once and groups those linked to an iteration by
 * iteration id, so list/detail views can surface "this iteration has field
 * issues" without an extra request per row.
 */
export function useLinkedFieldIssues() {
  const [byIteration, setByIteration] = useState<Record<string, FieldIssue[]>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    api.changeMgmt
      .listFi()
      .then((all: FieldIssue[]) => {
        if (cancelled) return
        const grouped: Record<string, FieldIssue[]> = {}
        for (const fi of all) {
          if (!fi.linkedIterationId) continue
          ;(grouped[fi.linkedIterationId] ||= []).push(fi)
        }
        setByIteration(grouped)
      })
      .catch(() => { if (!cancelled) setByIteration({}) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  return { byIteration, loading }
}

/** True when at least one of the issues is not yet closed. */
export function hasOpenIssue(issues: FieldIssue[]): boolean {
  return issues.some((i) => i.status !== 'CLOSED')
}
