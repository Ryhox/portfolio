import { useFrame } from '@react-three/fiber'
import { Suspense, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { WATER_LEVEL } from '../terrain/layout'
import { getSky } from '../core/palette'
import { useWorld } from '../../state/useWorld'
import { useLoadStatus } from '../../ui/intro/loadStatus'
import { WORLD_ALPHA } from '../terrain/revealUniforms'
import { waveHeight, waveNormal } from './oceanWave'
import { n } from '../core/config'
import { JumpingFish } from './FishLife'

// Living touches out on the sea, all kept OUT of the island reveal (visible from
// the idle screen on): little birds drifting the horizon, fish that arc out of
// the water with a splash, and driftwood riding the swell. Everything fades with
// the world (WORLD_ALPHA), never with the click.

const _nrm = { x: 0, y: 1, z: 0 }

// ---- birds ----------------------------------------------------------------
// The front flock sweeps left→right across the idle camera's forward view (toward
// -Z) and wraps around off-screen, so birds glide past continuously the whole time.
const FRONT_ANG = -Math.PI / 2
const FRONT_ARC = 1.0 // half-width of the sweep; the wrap point sits outside the fov
function Birds() {
  const root = useRef<THREE.Group>(null!)
  const birdRefs = useRef<THREE.Group[]>([])
  const wingRefs = useRef<{ l: THREE.Mesh; r: THREE.Mesh }[]>([])

  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: 0x2a3340,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      fog: false, // read as silhouettes near the skyline despite the haze
      depthWrite: false,
    })
    ;(m as any).__revealPatched = true
    return m
  }, [])
  // Wings hinge at the BODY (inner edge at the origin) so each wing tilts as one
  // rigid piece like a real wing — instead of pivoting about its own midpoint,
  // which made the two halves swing opposite ways and cross (the "broken" look).
  const wingGeoR = useMemo(() => { const g = new THREE.PlaneGeometry(2.4, 0.6); g.translate(1.2, 0, 0); return g }, [])
  const wingGeoL = useMemo(() => { const g = new THREE.PlaneGeometry(2.4, 0.6); g.translate(-1.2, 0, 0); return g }, [])

  const birds = useMemo(() => {
    const count = n(18)
    return Array.from({ length: count }, (_, i) => {
      const flock = i % 3 // 0,1 = side flocks (orbit); 2 = the "front" flock in the idle view
      const front = flock === 2
      const baseAng = flock === 0 ? 2.3 : 0.7
      const dir = flock === 0 ? -1 : 1
      return {
        front,
        radius: front ? 170 + Math.random() * 90 : 150 + Math.random() * 90, // front flock further out
        height: front ? 34 + Math.random() * 26 : 30 + Math.random() * 45,
        ang: baseAng + (Math.random() - 0.5) * 0.4, // side flocks orbit from here
        offset: Math.random() * (FRONT_ARC * 2), // front flock: start spread across the sweep
        speed: front ? 0.05 + Math.random() * 0.03 : (0.01 + Math.random() * 0.012) * dir,
        flapSpeed: 7 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
        bob: 0.4 + Math.random() * 0.6,
      }
    })
  }, [])

  useFrame((state) => {
    if (!useWorld.getState().worldVisible) {
      root.current.visible = false
      return
    }
    const s = getSky(useWorld.getState().t)
    const vis = s.dayAmt * WORLD_ALPHA.value // birds are a daytime thing
    root.current.visible = vis > 0.03
    if (!root.current.visible) return
    mat.opacity = 0.7 * vis
    const time = state.clock.elapsedTime
    birds.forEach((b, i) => {
      const g = birdRefs.current[i]
      if (!g) return
      let ang: number
      if (b.front) {
        // continuous left→right sweep across the forward arc; wraps off-screen
        const span = FRONT_ARC * 2
        const u = (((time * b.speed + b.offset) % span) + span) % span
        ang = FRONT_ANG - FRONT_ARC + u
      } else {
        ang = b.ang + time * b.speed
      }
      const x = Math.cos(ang) * b.radius
      const z = Math.sin(ang) * b.radius
      const y = b.height + Math.sin(time * 0.5 + b.phase) * b.bob
      g.position.set(x, y, z)
      // face travel direction (tangent to the circle)
      g.rotation.y = -ang + (b.speed > 0 ? Math.PI / 2 : -Math.PI / 2)
      const flap = Math.sin(time * b.flapSpeed + b.phase) * 0.6 + 0.25
      const w = wingRefs.current[i]
      if (w) {
        // hinged at the body: both tips rise together (gentle upward V) and beat down
        w.r.rotation.z = flap
        w.l.rotation.z = -flap
      }
    })
  })

  return (
    <group ref={root}>
      {birds.map((_, i) => (
        <group key={i} ref={(el) => (birdRefs.current[i] = el!)}>
          <mesh
            ref={(el) => {
              wingRefs.current[i] = { ...(wingRefs.current[i] || {}), l: el! } as any
            }}
            geometry={wingGeoL}
            material={mat}
          />
          <mesh
            ref={(el) => {
              wingRefs.current[i] = { ...(wingRefs.current[i] || {}), r: el! } as any
            }}
            geometry={wingGeoR}
            material={mat}
          />
        </group>
      ))}
    </group>
  )
}

