import { useCallback, useState } from 'react'
import { api } from '@/lib/api'

type RequestState =
  | { kind: 'idle' }
  | { kind: 'forbidden'; fileId: string; filename?: string }
  | { kind: 'submitting'; fileId: string }
  | { kind: 'submitted'; status: string; fileId: string }
  | { kind: 'error'; message: string }

/**
 * Partner-side wrapper around the file download flow.
 *
 * 1. On click, probes `GET /files/:id` (which runs assertReadable on the
 *    backend). If 200, opens the streamed download URL in a new tab.
 * 2. On 403, surfaces a `forbidden` state so the caller can prompt for a
 *    reason and submit a FileAccessRequest via the governance workflow.
 *
 * This avoids the dead-end where `window.open(downloadUrl)` swallows a 403
 * silently in the new tab. The probe lets us turn the failure into an action.
 */
export function useDownloadOrRequest() {
  const [state, setState] = useState<RequestState>({ kind: 'idle' })

  const tryDownload = useCallback(async (fileId: string, filename?: string) => {
    setState({ kind: 'idle' })
    try {
      await api.files.findOne(fileId)
      const url = api.files.downloadUrl(fileId)
      window.open(url, '_blank')
    } catch (err: any) {
      const msg = String(err?.message ?? err ?? '')
      // The shared request() helper throws `Error("HTTP 403")` or the API's
      // own message; either way the substring "403" / "Forbidden" / "Restricted"
      // signals a permission denial.
      if (/403|forbidden|RESTRICTED|CONFIDENTIAL|PARTNER-classified|not visible/i.test(msg)) {
        setState({ kind: 'forbidden', fileId, filename })
      } else {
        setState({ kind: 'error', message: msg || 'Download failed' })
      }
    }
  }, [])

  const submitRequest = useCallback(async (fileId: string, reason: string, iterationId?: string) => {
    setState({ kind: 'submitting', fileId })
    try {
      // iterationId = the iteration the requester is viewing — recorded so
      // governance links back to where access was requested.
      const res = await api.files.requestAccess(fileId, reason, iterationId)
      setState({ kind: 'submitted', status: res.status, fileId })
    } catch (err: any) {
      setState({ kind: 'error', message: String(err?.message ?? 'Request failed') })
    }
  }, [])

  /** Open the request-access dialog directly, skipping the probe — for cases
   * where the UI already knows the file is out-of-scope for this partner. */
  const openRequest = useCallback((fileId: string, filename?: string) => {
    setState({ kind: 'forbidden', fileId, filename })
  }, [])

  const dismiss = useCallback(() => setState({ kind: 'idle' }), [])

  return { state, tryDownload, openRequest, submitRequest, dismiss }
}
