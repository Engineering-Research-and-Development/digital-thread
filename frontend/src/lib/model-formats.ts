/**
 * Client-side 3D preview — the set of file extensions the
 * in-browser `Model3DViewer` can render, and helpers to detect them.
 *
 * Two rendering paths feed the same three.js scene:
 *  - B-Rep CAD (STEP/IGES/BREP) is tessellated in the browser via
 *    `occt-import-js` (OpenCASCADE compiled to WebAssembly).
 *  - Mesh formats (STL/OBJ/PLY/glTF/3MF) use the matching three.js loader.
 *
 * Proprietary native CAD (CATPart, SLDPRT, Parasolid, Inventor…) is
 * intentionally absent: no open kernel reads it without a conversion step.
 * Keep this list as the single source of truth — the preview button and the
 * viewer both branch off it.
 */
export const PREVIEWABLE_3D_EXTENSIONS = [
  // OpenCASCADE (occt-import-js)
  'step', 'stp', 'iges', 'igs', 'brep',
  // three.js mesh loaders
  'stl', 'obj', 'ply', 'glb', 'gltf', '3mf',
] as const

export type Previewable3DExt = (typeof PREVIEWABLE_3D_EXTENSIONS)[number]

/** Lower-cased extension of `filename` if it is a previewable 3D format, else null. */
export function model3DExtension(filename?: string | null): Previewable3DExt | null {
  if (!filename) return null
  const match = /\.([a-z0-9]+)\s*$/i.exec(filename.trim())
  const ext = match?.[1]?.toLowerCase()
  return ext && (PREVIEWABLE_3D_EXTENSIONS as readonly string[]).includes(ext)
    ? (ext as Previewable3DExt)
    : null
}

export function isPreviewable3D(filename?: string | null): boolean {
  return model3DExtension(filename) !== null
}
