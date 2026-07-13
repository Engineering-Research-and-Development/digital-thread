import { create } from 'zustand'

/**
 * Global upload-progress store. Every file upload in
 * the app — node outputs, raw files, imports — registers here so a single
 * popover can show live per-file progress bars across navigation. Survives
 * component remounts because it lives at the app shell level.
 */
export type UploadStatus = 'PENDING' | 'UPLOADING' | 'COMPLETE' | 'ERROR'

export interface UploadItem {
  id: string
  filename: string
  /** Human context, e.g. a node label or "Raw file". */
  context?: string
  percent: number
  status: UploadStatus
  error?: string
  startedAt: number
}

interface UploadProgressStore {
  uploads: UploadItem[]
  /** Whether the popover is expanded. Auto-opens when a new upload starts. */
  open: boolean
  start: (item: { id: string; filename: string; context?: string }) => void
  setProgress: (id: string, percent: number) => void
  complete: (id: string) => void
  fail: (id: string, error: string) => void
  remove: (id: string) => void
  clearFinished: () => void
  setOpen: (open: boolean) => void
  activeCount: () => number
}

export const useUploadProgressStore = create<UploadProgressStore>((set, get) => ({
  uploads: [],
  open: false,

  start: ({ id, filename, context }) =>
    set((s) => ({
      open: true,
      uploads: [
        ...s.uploads,
        { id, filename, context, percent: 0, status: 'PENDING', startedAt: Date.now() },
      ],
    })),

  setProgress: (id, percent) =>
    set((s) => ({
      uploads: s.uploads.map((u) =>
        u.id === id ? { ...u, percent, status: percent >= 100 ? 'UPLOADING' : 'UPLOADING' } : u,
      ),
    })),

  complete: (id) =>
    set((s) => ({
      uploads: s.uploads.map((u) => (u.id === id ? { ...u, percent: 100, status: 'COMPLETE' } : u)),
    })),

  fail: (id, error) =>
    set((s) => ({
      uploads: s.uploads.map((u) => (u.id === id ? { ...u, status: 'ERROR', error } : u)),
    })),

  remove: (id) => set((s) => ({ uploads: s.uploads.filter((u) => u.id !== id) })),

  clearFinished: () =>
    set((s) => ({ uploads: s.uploads.filter((u) => u.status === 'PENDING' || u.status === 'UPLOADING') })),

  setOpen: (open) => set({ open }),

  activeCount: () => get().uploads.filter((u) => u.status === 'PENDING' || u.status === 'UPLOADING').length,
}))
