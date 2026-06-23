import { Suspense, useMemo } from 'react'
import * as THREE from 'three'
import { smoothstep } from './palette'
import { getHeight } from './terrain'
import { useNature } from './loadNature'
import { useWorld } from '../state/useWorld'
import { n } from './config'
import { SEABED_HALF, mulberry32, seabedHeight } from './seabedField'
import { archipelagoExtent, useArchipelago } from './archipelago/archipelago'
import { UnderwaterFish } from './FishLife'

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
// `half` is the floor's half-extent: the home island uses SEABED_HALF, but the
// archipelago spreads its islands far past that, so it gets a much larger floor
// (sized to the whole archipelago) — otherwise the sea has no bottom out there.
function SeabedFloor({ half, seg }: { half: number; seg: number }) {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(half * 2, half * 2, seg, seg)
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
  }, [half, seg])
  const mat = useMemo(
    () => patched(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide })),
    [],
  )
  return <mesh geometry={geo} material={mat} receiveShadow />
}

// ---- stylized corals (instanced branches, deterministic) -------------------
function Corals({ rMin = 74, rMax = 209, count = 22 }: { rMin?: number; rMax?: number; count?: number }) {
  const im = useMemo(() => {
    const branch = new THREE.CylinderGeometry(0.05, 0.16, 1.1, 6)
    branch.translate(0, 0.55, 0)
    const palette = [0xff8fb3, 0xffae5c, 0xb98cff, 0xff6f91, 0x6fd1c4]
    const rng = mulberry32(7)
    const centers: { x: number; y: number; z: number; col: number }[] = []
    const target = n(count)
    let guard = 0
    while (centers.length < target && guard < target * 40) {
      guard++
      const ang = rng() * TAU
      const rad = rMin + Math.sqrt(rng()) * (rMax - rMin)
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
  }, [rMin, rMax, count])
  return <primitive object={im} />
}

// ---- seagrass (reuses the project's grass models) --------------------------
type Item = { x: number; y: number; z: number; rotY: number; scale: number; m: number }

function Seagrass({ rMin = 70, rMax = 220, count = 620 }: { rMin?: number; rMax?: number; count?: number }) {
  const nature = useNature()
  // lush mix: tall blades + wispy blades + a broad-leaf plant, like the reference
  const models = useMemo(
    () => ['Grass_Common_Tall', 'Grass_Wispy_Tall', 'Plant_1'].map((k) => nature[k]).filter(Boolean),
    [nature],
  )

  const items = useMemo<Item[]>(() => {
    const rng = mulberry32(99)
    const out: Item[] = []
    const target = n(count)
    let guard = 0
    while (out.length < target && guard < target * 40) {
      guard++
      const ang = rng() * TAU
      const rad = rMin + Math.sqrt(rng()) * (rMax - rMin) // near shore out to open water
      const x = Math.cos(ang) * rad
      const z = Math.sin(ang) * rad
      if (getHeight(x, z) > -0.5) continue // skip land / dry shore
      const y = seabedHeight(x, z)
      if (y > -2.2) continue
      out.push({ x, y, z, rotY: rng() * TAU, scale: 0.85 + rng() * 1.7, m: Math.floor(rng() * 3) })
    }
    return out
  }, [rMin, rMax, count])

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

export function Seabed() {
  const mapId = useWorld((s) => s.mapId)
  // Re-read when the archipelago loads so the floor grows to cover its islands.
  const islands = useArchipelago((s) => s.islands)
  const isArch = mapId === 'archipelago'
  // Stretch the floor over the whole archipelago (its islands fan out far past
  // the home seabed). Segments scale with size but are capped for performance.
  const half = isArch ? Math.max(SEABED_HALF, archipelagoExtent() + 140) : SEABED_HALF
  const seg = isArch ? Math.min(300, Math.max(180, Math.round(half / 2.6))) : 220
  void islands // dependency only — drives the half recompute on load

  // Spread the reef life across whichever floor we're on: a tight ring around the
  // home island, or the whole archipelago (counts scale with the bigger area).
  const flora = isArch
    ? { cMin: 50, cMax: half - 30, corals: 90, grass: 2400, schools: 18, perSchool: 6, mantas: 10 }
    : { cMin: 0, cMax: 0, corals: 22, grass: 620 } // 0 → component defaults (home)

  return (
    <>
      <SeabedFloor half={half} seg={seg} />
      {isArch ? (
        <>
          <Corals rMin={flora.cMin} rMax={flora.cMax} count={flora.corals} />
          <Suspense fallback={null}>
            <UnderwaterFish
              rMin={flora.cMin}
              rMax={flora.cMax}
              schools={flora.schools}
              perSchool={flora.perSchool}
              mantas={flora.mantas}
            />
            <Seagrass rMin={flora.cMin} rMax={flora.cMax} count={flora.grass} />
          </Suspense>
        </>
      ) : (
        <>
          <Corals />
          <Suspense fallback={null}>
            <UnderwaterFish />
            <Seagrass />
          </Suspense>
        </>
      )}
    </>
  )
}
