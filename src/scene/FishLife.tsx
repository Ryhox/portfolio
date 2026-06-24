import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ISLAND_RADIUS, WATER_LEVEL } from './layout'
import { useWorld } from '../state/useWorld'
import { waveHeight } from './oceanWave'
import { addRipple } from './rippleField'
import { getHeight } from './terrain'
import { n } from './config'
import { mulberry32, seabedHeight } from './seabedField'

// The real fish: three animated Sketchfab GLBs that swim the seabed and arc out
// of the sea, replacing the old procedural sphere fish.
//   • gold fish  — dense schools circling the reef ("the swarm")
//   • manta ray  — a few solitary giants gliding the deep
//   • trout      — the jumping fish that leaps clear of the surface
// All three are skinned + animated, so each fish is its own SkeletonUtils clone
// driven by its own AnimationMixer. Materials are flagged out of the island
// reveal (like every other ocean element) and ride the world, not the click.

const TAU = Math.PI * 2
// Animation LOD: a fish further than this from the camera is well beyond the
// underwater fog far-distance (~38-60u), so it's fogged to solid murk and you
// can't see its body wriggle. We keep moving it (position is a pure function of
// time, so there's never a pop when you approach) but skip the costly skeletal
// AnimationMixer update until it's close enough to actually be seen.
const FISH_ANIM_DIST2 = 80 * 80
const GOLD = '/models/gold_fish_model.glb'
const MANTA = '/models/cartoon_manta_ray_animated.glb'
const TROUT = '/models/trout_fish_animated.glb'

// ---- shared model prep -----------------------------------------------------
type Prep = {
  scene: THREE.Object3D
  clip: THREE.AnimationClip | undefined
  baseScale: number
  baseYaw: number
  center: THREE.Vector3
}

// Measure a fish GLB once and work out how to normalize it: scale so its body is
// `len` world-units, and the yaw that turns its head to local +Z (our "forward").
// `eyes` finds the head from the eye meshes; otherwise we take the body axis
// (`forward: 'long'` = nose-to-tail is the longest axis, e.g. a trout; 'short' =
// the manta, whose wingspan is the longest axis so forward is the shorter one).
// `flip` swaps head/tail when the guess points the wrong way.
function usePrep(
  url: string,
  opts: { len: number; eyes?: boolean; forward?: 'long' | 'short'; flip?: boolean },
): Prep {
  const { len, eyes = false, forward = 'long', flip = false } = opts
  const gltf = useGLTF(url)
  return useMemo(() => {
    gltf.scene.updateMatrixWorld(true)
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      for (const m of mats) if (m) (m as any).__revealPatched = true // ride the world, never the reveal clip
      mesh.castShadow = false
      mesh.receiveShadow = false
      mesh.frustumCulled = false
    })

    const box = new THREE.Box3().setFromObject(gltf.scene)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const baseScale = len / Math.max(size.x, size.z, 1e-3)

    let baseYaw: number
    if (eyes) {
      const acc = new THREE.Vector3()
      let cnt = 0
      gltf.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh && /eye/i.test(o.name)) {
          acc.add(new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3()))
          cnt++
        }
      })
      if (cnt) {
        const hd = acc.multiplyScalar(1 / cnt).sub(center)
        baseYaw = -Math.atan2(hd.x, hd.z) // rotate head direction onto +Z
      } else {
        baseYaw = size.x > size.z ? -Math.PI / 2 : 0
      }
    } else {
      const longAlongX = size.x > size.z
      const fwdAlongX = forward === 'long' ? longAlongX : !longAlongX
      baseYaw = fwdAlongX ? -Math.PI / 2 : 0
    }
    if (flip) baseYaw += Math.PI

    return { scene: gltf.scene, clip: gltf.animations[0], baseScale, baseYaw, center }
  }, [gltf, len, eyes, forward, flip])
}

