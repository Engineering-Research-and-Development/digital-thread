import { api, type UploadProgressCb } from '@/lib/api'
import { useUploadProgressStore } from '@/stores/upload-progress-store'

/**
 * Centralised, progress-tracked upload helpers. Every
 * upload point in the app should go through these so the global upload-progress
 * popover shows a live per-file bar. Reads the File to base64, registers with
 * the store, streams XHR progress, and resolves with the saved FileRecord.
 */

let counter = 0
function nextId(): string {
  counter += 1
  return `up-${Date.now()}-${counter}`
}

/** Read a File into base64 (no data-URL prefix), matching the upload DTOs. */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      const comma = result.indexOf(',')
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

async function tracked<T>(
  file: File,
  context: string,
  run: (base64: string, onProgress: UploadProgressCb) => Promise<T>,
): Promise<T> {
  const store = useUploadProgressStore.getState()
  const id = nextId()
  store.start({ id, filename: file.name, context })
  try {
    const base64 = await readFileAsBase64(file)
    const res = await run(base64, (p) => store.setProgress(id, p.percent))
    store.complete(id)
    return res
  } catch (e: any) {
    store.fail(id, e?.message ?? 'Upload failed')
    throw e
  }
}

/** Upload a file as a node output (iteration-scoped), tracked in the popover. */
export function uploadNodeFile(
  file: File,
  payload: {
    iterationId: string
    nodeId: string
    nodeOutputId?: string
    nodeLabel: string
    uploadType?: 'MANUAL' | 'AUTOMATIC'
    classification?: string
    bucket?: string
    sourceInfo?: string
  },
) {
  return tracked(file, payload.nodeLabel, (base64, onProgress) =>
    api.files.upload(
      {
        ...payload,
        uploadType: payload.uploadType ?? 'MANUAL',
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        base64Data: base64,
      },
      onProgress,
    ),
  )
}

/** Upload a RAW (unattached) file, tracked in the popover. */
export function uploadRawFile(
  file: File,
  classification?: 'PUBLIC' | 'INTERNAL' | 'PARTNER',
) {
  return tracked(file, 'Raw file', (base64, onProgress) =>
    api.files.rawUpload(
      {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        base64Data: base64,
        classification,
      },
      onProgress,
    ),
  )
}
