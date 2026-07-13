import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { ThreeMFLoader } from 'three/examples/jsm/loaders/3MFLoader.js'
import occtimportjs from 'occt-import-js'
import occtWasmUrl from 'occt-import-js/dist/occt-import-js.wasm?url'
import { AlertTriangle, Loader2 } from 'lucide-react'

import { model3DExtension } from '@/lib/model-formats'

/**
 * Model3DViewer — renders a CAD/mesh file entirely in the browser. Heavy
 * (three.js + the OpenCASCADE WASM), so it is mounted lazily by
 * `ModelPreviewDialog` only when the dialog opens. The bytes it renders are
 * the already-authorised blob streamed through the governance-gated download
 * route — the source never leaves the user's machine.
 */

const SURFACE_COLOR = 0x9aa4b2

// The OpenCASCADE module is expensive to instantiate; keep one promise alive
// for the whole session (the WASM is fetched once via the Vite `?url` asset).
let occtPromise: ReturnType<typeof occtimportjs> | null = null
function getOcct() {
  if (!occtPromise) occtPromise = occtimportjs({ locateFile: () => occtWasmUrl })
  return occtPromise
}

interface OcctPreviewMesh {
  color?: [number, number, number]
  attributes: { position: { array: number[] }; normal?: { array: number[] } }
  index?: { array: number[] }
}

function objectFromOcct(meshes: OcctPreviewMesh[]): THREE.Object3D {
  const group = new THREE.Object3D()
  for (const mesh of meshes ?? []) {
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.attributes.position.array, 3))
    if (mesh.attributes.normal?.array) {
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.attributes.normal.array, 3))
    }
    if (mesh.index?.array) {
      geometry.setIndex(new THREE.BufferAttribute(Uint32Array.from(mesh.index.array), 1))
    }
    if (!mesh.attributes.normal?.array) geometry.computeVertexNormals()
    const color = Array.isArray(mesh.color)
      ? new THREE.Color(mesh.color[0], mesh.color[1], mesh.color[2])
      : new THREE.Color(SURFACE_COLOR)
    const material = new THREE.MeshStandardMaterial({ color, metalness: 0.15, roughness: 0.65, side: THREE.DoubleSide })
    group.add(new THREE.Mesh(geometry, material))
  }
  return group
}

function meshFromGeometry(geometry: THREE.BufferGeometry): THREE.Object3D {
  if (!geometry.getAttribute('normal')) geometry.computeVertexNormals()
  const material = new THREE.MeshStandardMaterial({ color: SURFACE_COLOR, metalness: 0.15, roughness: 0.65, side: THREE.DoubleSide })
  return new THREE.Mesh(geometry, material)
}

/** Parse the file bytes into a three.js object via the format-appropriate path. */
async function buildObject(buffer: ArrayBuffer, ext: string): Promise<THREE.Object3D> {
  switch (ext) {
    case 'step':
    case 'stp': {
      const occt = await getOcct()
      const result = occt.ReadStepFile(new Uint8Array(buffer), null)
      if (!result?.success) throw new Error('OpenCASCADE could not parse this STEP file')
      return objectFromOcct(result.meshes)
    }
    case 'iges':
    case 'igs': {
      const occt = await getOcct()
      const result = occt.ReadIgesFile(new Uint8Array(buffer), null)
      if (!result?.success) throw new Error('OpenCASCADE could not parse this IGES file')
      return objectFromOcct(result.meshes)
    }
    case 'brep': {
      const occt = await getOcct()
      const result = occt.ReadBrepFile(new Uint8Array(buffer), null)
      if (!result?.success) throw new Error('OpenCASCADE could not parse this BREP file')
      return objectFromOcct(result.meshes)
    }
    case 'stl':
      return meshFromGeometry(new STLLoader().parse(buffer))
    case 'ply':
      return meshFromGeometry(new PLYLoader().parse(buffer))
    case 'obj':
      return new OBJLoader().parse(new TextDecoder().decode(buffer))
    case '3mf':
      return new ThreeMFLoader().parse(buffer)
    case 'glb':
    case 'gltf':
      return await new Promise<THREE.Object3D>((resolve, reject) => {
        new GLTFLoader().parse(buffer, '', (gltf) => resolve(gltf.scene), reject)
      })
    default:
      throw new Error(`Unsupported format: .${ext}`)
  }
}

export default function Model3DViewer({ blob, filename }: { blob: Blob; filename: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let disposed = false
    let frame = 0
    let renderer: THREE.WebGLRenderer | undefined
    let controls: OrbitControls | undefined
    let scene: THREE.Scene | undefined
    let resizeObserver: ResizeObserver | undefined

    setStatus('loading')
    setMessage('')

    void (async () => {
      try {
        const ext = model3DExtension(filename)
        if (!ext) throw new Error('Unsupported file type for 3D preview')

        const buffer = await blob.arrayBuffer()
        const object = await buildObject(buffer, ext)
        if (disposed) return

        const width = container.clientWidth || 800
        const height = container.clientHeight || 480

        scene = new THREE.Scene()
        scene.background = new THREE.Color(0x0b0f17)

        // Centre the model at the origin and frame the camera to its size.
        const box = new THREE.Box3().setFromObject(object)
        const size = box.getSize(new THREE.Vector3())
        const center = box.getCenter(new THREE.Vector3())
        object.position.sub(center)
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        scene.add(object)

        const camera = new THREE.PerspectiveCamera(45, width / height, maxDim / 1000, maxDim * 1000)
        camera.position.set(maxDim * 1.4, maxDim * 1.1, maxDim * 1.8)

        scene.add(new THREE.AmbientLight(0xffffff, 0.75))
        const key = new THREE.DirectionalLight(0xffffff, 1.1)
        key.position.set(1, 1.4, 1)
        scene.add(key)
        const fill = new THREE.DirectionalLight(0xffffff, 0.45)
        fill.position.set(-1, -0.6, -1)
        scene.add(fill)

        renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.setPixelRatio(window.devicePixelRatio)
        renderer.setSize(width, height)
        container.appendChild(renderer.domElement)

        controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.target.set(0, 0, 0)
        controls.update()

        const render = () => {
          frame = requestAnimationFrame(render)
          controls!.update()
          renderer!.render(scene!, camera)
        }
        render()

        resizeObserver = new ResizeObserver(() => {
          const w = container.clientWidth || width
          const h = container.clientHeight || height
          camera.aspect = w / h
          camera.updateProjectionMatrix()
          renderer!.setSize(w, h)
        })
        resizeObserver.observe(container)

        setStatus('ready')
      } catch (err) {
        if (!disposed) {
          setMessage(err instanceof Error ? err.message : String(err))
          setStatus('error')
        }
      }
    })()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      resizeObserver?.disconnect()
      controls?.dispose()
      scene?.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        mesh.geometry?.dispose?.()
        const material = mesh.material
        if (Array.isArray(material)) material.forEach((m) => m.dispose())
        else material?.dispose?.()
      })
      renderer?.dispose()
      renderer?.domElement.remove()
    }
  }, [blob, filename])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {status !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          {status === 'error' ? (
            <>
              <AlertTriangle className="h-5 w-5 text-amber-400" />
              <span className="max-w-sm px-4 text-center">{message}</span>
            </>
          ) : (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Tessellating &amp; rendering…</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
