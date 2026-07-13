import { create } from 'zustand'

interface EditorStore {
  selectedNodeId: string | null
  isPanelOpen: boolean
  draggedNodeType: string | null
  selectNode: (nodeId: string | null) => void
  openPanel: () => void
  closePanel: () => void
  setDraggedNodeType: (type: string | null) => void
}

export const useEditorStore = create<EditorStore>((set) => ({
  selectedNodeId: null,
  isPanelOpen: false,
  draggedNodeType: null,

  selectNode: (nodeId) => set({ selectedNodeId: nodeId, isPanelOpen: nodeId !== null }),
  openPanel: () => set({ isPanelOpen: true }),
  closePanel: () => set({ isPanelOpen: false, selectedNodeId: null }),
  setDraggedNodeType: (type) => set({ draggedNodeType: type }),
}))
