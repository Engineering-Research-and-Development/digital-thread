import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'

/**
 * Purely-visual node group (a labelled container rendered BEHIND its member
 * nodes).
 *
 * Design choice (see editor-canvas.tsx): we render groups as a dedicated
 * ReactFlow node of `type: 'dtgroup'` (NOT XYFlow's reserved 'group', whose
 * built-in `.react-flow__node-group` style adds a grey fill) that is *not* used
 * as an XYFlow parent (member nodes keep absolute positions; no `parentId`).
 * This is the most robust option - re-parenting member nodes would convert
 * their positions to parent-relative coordinates and break the existing
 * absolute-position round-trip + dragging behaviour. Instead the group node is
 * a passive background rectangle whose position/size are recomputed from member
 * bounds on every render, with `selectable: false`, `draggable: false` and a
 * negative z-index so it never intercepts clicks meant for the nodes on top.
 */
export interface GroupNodeData {
  label: string
  color?: string
  /** When present (editor only), clicking the title renames the group. */
  onRename?: () => void
  [key: string]: unknown
}

function GroupNodeComponent({ data, width, height }: NodeProps) {
  const d = data as GroupNodeData
  const color = d.color ?? '#64748B'
  const labelStyle = { backgroundColor: 'var(--background)', color }
  const labelClass =
    'absolute -top-2.5 left-3 px-1.5 rounded text-[10px] font-semibold uppercase tracking-wider'
  return (
    <div
      className="rounded-lg border-2 border-dashed"
      style={{
        width: width ?? '100%',
        height: height ?? '100%',
        borderColor: `${color}80`,
        // No fill - just the rounded dashed outline (the low-opacity background
        // looked unaligned with the border, so it was removed).
        backgroundColor: 'transparent',
        // The container itself must never swallow pointer events - member nodes
        // sit visually on top (higher z-index) and need to stay interactive.
        pointerEvents: 'none',
      }}
    >
      {/* The title sits above the members, so making it clickable doesn't steal
          clicks from nodes. In the read-only iteration view onRename is absent. */}
      {d.onRename ? (
        <button
          type="button"
          title="Rename group"
          onClick={d.onRename}
          className={`${labelClass} cursor-pointer hover:underline`}
          style={{ ...labelStyle, pointerEvents: 'auto' }}
        >
          {d.label}
        </button>
      ) : (
        <div className={labelClass} style={labelStyle}>
          {d.label}
        </div>
      )}
    </div>
  )
}

export const GroupNode = memo(GroupNodeComponent)