type Inst = { inner: THREE.Group; mixer: THREE.AnimationMixer }

// One independent, animated clone, pre-wrapped so its body centre sits at the
// group origin and its head faces +Z — the caller just sets position + yaw.
function makeInst(prep: Prep, rng: () => number, speed = 1): Inst {
  const obj = skeletonClone(prep.scene)
  const mixer = new THREE.AnimationMixer(obj)
  if (prep.clip) {
    const act = mixer.clipAction(prep.clip)
    act.play()
    act.time = rng() * prep.clip.duration // desync the loop
    act.timeScale = (0.85 + rng() * 0.5) * speed
  }
  const centerG = new THREE.Group()
  centerG.position.copy(prep.center).multiplyScalar(-1)
  centerG.add(obj)
  const inner = new THREE.Group()
  inner.scale.setScalar(prep.baseScale)
  inner.rotation.y = prep.baseYaw
  inner.add(centerG)
  return { inner, mixer }
}

// ---- gold-fish swarm -------------------------------------------------------
// Dense schools circling near the seabed, deterministically placed like the old
// reef fish but rendered with the real animated model.
function GoldSchools({
  rMin,
  rMax,
  schools,
  perSchool,
}: {
  rMin: number
  rMax: number
  schools: number
  perSchool: number
}) {
  const prep = usePrep(GOLD, { len: 0.5, eyes: true })

  const { instances, fish } = useMemo(() => {
    const rng = mulberry32(303)
    const sch: { cx: number; cz: number; cy: number; r: number; spd: number }[] = []
    const target = n(schools)
    let guard = 0
    while (sch.length < target && guard < target * 40) {
      guard++
      const ang = rng() * TAU
      // uniform-in-radius (not area) → more schools packed near the reef, right
      // where you first dive off the beach, instead of all flung to the far ring
      const rad = rMin + rng() * (rMax - rMin)
      const cx = Math.cos(ang) * rad
      const cz = Math.sin(ang) * rad
      if (getHeight(cx, cz) > -2) continue
      sch.push({
        cx,
        cz,
        cy: seabedHeight(cx, cz) + 2.4 + rng() * 3.5,
        r: 2.0 + rng() * 2.4, // tighter so the fish bunch into a swarm
        spd: (0.3 + rng() * 0.45) * (rng() < 0.5 ? 1 : -1),
      })
    }
    const fish: { s: (typeof sch)[number]; phase: number; rr: number; yoff: number; bob: number }[] = []
    for (const s of sch)
      for (let i = 0; i < perSchool; i++)
        fish.push({ s, phase: rng() * TAU, rr: s.r * (0.45 + rng() * 0.7), yoff: (rng() - 0.5) * 1.4, bob: rng() * TAU })
    const instances = fish.map(() => makeInst(prep, rng))
    if (import.meta.env.DEV && fish[0]) {
      const s = fish[0].s
      ;(window as any).__fishSpots = { ...(window as any).__fishSpots, gold: [s.cx, s.cy, s.cz] }
    }
    return { instances, fish }
  }, [prep, rMin, rMax, schools, perSchool])

  const refs = useRef<THREE.Group[]>([])
  useFrame((state, dtRaw) => {
    if (!useWorld.getState().worldVisible) return
    const t = state.clock.elapsedTime
    const dt = Math.min(dtRaw, 0.05)
    const cx = state.camera.position.x
    const cz = state.camera.position.z
    fish.forEach((f, i) => {
      const g = refs.current[i]
      if (!g) return
      const a = f.phase + t * f.s.spd
      const x = f.s.cx + Math.cos(a) * f.rr
      const z = f.s.cz + Math.sin(a) * f.rr
      const y = f.s.cy + f.yoff + Math.sin(t * 1.4 + f.phase) * 0.3
      g.position.set(x, y, z)
      // only animate the skeleton when close enough to be seen (see FISH_ANIM_DIST2)
      const ddx = x - cx, ddz = z - cz
      if (ddx * ddx + ddz * ddz < FISH_ANIM_DIST2) instances[i].mixer.update(dt)
      // face the way it's actually moving (tangent to the circle, sign-aware)
      g.rotation.y = Math.atan2(-Math.sin(a) * f.s.spd, Math.cos(a) * f.s.spd)
      g.rotation.z = Math.sin(t * 1.4 + f.bob) * 0.12 // gentle bank
    })
  })

  return (
    <>
      {instances.map((inst, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el!)}>
          <primitive object={inst.inner} />
        </group>
      ))}
    </>
  )
}

