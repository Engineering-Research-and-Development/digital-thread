/**
 * Minimal types for `occt-import-js` (OpenCASCADE → WebAssembly), which ships
 * no declarations. Mirrors the result shape documented in its README and used
 * by `Model3DViewer`. The geometry representation is three.js-compatible.
 */
declare module 'occt-import-js' {
  interface OcctTypedArray {
    array: number[]
  }

  interface OcctMesh {
    name?: string
    /** r, g, b in the 0..1 range. */
    color?: [number, number, number]
    attributes: {
      position: OcctTypedArray
      normal?: OcctTypedArray
    }
    index?: OcctTypedArray
  }

  interface OcctResult {
    success: boolean
    meshes: OcctMesh[]
    root?: unknown
  }

  interface OcctModule {
    ReadStepFile(content: Uint8Array, params: unknown): OcctResult
    ReadIgesFile(content: Uint8Array, params: unknown): OcctResult
    ReadBrepFile(content: Uint8Array, params: unknown): OcctResult
  }

  type OcctFactory = (moduleArg?: { locateFile?: (path: string) => string }) => Promise<OcctModule>

  const factory: OcctFactory
  export default factory
}
