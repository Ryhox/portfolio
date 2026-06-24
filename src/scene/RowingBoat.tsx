import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { type RefObject, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BOAT_SCALE } from './boatConfig'
import {
  BOAT, BOAT_MAX_SPEED, BOAT_MODEL_DX, BOAT_MODEL_DY, BOAT_MODEL_DZ, BOAT_MODEL_YAW,
} from './boatState'
import { WATER_LEVEL } from './terrain'
import { waveHeight } from './oceanWave'

// minecraft_boat.glb (vovash, CC-BY-4.0) ships its two paddles as separate
// meshes (Object_3 / Object_4). We re-parent each onto a pivot at its top so it
// can swing like a real oar, then drive a catch/recovery stroke with differential
// turning and drips flung off the blades.
const PADDLE_NODES = ['Object_3', 'Object_4']
const STROKE = 0.85 // paddle swing amplitude (radians)
const N_DRIPS = 22
const GRAV = 7

type Paddle = { pivot: THREE.Group; tip: THREE.Object3D; side: 1 | -1 }

export function RowingBoat() {
  const gltf = useGLTF('/models/minecraft_boat.glb')

  // Clone once (so a remount never re-parents the shared cached scene twice) and
  // rig the two paddles onto pivots at their attach points.
  const { model, paddles } = useMemo(() => {
    const model = gltf.scene.clone(true)
    model.updateMatrixWorld(true)
    const paddles: Paddle[] = []
    for (const name of PADDLE_NODES) {
      const p = model.getObjectByName(name)
      if (!p?.parent) continue
      const box = new THREE.Box3().setFromObject(p)
      const c = box.getCenter(new THREE.Vector3())
      const top = new THREE.Vector3(c.x, box.max.y, c.z) // attach point (top of paddle)
      const tipPt = new THREE.Vector3(c.x, box.min.y, c.z) // blade tip (for water FX)
      const parent = p.parent
      const pivot = new THREE.Group()
      parent.add(pivot)
      pivot.position.copy(parent.worldToLocal(top.clone()))
      pivot.updateMatrixWorld(true)
      pivot.attach(p) // keep world transform, now hinged at the pivot
      const tip = new THREE.Object3D()
      pivot.add(tip)
      tip.position.copy(pivot.worldToLocal(tipPt.clone()))
      paddles.push({ pivot, tip, side: c.z < 0 ? -1 : 1 })
    }
    return { model, paddles }
  }, [gltf.scene])

  const rigRef = useRef<THREE.Group>(null)
  const tiltRef = useRef<THREE.Group>(null)
  const modelRef = useRef<THREE.Group>(null)
  const ampL = useRef(0)
  const ampR = useRef(0)
  const rt = useRef([{ wet: false }, { wet: false }])

  // drip pool (world-space — sits at scene root so droplets fall straight down)
  const drips = useMemo(() => {
    const geo = new THREE.SphereGeometry(0.05, 6, 5)
    const mat = new THREE.MeshStandardMaterial({ color: 0xbfe6ef, transparent: true, opacity: 0.8, roughness: 0.3 })
    const mesh = new THREE.InstancedMesh(geo, mat, N_DRIPS)
    mesh.frustumCulled = false
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Park every drip off-screen + invisible to start. The frame loop only
    // rewrites a drip's matrix while it's alive, so the buffer must already hold
    // this hidden pose (an InstancedMesh otherwise defaults to identity = a
    // visible unit sphere at the origin).
    const parked = new THREE.Matrix4().compose(
      new THREE.Vector3(0, -999, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(0.001, 0.001, 0.001),
    )
    for (let i = 0; i < N_DRIPS; i++) mesh.setMatrixAt(i, parked)
    mesh.instanceMatrix.needsUpdate = true
    const data = Array.from({ length: N_DRIPS }, () => ({ x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }))
    return { mesh, data }
  }, [])
  const _dummy = useMemo(() => new THREE.Object3D(), [])
  const _wp = useMemo(() => new THREE.Vector3(), [])

  const spawnDrip = (x: number, y: number, z: number) => {
    for (const d of drips.data) {
      if (d.life > 0) continue
      d.x = x + (Math.random() - 0.5) * 0.2
      d.y = y
      d.z = z + (Math.random() - 0.5) * 0.2
      d.vx = (Math.random() - 0.5) * 0.7
      d.vz = (Math.random() - 0.5) * 0.7
      d.vy = 0.4 + Math.random() * 0.5
      d.life = 0.9
      return
    }
  }

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const time = performance.now() * 0.001
    if (rigRef.current) {
      rigRef.current.position.set(BOAT.x, BOAT.y, BOAT.z)
      rigRef.current.rotation.set(0, BOAT.heading, 0)
    }
    if (tiltRef.current) tiltRef.current.rotation.set(BOAT.pitch, 0, BOAT.roll)

    // Per-paddle effort. Forward/back move BOTH paddles; a pure turn paddles on
    // just ONE side (real canoe steering), so only that paddle swings.
    let tgtL: number
    let tgtR: number
    let dL = 1
    let dR = 1
    if (BOAT.throttle < -0.05) {
      tgtL = tgtR = Math.min(1, -BOAT.throttle) // reversing: both back-paddle
      dL = dR = -1
    } else {
      tgtL = Math.min(1, Math.max(0, BOAT.throttle + BOAT.turn))
      tgtR = Math.min(1, Math.max(0, BOAT.throttle - BOAT.turn))
    }
    ampL.current += (tgtL - ampL.current) * Math.min(1, dt * 7)
    ampR.current += (tgtR - ampR.current) * Math.min(1, dt * 7)

    const active = Math.max(ampL.current, ampR.current)
    if (active > 0.04) {
      const freq = 0.7 + 0.55 * Math.min(1, Math.abs(BOAT.speed) / BOAT_MAX_SPEED)
      BOAT.rowPhase = (BOAT.rowPhase + dt * freq) % 1
    }

    const phase = BOAT.rowPhase * Math.PI * 2
    for (let i = 0; i < paddles.length; i++) {
      const pad = paddles[i]
      const left = pad.side < 0
      const amp = left ? ampL.current : ampR.current
      const dir = left ? dL : dR
      // swing the paddle fore↔aft around its hinge (rest pose at 0)
      pad.pivot.rotation.y = STROKE * Math.sin(phase) * dir * amp

      // water FX from the blade tip
      const r = rt.current[i]
      pad.tip.getWorldPosition(_wp)
      const wy = WATER_LEVEL + waveHeight(_wp.x, _wp.z, time)
      const planted = _wp.y < wy + 0.05 && amp > 0.22
      // No wake ripples — they flicker badly far from the ripple-field centre.
      // Keep just the drips flung off the blades on the recovery stroke.
      if (r.wet && !planted && amp > 0.3) {
        const n = 3 + Math.floor(Math.random() * 3)
        for (let k = 0; k < n; k++) spawnDrip(_wp.x, _wp.y, _wp.z)
      }
      r.wet = planted
    }

    // Advance falling drips. Only the live ones (and the frame one lands) touch
    // their matrix — once they've all settled, the buffer already holds them parked
    // off-screen, so we skip the per-frame GPU upload entirely while the boat idles.
    let dirty = false
    for (let i = 0; i < drips.data.length; i++) {
      const d = drips.data[i]
      if (d.life <= 0) continue
      d.vy -= GRAV * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.z += d.vz * dt
      d.life -= dt
      const wy = WATER_LEVEL + waveHeight(d.x, d.z, time)
      if (d.y <= wy) d.life = 0
      _dummy.position.set(d.x, d.life > 0 ? d.y : -999, d.z)
      _dummy.scale.setScalar(d.life > 0 ? 0.6 + d.life * 0.5 : 0.001)
      _dummy.updateMatrix()
      drips.mesh.setMatrixAt(i, _dummy.matrix)
      dirty = true
    }
    if (dirty) drips.mesh.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <group ref={rigRef}>
        <group ref={tiltRef}>
          <group
            ref={modelRef}
            position={[BOAT_MODEL_DX, BOAT_MODEL_DY, BOAT_MODEL_DZ]}
            rotation={[0, BOAT_MODEL_YAW, 0]}
            scale={BOAT_SCALE}
          >
            <primitive object={model} />
          </group>
        </group>
      </group>

      <primitive object={drips.mesh} />

      {import.meta.env.DEV && <DevMeasure modelRef={modelRef} />}
    </>
  )
}

// Dev helper: expose the hull's world bounding box for screenshot tuning.
function DevMeasure({ modelRef }: { modelRef: RefObject<THREE.Group> }) {
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __measureBoat: () => unknown }).__measureBoat = () => {
      if (!modelRef.current) return null
      const hull = modelRef.current.getObjectByName('Object_2') ?? modelRef.current
      const b = new THREE.Box3().setFromObject(hull)
      const s = new THREE.Vector3()
      const c = new THREE.Vector3()
      b.getSize(s)
      b.getCenter(c)
      return { size: [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)], center: [+c.x.toFixed(2), +c.y.toFixed(2), +c.z.toFixed(2)] }
    }
  }
  return null
}

useGLTF.preload('/models/minecraft_boat.glb')