// ---- solitary manta rays ---------------------------------------------------
// A few giants, each gliding its own slow, wide circle in the deep — never
// schooled, so they read as lone wanderers.
function Mantas({ rMin, rMax, count }: { rMin: number; rMax: number; count: number }) {
  const prep = usePrep(MANTA, { len: 4.6, forward: 'long', flip: true })

  const { instances, rays } = useMemo(() => {
    const rng = mulberry32(717)
    const rays: { cx: number; cz: number; cy: number; r: number; spd: number; phase: number; bob: number }[] = []
    const target = n(count)
    let guard = 0
    while (rays.length < target && guard < target * 60) {
      guard++
      const ang = rng() * TAU
      const rad = rMin + Math.sqrt(rng()) * (rMax - rMin)
      const cx = Math.cos(ang) * rad
      const cz = Math.sin(ang) * rad
      if (getHeight(cx, cz) > -4) continue
      const floor = seabedHeight(cx, cz)
      rays.push({
        cx,
        cz,
        cy: Math.min(-3.5, floor + 4.5 + rng() * 4),
        r: 14 + rng() * 22,
        spd: (0.06 + rng() * 0.05) * (rng() < 0.5 ? 1 : -1),
        phase: rng() * TAU,
        bob: rng() * TAU,
      })
    }
    const instances = rays.map(() => makeInst(prep, rng, 0.6))
    if (import.meta.env.DEV && rays[0]) {
      const r = rays[0]
      ;(window as any).__fishSpots = { ...(window as any).__fishSpots, manta: [r.cx + r.r, r.cy, r.cz] }
    }
    return { instances, rays }
  }, [prep, rMin, rMax, count])

  const refs = useRef<THREE.Group[]>([])
  useFrame((state, dtRaw) => {
    if (!useWorld.getState().worldVisible) return
    const t = state.clock.elapsedTime
    const dt = Math.min(dtRaw, 0.05)
    const cx = state.camera.position.x
    const cz = state.camera.position.z
    rays.forEach((r, i) => {
      const g = refs.current[i]
      if (!g) return
      const a = r.phase + t * r.spd
      const x = r.cx + Math.cos(a) * r.r
      const z = r.cz + Math.sin(a) * r.r
      const y = r.cy + Math.sin(t * 0.35 + r.bob) * 1.1 // slow rise and fall
      g.position.set(x, y, z)
      // skeleton only when close enough to be seen (see FISH_ANIM_DIST2)
      const ddx = x - cx, ddz = z - cz
      if (ddx * ddx + ddz * ddz < FISH_ANIM_DIST2) instances[i].mixer.update(dt)
      g.rotation.y = Math.atan2(-Math.sin(a) * r.spd, Math.cos(a) * r.spd)
      g.rotation.z = Math.sin(t * 0.4 + r.bob) * 0.18 // lazy roll into the turn
      if (import.meta.env.DEV && i === 0) (window as any).__mantaLive = [x, y, z, g.rotation.y]
    })
  })

  return (
    <>
      {instances.map((inst, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el!)}>
          <primitive object={inst.inner} />
        </group>
      ))}
    </>
  )
}

