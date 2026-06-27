import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getSky } from '../core/palette'
import { useWorld } from '../../state/useWorld'
import { useShaftTexture } from './LightShafts'
import { NAV } from '../boat/boatState'
import { archHeight, foamIslands } from '../archipelago/archipelago'

// God-ray shafts for the archipelago. Same crossed-quad beams as the home isle
// (see LightShafts.tsx), but there's no fixed set of clearings out here — islands
// are scattered across a huge sea — so we keep a small pool of beams and, each
// refresh, park them over the islands nearest the player. The pool follows you as
// you sail, so the shafts always rake down over the isles around you.
const POOL = 6

export function ArchLightShafts() {
  const tex = useShaftTexture()
  const root = useRef<THREE.Group>(null!)
  const shaftRefs = useRef<THREE.Group[]>([])
  const refresh = useRef(0)

  const phases = useMemo(() => Array.from({ length: POOL }, (_, i) => i * 1.7), [])
  const mats = useMemo(
    () =>
      Array.from({ length: POOL }, () => {
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
        return m
      }),
    [tex],
  )
  const q = useMemo(() => new THREE.Quaternion(), [])
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), [])

  useFrame((state, dt) => {
    const started = useWorld.getState().started
    const s = getSky(useWorld.getState().t)
    // tilt every shaft to point up toward the sun (parallel light)
    q.setFromUnitVectors(up, s.sunDir)
    const time = state.clock.elapsedTime
    // god rays are a low-sun phenomenon: strong at dawn/dusk (golden), faint at
    // high noon so they never streak the open midday sky
    const base = 0.045 * s.dayAmt + 0.22 * s.golden
    root.current.visible = started && base > 0.01
    if (!root.current.visible) return

    // Re-park the pool over the nearest islands a few times a second (the sort is
    // the only real cost) — the tilt + shimmer below run every frame for smoothness.
    refresh.current += dt
    if (refresh.current > 0.2) {
      refresh.current = 0
      const near = foamIslands(NAV.px, NAV.pz, POOL)
      shaftRefs.current.forEach((g, i) => {
        if (!g) return
        const isl = near[i]
        if (!isl) {
          g.visible = false
          return
        }
        g.visible = true
        g.position.set(isl.cx, archHeight(isl.cx, isl.cz), isl.cz)
      })
    }

    shaftRefs.current.forEach((g, i) => {
      if (!g || !g.visible) return
      g.quaternion.copy(q)
      // each beam shimmers on its own slow phase — light through moving leaves
      const flick = 0.55 + 0.45 * Math.sin(time * (0.5 + i * 0.06) + phases[i])
      mats[i].opacity = base * flick
      mats[i].color.copy(s.sunColor)
    })
  })

  return (
    <group ref={root}>
      {phases.map((_, i) => (
        <group key={i} ref={(el) => (shaftRefs.current[i] = el!)} visible={false}>
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
