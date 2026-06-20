import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { ISLAND_RADIUS, WATER_LEVEL } from './layout'
import { getSky } from './palette'
import { useWorld } from '../state/useWorld'
import { WORLD_ALPHA } from './revealUniforms'
import { waveHeight, waveNormal } from './oceanWave'
import { addRipple } from './rippleField'
import { n } from './config'

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

// ---- jumping fish ----------------------------------------------------------
function Fish() {
  const geo = useMemo(() => {
    const g = new THREE.SphereGeometry(0.4, 10, 8)
    g.scale(2.2, 0.7, 0.7) // stretched little body
    return g
  }, [])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: 0x8fa6b4, roughness: 0.4, metalness: 0.3 })
    ;(m as any).__revealPatched = true
    return m
  }, [])

  const fish = useMemo(
    () =>
      Array.from({ length: n(3) }, () => ({
        active: false,
        nextAt: 1 + Math.random() * 5,
        t0: 0,
        dur: 1,
        x: 0,
        z: 0,
        dir: 0,
        peak: 2,
        speed: 4,
      })),
    [],
  )
  const refs = useRef<THREE.Mesh[]>([])

  useFrame((state) => {
    if (!useWorld.getState().worldVisible) return
    const time = state.clock.elapsedTime
    fish.forEach((f, i) => {
      const mesh = refs.current[i]
      if (!mesh) return
      if (!f.active) {
        mesh.visible = false
        if (time > f.nextAt) {
          // launch a new jump somewhere out in the sea
          const ang = Math.random() * Math.PI * 2
          const rad = ISLAND_RADIUS + 8 + Math.random() * 110
          f.x = Math.cos(ang) * rad
          f.z = Math.sin(ang) * rad
          f.dir = Math.random() * Math.PI * 2
          f.dur = 1.0 + Math.random() * 0.5
          f.peak = 1.6 + Math.random() * 1.3
          f.speed = 3 + Math.random() * 3
          f.t0 = time
          f.active = true
          addRipple(f.x, f.z, 0.45, 3.0) // takeoff splash
        }
        return
      }
      const p = (time - f.t0) / f.dur
      if (p >= 1) {
        f.active = false
        f.nextAt = time + 4 + Math.random() * 9
        addRipple(f.x, f.z, 0.6, 3.4) // landing splash
        mesh.visible = false
        return
      }
      f.x += Math.cos(f.dir) * f.speed * 0.016
      f.z += Math.sin(f.dir) * f.speed * 0.016
      const surfaceY = WATER_LEVEL + waveHeight(f.x, f.z, time)
      const arc = Math.sin(p * Math.PI) * f.peak
      mesh.visible = true
      mesh.position.set(f.x, surfaceY + arc - 0.2, f.z)
      // nose up on the way out, down on the way in
      const pitch = Math.cos(p * Math.PI) * 0.9
      mesh.rotation.set(0, -f.dir, pitch)
    })
  })

  return (
    <>
      {fish.map((_, i) => (
        <mesh key={i} ref={(el) => (refs.current[i] = el!)} geometry={geo} material={mat} visible={false} />
      ))}
    </>
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
  const started = useWorld((s) => s.started)

  useFrame((state) => {
    if (!useWorld.getState().started) return
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

  if (!started) return null // no debris on the idle "click to start" screen
  return (
    <>
      {items.map((it, i) => (
        <mesh
          key={i}
          ref={(el) => (refs.current[i] = el!)}
          geometry={types[it.type].geo}
          material={types[it.type].mat}
          castShadow
        />
      ))}
    </>
  )
}

export function OceanLife() {
  return (
    <>
      <Birds />
      <Fish />
      <FloatingDebris />
    </>
  )
}