// ---- the underwater life (mounted by Seabed) -------------------------------
export function UnderwaterFish({
  rMin = 60,
  rMax = 150,
  schools = 13,
  perSchool = 8,
  mantas = 6,
}: {
  rMin?: number
  rMax?: number
  schools?: number
  perSchool?: number
  mantas?: number
}) {
  return (
    <>
      <GoldSchools rMin={rMin} rMax={rMax} schools={schools} perSchool={perSchool} />
      <Mantas rMin={rMin} rMax={rMax} count={mantas} />
    </>
  )
}

// ---- jumping trout (mounted by OceanLife, home map only) -------------------
// A pool of trout that leap clear of the swell in an arc and splash back, with
// the model's own swim wriggle playing the whole time.
export function JumpingFish() {
  const prep = usePrep(TROUT, { len: 0.7, forward: 'long' })

  const { instances, fish } = useMemo(() => {
    const rng = mulberry32(1234)
    const fish = Array.from({ length: n(6) }, () => ({
      active: false,
      nextAt: 1 + rng() * 5,
      t0: 0,
      dur: 1,
      x: 0,
      z: 0,
      dir: 0,
      peak: 2,
      speed: 4,
    }))
    const instances = fish.map(() => makeInst(prep, rng))
    return { instances, fish }
  }, [prep])

  const refs = useRef<THREE.Group[]>([])

  // Dev: force a trout to leap at a world spot (jumps are otherwise random/rare).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as any).__jump = (x = 0, z = 90, dir = 0) => {
      const f = fish[0]
      f.x = x
      f.z = z
      f.dir = dir
      f.dur = 2.4
      f.peak = 3.2
      f.speed = 1.2
      f.t0 = NaN // launched on the next frame against the render clock
      f.active = true
    }
  }, [fish])

  useFrame((state, dtRaw) => {
    if (!useWorld.getState().worldVisible) return
    const time = state.clock.elapsedTime
    const dt = Math.min(dtRaw, 0.05)
    fish.forEach((f, i) => {
      const g = refs.current[i]
      if (!g) return
      instances[i].mixer.update(dt)
      if (!f.active) {
        g.visible = false
        if (time > f.nextAt) {
          const ang = Math.random() * TAU
          const rad = ISLAND_RADIUS + 8 + Math.random() * 110
          f.x = Math.cos(ang) * rad
          f.z = Math.sin(ang) * rad
          f.dir = Math.random() * TAU
          f.dur = 1.1 + Math.random() * 0.6
          f.peak = 1.7 + Math.random() * 1.4
          f.speed = 3 + Math.random() * 3
          f.t0 = time
          f.active = true
          addRipple(f.x, f.z, 0.45, 3.0) // takeoff splash
        }
        return
      }
      if (Number.isNaN(f.t0)) f.t0 = time
      const p = (time - f.t0) / f.dur
      if (p >= 1) {
        f.active = false
        f.nextAt = time + 4 + Math.random() * 9
        addRipple(f.x, f.z, 0.6, 3.4) // landing splash
        g.visible = false
        return
      }
      f.x += Math.cos(f.dir) * f.speed * dt
      f.z += Math.sin(f.dir) * f.speed * dt
      const surfaceY = WATER_LEVEL + waveHeight(f.x, f.z, time)
      const arc = Math.sin(p * Math.PI) * f.peak
      g.visible = true
      g.position.set(f.x, surfaceY + arc - 0.2, f.z)
      // nose up on the way out, down on the way back in
      g.rotation.set(-Math.cos(p * Math.PI) * 0.9, Math.atan2(Math.cos(f.dir), Math.sin(f.dir)), 0)
    })
  })

  return (
    <>
      {instances.map((inst, i) => (
        <group key={i} ref={(el) => (refs.current[i] = el!)} rotation-order="YXZ" visible={false}>
          <primitive object={inst.inner} />
        </group>
      ))}
    </>
  )
}

useGLTF.preload(GOLD)
useGLTF.preload(MANTA)
useGLTF.preload(TROUT)