// ---- floating debris: planks, crates, barrels, bottles --------------------
function FloatingDebris() {
  const types = useMemo(() => {
    const mk = (color: number, rough: number) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 })
      ;(m as any).__revealPatched = true
      return m
    }
    const plank = new THREE.BoxGeometry(2.6, 0.26, 0.6)
    const plank2 = new THREE.BoxGeometry(1.8, 0.22, 0.5)
    const crate = new THREE.BoxGeometry(1.0, 0.9, 1.0)
    const barrel = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 10)
    barrel.rotateZ(Math.PI / 2) // lie on its side
    const bottle = new THREE.CylinderGeometry(0.16, 0.16, 0.7, 8)
    bottle.rotateZ(Math.PI / 2)
    return [
      { geo: plank, mat: mk(0x6b4f33, 0.95) },
      { geo: plank2, mat: mk(0x7a5a3a, 0.95) },
      { geo: crate, mat: mk(0x8a6a40, 0.9) },
      { geo: barrel, mat: mk(0x9a5f38, 0.8) },
      { geo: bottle, mat: mk(0x3f7a55, 0.4) },
    ]
  }, [])

  // more pieces, spread from near the shore out into the distance
  const items = useMemo(
    () =>
      Array.from({ length: n(18) }, () => ({
        ang0: Math.random() * Math.PI * 2,
        rad: 78 + Math.random() * 122, // 78 → 200
        drift: (Math.random() - 0.5) * 0.018,
        yaw: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.05,
        type: Math.floor(Math.random() * 5),
      })),
    [],
  )
  const refs = useRef<THREE.Mesh[]>([])
  const root = useRef<THREE.Group>(null!)

  useFrame((state) => {
    // The debris is MOUNTED from the first frame — never `return null`-ed — so the
    // loading-screen warm-up compiles these shadow-casting standard materials and
    // uploads their geometry up front. Mounting them only when `started` flips made
    // all of that happen on their first draw the instant control took over: a
    // one-frame compile/upload stall right at the end of the intro (the falling
    // leaves visibly jumped as the clock lurched past the stall). Now visibility,
    // not mounting, is gated: shown while warming (behind the loading veil, unseen)
    // and once the game is live, but hidden on the idle/reveal screen so no trash
    // drifts across the cinematic.
    const started = useWorld.getState().started
    root.current.visible = !useLoadStatus.getState().warmReady || started
    if (!started) return
    const time = state.clock.elapsedTime
    items.forEach((l, i) => {
      const mesh = refs.current[i]
      if (!mesh) return
      const ang = l.ang0 + time * l.drift
      const x = Math.cos(ang) * l.rad
      const z = Math.sin(ang) * l.rad
      const y = WATER_LEVEL + waveHeight(x, z, time)
      waveNormal(x, z, time, 0.6, _nrm)
      mesh.position.set(x, y + 0.02, z)
      // ride the swell: small tilt with the surface, slow yaw
      mesh.rotation.set(_nrm.z * 0.7, l.yaw + time * l.spin, -_nrm.x * 0.7)
    })
  })

  return (
    <group ref={root}>
      {items.map((it, i) => (
        <mesh
          key={i}
          ref={(el) => (refs.current[i] = el!)}
          geometry={types[it.type].geo}
          material={types[it.type].mat}
          castShadow
        />
      ))}
    </group>
  )
}

export function OceanLife() {
  const mapId = useWorld((s) => s.mapId)
  // The jumping fish and the floating driftwood belong to the home isle only —
  // the Stargazers Isles stay clean (no leaping fish, no trash on the water).
  const home = mapId === 'home'
  return (
    <>
      <Birds />
      {home && (
        <Suspense fallback={null}>
          <JumpingFish />
        </Suspense>
      )}
      {home && <FloatingDebris />}
    </>
  )
}
