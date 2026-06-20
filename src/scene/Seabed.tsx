import { useFrame } from '@react-three/fiber'
import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { smoothstep } from './palette'
import { getHeight } from './terrain'
import { useNature } from './loadNature'
import { useWorld } from '../state/useWorld'
import { n } from './config'
import { SEABED_HALF, mulberry32, seabedHeight } from './seabedField'

const _m4 = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _p = new THREE.Vector3()
const _s = new THREE.Vector3(1, 1, 1)

// The ocean floor + its flora. A big deterministic dune field tucked under the
// island, dressed with the project's own grass (reused as seagrass) and a few
// hand-made stylized corals. Everything is kept out of the island reveal and is
// only ever seen once you dive, so it simply rides the world like the rest of
// the sea.

const TAU = Math.PI * 2
const patched = <M extends THREE.Material>(m: M): M => {
  ;(m as any).__revealPatched = true
  return m
}

// ---- the floor -------------------------------------------------------------
function SeabedFloor() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(SEABED_HALF * 2, SEABED_HALF * 2, 220, 220)
    g.rotateX(-Math.PI / 2)
    const pos = g.attributes.position as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const deep = new THREE.Color(0x2f8f82) // brighter happy teal
    const sand = new THREE.Color(0xe7d8a6) // bright sunlit sand
    const rock = new THREE.Color(0x77808a)
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const z = pos.getZ(i)
      const h = seabedHeight(x, z)
      pos.setY(i, h)
      const shallow = smoothstep(-15, -5, h)
      c.copy(deep).lerp(sand, shallow)
      const mottle = Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.5 + 0.5
      c.lerp(rock, mottle * 0.14)
      colors[i * 3] = c.r
      colors[i * 3 + 1] = c.g
      colors[i * 3 + 2] = c.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    g.computeVertexNormals()
    return g
  }, [])
  const mat = useMemo(
    () => patched(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide })),
    [],
  )
  return <mesh geometry={geo} material={mat} receiveShadow />
}

// ---- stylized corals (instanced branches, deterministic) -------------------
function Corals() {
  const im = useMemo(() => {
    const branch = new THREE.CylinderGeometry(0.05, 0.16, 1.1, 6)
    branch.translate(0, 0.55, 0)
    const palette = [0xff8fb3, 0xffae5c, 0xb98cff, 0xff6f91, 0x6fd1c4]
    const rng = mulberry32(7)
    const centers: { x: number; y: number; z: number; col: number }[] = []
    const target = n(22)
    let guard = 0
    while (centers.length < target && guard < target * 40) {
      guard++
      const ang = rng() * TAU
      const rad = 74 + Math.sqrt(rng()) * 135
      const x = Math.cos(ang) * rad
      const z = Math.sin(ang) * rad
      if (getHeight(x, z) > -1) continue
      const y = seabedHeight(x, z)
      if (y > -2.5) continue
      centers.push({ x, y, z, col: palette[Math.floor(rng() * palette.length)] })
    }
    const per = 5
    const mat = patched(new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0 }))
    const mesh = new THREE.InstancedMesh(branch, mat, Math.max(1, centers.length * per))
    mesh.frustumCulled = false
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    const col = new THREE.Color()
    let idx = 0
    for (const ce of centers) {
      for (let b = 0; b < per; b++) {
        const yaw = rng() * TAU
        const lean = 0.15 + rng() * 0.5
        const sc = 0.6 + rng() * 0.9
        e.set(Math.cos(yaw) * lean, yaw, Math.sin(yaw) * lean)
        q.setFromEuler(e)
        p.set(ce.x + Math.cos(yaw) * 0.3, ce.y, ce.z + Math.sin(yaw) * 0.3)
        s.set(sc, sc * (0.9 + rng() * 0.6), sc)
        m4.compose(p, q, s)
        mesh.setMatrixAt(idx, m4)
        mesh.setColorAt(idx, col.setHex(ce.col).multiplyScalar(1.05 + rng() * 0.35)) // bright + happy
        idx++
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    return mesh
  }, [])
  return <primitive object={im} />
}

// ---- seagrass (reuses the project's grass models) --------------------------
type Item = { x: number; y: number; z: number; rotY: number; scale: number; m: number }

