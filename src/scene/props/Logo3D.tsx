import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { useWorld } from '../../state/useWorld'
import { getSky } from '../core/palette'
import { patchReveal } from '../terrain/patchReveal'
import type { LogoModel } from '../summit/summit'

// ---------------------------------------------------------------------------
// The 3D piece that floats over each summit pedestal. GitHub + Discord use the
// real mascot GLBs (the Octocat kitten + the Wumpus); Email is an envelope built
// by extruding a mail icon. Each one SELF-ILLUMINATES in its own colours (emissive
// from its own texture/colour), so it glows brightly while keeping its real look,
// swelling from day → night. (The coloured POINT light on the pedestal is what
// actually spills that colour onto the stone — see SummitScene.)
// ---------------------------------------------------------------------------

const GLB: Partial<Record<LogoModel, string>> = {
  github: '/models/github_kitten.glb',
  discord: '/models/wumpus.glb',
}

const CFG: Record<LogoModel, { size: number; yaw: number }> = {
  github: { size: 0.95, yaw: 0 },
  discord: { size: 1.0, yaw: 0 },
  envelope: { size: 0.72, yaw: 0 },
}

// Make a material self-illuminate in its OWN colours and return it for animating.
function makeGlow(c: THREE.Material): THREE.MeshStandardMaterial | null {
  const m = c as THREE.MeshStandardMaterial
  if (!('emissive' in m) || !m.emissive) return null
  if (m.map) {
    m.emissiveMap = m.map
    m.emissive.set(0xffffff)
  } else if (m.color) {
    m.emissive.copy(m.color)
  }
  m.emissiveIntensity = 0
  m.needsUpdate = true
  return m
}

function useGlow(mats: React.MutableRefObject<THREE.MeshStandardMaterial[]>, seed = 0) {
  useFrame((state) => {
    const nf = getSky(useWorld.getState().t).nightFactor
    const pulse = 0.92 + Math.sin(state.clock.elapsedTime * 1.6 + seed) * 0.08
    const e = (0.7 + nf * 0.85) * pulse
    for (const m of mats.current) m.emissiveIntensity = e
  })
}

function prepModel(scene: THREE.Object3D, size: number) {
  const root = scene.clone(true)
  root.updateMatrixWorld(true)
  const dim = new THREE.Vector3()
  new THREE.Box3().setFromObject(root).getSize(dim)
  root.scale.setScalar(size / (dim.y || 1))
  root.updateMatrixWorld(true)
  const box = new THREE.Box3().setFromObject(root)
  const center = new THREE.Vector3()
  box.getCenter(center)
  root.position.set(-center.x, -box.min.y, -center.z)
  const mats: THREE.MeshStandardMaterial[] = []
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!(mesh as { isMesh?: boolean }).isMesh) return
    mesh.castShadow = true
    const patch = (src: THREE.Material) => {
      const c = src.clone()
      const g = makeGlow(c)
      if (g) mats.push(g)
      patchReveal(c)
      return c
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(patch) : patch(mesh.material)
  })
  return { root, mats }
}

function GltfLogo({ url, size, yaw }: { url: string; size: number; yaw: number }) {
  const { scene } = useGLTF(url)
  const { root, mats } = useMemo(() => prepModel(scene, size), [scene, size])
  const matRef = useRef(mats)
  matRef.current = mats
  useGlow(matRef, size * 7)
  return (
    <group rotation={[0, yaw, 0]}>
      <primitive object={root} />
    </group>
  )
}

// A filled mail icon (Material "email", 24×24 viewBox, y-down): a rounded body
// with the flap crease, so it reads clearly as an envelope when extruded.
const MAIL_PATH =
  'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z'

function shapesFromSvg(path: string): THREE.Shape[] {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${path}"/></svg>`
  const data = new SVGLoader().parse(svg)
  const shapes: THREE.Shape[] = []
  for (const p of data.paths) shapes.push(...SVGLoader.createShapes(p))
  return shapes
}

function Envelope({ color, size }: { color: number; size: number }) {
  const { geom, mat } = useMemo(() => {
    const shapes = shapesFromSvg(MAIL_PATH)
    const g = new THREE.ExtrudeGeometry(shapes, {
      depth: 4,
      bevelEnabled: true,
      bevelThickness: 0.8,
      bevelSize: 0.5,
      bevelSegments: 2,
    })
    g.scale(1, -1, 1) // SVG is y-down
    // Centre + scale to `size` (by the larger of width/height) and seat base at 0.
    g.computeBoundingBox()
    const b = g.boundingBox!
    const cx = (b.min.x + b.max.x) / 2
    const cz = (b.min.z + b.max.z) / 2
    g.translate(-cx, -b.min.y, -cz)
    const k = size / Math.max(b.max.x - b.min.x, b.max.y - b.min.y)
    g.scale(k, k, k)

    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1, emissive: color, emissiveIntensity: 0 })
    patchReveal(m)
    return { geom: g, mat: m }
  }, [color, size])

  const matRef = useRef<THREE.MeshStandardMaterial[]>([mat])
  matRef.current = [mat]
  useGlow(matRef, 3)

  // Stand it upright (the icon is built in the XY plane lying flat after centring).
  return <mesh geometry={geom} material={mat} castShadow />
}

export function Logo3D({ model, color }: { model: LogoModel; color: number }) {
  const cfg = CFG[model]
  if (model === 'envelope') return <Envelope color={color} size={cfg.size} />
  return <GltfLogo url={GLB[model]!} size={cfg.size} yaw={cfg.yaw} />
}

useGLTF.preload('/models/github_kitten.glb')
useGLTF.preload('/models/wumpus.glb')
