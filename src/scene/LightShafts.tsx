import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { HEART, REGIONS } from './layout'
import { getSky } from './palette'
import { getHeight } from './terrain'
import { useWorld } from '../state/useWorld'

// God-ray light shafts as real geometry — soft additive beams of sunlight raking
// down through the canopy in the haze, the way the previews read. Done with
// meshes (not a post-process pass) so they show reliably on every GPU regardless
// of where the camera looks. Each shaft is a trio of crossed gradient quads (so
// it reads as a volume from any angle); each shimmers on its own phase (light
// filtering through moving leaves) and the whole field tilts to follow the sun.

// Soft, wide beam: brightest through the mid-lower length (down among the trees)
// and feathered away at the top so it melts into the sky rather than streaking
// across it, and soft at the sides.
export function useShaftTexture() {
  return useMemo(() => {
    const W = 96
    const H = 256
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    const img = ctx.createImageData(W, H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const hx = x / W - 0.5
        const horiz = Math.exp(-(hx * hx) / (2 * 0.2 * 0.2)) // wide, soft column
        const vt = y / H // 0 = top (toward sun), 1 = bottom (ground)
        // bell centred low-middle: faint up in the open sky, present among trees
        const vert = Math.exp(-((vt - 0.62) * (vt - 0.62)) / (2 * 0.26 * 0.26))
        const a = Math.max(0, horiz * vert)
        const i = (y * W + x) * 4
        img.data[i] = 255
        img.data[i + 1] = 255
        img.data[i + 2] = 255
        img.data[i + 3] = a * 255
      }
    }
    ctx.putImageData(img, 0, 0)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
}

// Clearings / treed spots where shafts look good.
const SPOTS: [number, number][] = [
  [REGIONS.autumnGrove.x + 4, REGIONS.autumnGrove.z - 2],
  [REGIONS.pineGrove.x - 3, REGIONS.pineGrove.z + 5],
  [HEART.x + 7, HEART.z + 3],
  [HEART.x - 8, HEART.z - 5],
  [REGIONS.meadow.x - 6, REGIONS.meadow.z - 6],
  [9, 8],
  [REGIONS.spookyCorner.x - 4, REGIONS.spookyCorner.z + 5],
]

export function LightShafts() {
  const tex = useShaftTexture()
  const root = useRef<THREE.Group>(null!)
  const shaftRefs = useRef<THREE.Group[]>([])

  const shafts = useMemo(() => SPOTS.map(([x, z], i) => ({ x, y: getHeight(x, z), z, phase: i * 1.7 })), [])
  const mats = useMemo(
    () =>
      shafts.map(() => {
        const m = new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          fog: false,
          side: THREE.DoubleSide,
          color: new THREE.Color(0xfff0d6),
          opacity: 0,
        })
        // Clip to ring boundary but don't apply glow colour — shafts are
        // additive overlays; baking glow into them doubles the effect.
        ;(m as any).__revealGlowOff = true
        return m
      }),
    [tex, shafts],
  )
  const q = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])

  useFrame((state) => {
    const started = useWorld.getState().started
    const s = getSky(useWorld.getState().t)
    // tilt every shaft to point up toward the sun (parallel light)
    q.setFromUnitVectors(up, s.sunDir)
    const time = state.clock.elapsedTime
    // god rays are a low-sun phenomenon: strong at dawn/dusk (golden), faint at
    // high noon so they never streak the open midday sky
    const base = 0.045 * s.dayAmt + 0.22 * s.golden
    root.current.visible = base > 0.01
    if (!root.current.visible) return
    shaftRefs.current.forEach((g, i) => {
      if (!g) return
      g.quaternion.copy(q)
      // each beam shimmers on its own slow phase — light through moving leaves
      const flick = 0.55 + 0.45 * Math.sin(time * (0.5 + i * 0.06) + shafts[i].phase)
      mats[i].opacity = base * flick
      mats[i].color.copy(s.sunColor)
    })
  })

  return (
    <group ref={root}>
      {shafts.map((p, i) => (
        <group key={i} ref={(el) => (shaftRefs.current[i] = el!)} position={[p.x, p.y, p.z]}>
          {[0, Math.PI / 3, (2 * Math.PI) / 3].map((r, j) => (
            <mesh key={j} rotation={[0, r, 0]} position={[0, 9, 0]} material={mats[i]}>
              <planeGeometry args={[11, 30]} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}