function Seagrass() {
  const nature = useNature()
  // lush mix: tall blades + wispy blades + a broad-leaf plant, like the reference
  const models = useMemo(
    () => ['Grass_Common_Tall', 'Grass_Wispy_Tall', 'Plant_1'].map((k) => nature[k]).filter(Boolean),
    [nature],
  )

  const items = useMemo<Item[]>(() => {
    const rng = mulberry32(99)
    const out: Item[] = []
    const target = n(620)
    let guard = 0
    while (out.length < target && guard < target * 40) {
      guard++
      const ang = rng() * TAU
      const rad = 70 + Math.sqrt(rng()) * 150 // 70 → 220, near shore out to open water
      const x = Math.cos(ang) * rad
      const z = Math.sin(ang) * rad
      if (getHeight(x, z) > -0.5) continue // skip land / dry shore
      const y = seabedHeight(x, z)
      if (y > -2.2) continue
      out.push({ x, y, z, rotY: rng() * TAU, scale: 0.85 + rng() * 1.7, m: Math.floor(rng() * 3) })
    }
    return out
  }, [])

  const meshes = useMemo(() => {
    const out: THREE.InstancedMesh[] = []
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const p = new THREE.Vector3()
    const s = new THREE.Vector3()
    const targetH = 2.8
    models.forEach((model, mi) => {
      if (!model) return
      const mine = items.filter((it) => it.m % models.length === mi)
      if (!mine.length) return
      const baseScale = targetH / (model.size.y || 1)
      for (const part of model.parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, mine.length)
        im.frustumCulled = false
        mine.forEach((it, i) => {
          const fs = baseScale * it.scale
          e.set(0, it.rotY, 0) // upright with random yaw
          q.setFromEuler(e)
          p.set(it.x, it.y - model.minY * fs, it.z)
          s.set(fs, fs, fs)
          m4.compose(p, q, s)
          im.setMatrixAt(i, m4)
        })
        im.instanceMatrix.needsUpdate = true
        out.push(im)
      }
    })
    return out
  }, [models, items])

  return (
    <>
      {meshes.map((im, i) => (
        <primitive key={i} object={im} />
      ))}
    </>
  )
}

// ---- colorful reef fish (little schools circling the reef) -----------------
function ReefFish() {
  const COLORS = [0xff8a3d, 0xffd23f, 0x4fc3ff, 0xff6fae, 0x9b7bff, 0x5fe6a0]

  const { mesh, fish } = useMemo(() => {
    const rng = mulberry32(303)
    const schools: { cx: number; cz: number; cy: number; r: number; spd: number; n: number; col: number }[] = []
    const target = n(10)
    let guard = 0
    while (schools.length < target && guard < target * 40) {
      guard++
      const ang = rng() * TAU
      const rad = 76 + Math.sqrt(rng()) * 120
      const cx = Math.cos(ang) * rad
      const cz = Math.sin(ang) * rad
      if (getHeight(cx, cz) > -2) continue
      schools.push({
        cx,
        cz,
        cy: seabedHeight(cx, cz) + 2.2 + rng() * 2.5,
        r: 2.5 + rng() * 3,
        spd: (0.4 + rng() * 0.5) * (rng() < 0.5 ? 1 : -1),
        n: 4 + Math.floor(rng() * 4),
        col: COLORS[Math.floor(rng() * COLORS.length)],
      })
    }

    const fish: { s: (typeof schools)[number]; phase: number; rr: number; yoff: number }[] = []
    const frng = mulberry32(404)
    for (const s of schools) for (let i = 0; i < s.n; i++) fish.push({ s, phase: frng() * TAU, rr: s.r * (0.7 + frng() * 0.5), yoff: (frng() - 0.5) * 1.2 })

    const geo = new THREE.SphereGeometry(0.16, 8, 6)
    geo.scale(2.0, 0.8, 0.8)
    const m = patched(new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 }))
    const mesh = new THREE.InstancedMesh(geo, m, Math.max(1, fish.length))
    mesh.frustumCulled = false
    const col = new THREE.Color()
    fish.forEach((f, i) => mesh.setColorAt(i, col.setHex(f.s.col)))
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    return { mesh, fish }
  }, [])

  useFrame((state) => {
    if (!useWorld.getState().worldVisible) return
    const t = state.clock.elapsedTime
    fish.forEach((f, i) => {
      const a = f.phase + t * f.s.spd
      const x = f.s.cx + Math.cos(a) * f.rr
      const z = f.s.cz + Math.sin(a) * f.rr
      const y = f.s.cy + f.yoff + Math.sin(t * 1.5 + f.phase) * 0.25
      const tang = a + (f.s.spd > 0 ? Math.PI / 2 : -Math.PI / 2)
      _e.set(0, -tang, 0)
      _q.setFromEuler(_e)
      _p.set(x, y, z)
      _m4.compose(_p, _q, _s)
      mesh.setMatrixAt(i, _m4)
    })
    mesh.instanceMatrix.needsUpdate = true
  })

  return <primitive object={mesh} />
}

export function Seabed() {
  return (
    <>
      <SeabedFloor />
      <Corals />
      <ReefFish />
      <Suspense fallback={null}>
        <Seagrass />
      </Suspense>
    </>
  )
}
