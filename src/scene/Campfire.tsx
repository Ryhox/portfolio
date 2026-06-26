import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getSky } from './palette'
import { getHeight } from './terrain'
import { patchReveal } from './patchReveal'
import { useWorld } from '../state/useWorld'
import { REVEAL_DIST, REVEAL_CENTER } from './revealUniforms'
import { InteractMarker } from './InteractMarker'
import { registerInteract, unregisterInteract } from './interact'
import { BENCH, SIT } from './benchSit'

// ---------------------------------------------------------------------------
// The campfire on the wild west shore: a ring of stones, a teepee of logs, and a
// GPU-driven fire + smoke + ember FX that burns day AND night. It rides the island's
// reveal like everything else — the SOLID parts clip via patchReveal, the FX fade via
// a reveal factor — so it's hidden on the idle "click to begin" screen (no stray smoke
// plume) yet always rendered, so nothing pops in to compile and hitch mid-fly-in.
// ---------------------------------------------------------------------------

// --- GPU particle field -----------------------------------------------------
// One draw call: every point's life cycles on the GPU from a per-particle seed,
// rising, drifting, recoloring and fading. uTime is the only per-frame update.
const VERT = /* glsl */ `
  uniform float uTime, uRise, uExpand, uShrink, uSizeScale, uWobbleFreq, uWobbleAmp;
  attribute float aSeed, aAngle, aRadius, aSize, aSpeed;
  varying float vLife;
  void main() {
    float life = fract(uTime * aSpeed + aSeed);
    vLife = life;
    float rad = aRadius + uExpand * life;
    float wob = sin(uTime * uWobbleFreq + aSeed * 40.0) * uWobbleAmp * life;
    vec3 p = position;
    p.x += cos(aAngle) * rad + wob;
    p.z += sin(aAngle) * rad + wob * 0.4;
    p.y += life * uRise;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = max(1.0, aSize * (1.0 + uShrink * life) * uSizeScale / max(-mv.z, 0.1));
  }
`
const FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColorA, uColorB;
  uniform float uAlpha, uFade;
  varying float vLife;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float soft = smoothstep(0.5, 0.05, d);
    vec3 col = mix(uColorA, uColorB, vLife);
    float fade = (uFade < 0.5) ? (1.0 - vLife) : sin(vLife * 3.14159265);
    gl_FragColor = vec4(col, soft * uAlpha * fade);
  }
`

type FieldCfg = {
  count: number
  baseY: number
  spread: number
  rise: number
  expand: number
  size: number
  shrink: number
  speed: [number, number]
  colorA: THREE.Color
  colorB: THREE.Color
  alpha: number
  fade: 0 | 1 // 0 = fade out over life, 1 = swell in then out (smoke)
  wobbleFreq: number
  wobbleAmp: number
  additive: boolean
}

function ParticleField({ cfg, revealRef }: { cfg: FieldCfg; revealRef: { current: number } }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(cfg.count * 3)
    const seed = new Float32Array(cfg.count)
    const angle = new Float32Array(cfg.count)
    const radius = new Float32Array(cfg.count)
    const size = new Float32Array(cfg.count)
    const speed = new Float32Array(cfg.count)
    for (let i = 0; i < cfg.count; i++) {
      pos[i * 3 + 1] = cfg.baseY
      seed[i] = Math.random()
      angle[i] = Math.random() * Math.PI * 2
      radius[i] = Math.random() * cfg.spread
      size[i] = cfg.size * (0.6 + Math.random() * 0.8)
      speed[i] = cfg.speed[0] + Math.random() * (cfg.speed[1] - cfg.speed[0])
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    g.setAttribute('aAngle', new THREE.BufferAttribute(angle, 1))
    g.setAttribute('aRadius', new THREE.BufferAttribute(radius, 1))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1))
    return g
  }, [cfg])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uRise: { value: cfg.rise },
          uExpand: { value: cfg.expand },
          uShrink: { value: cfg.shrink },
          uSizeScale: { value: 360 },
          uWobbleFreq: { value: cfg.wobbleFreq },
          uWobbleAmp: { value: cfg.wobbleAmp },
          uColorA: { value: cfg.colorA },
          uColorB: { value: cfg.colorB },
          uAlpha: { value: cfg.alpha },
          uFade: { value: cfg.fade },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: cfg.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    [cfg],
  )

  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime
    material.uniforms.uSizeScale.value = state.size.height * 0.5
    // Fade with the reveal instead of being hidden — the field keeps rendering (its
    // shader stays warm, nothing pops in to compile mid-fly-in), it's just invisible
    // (uAlpha 0) on the idle screen and until the ring sweeps out to the campfire.
    material.uniforms.uAlpha.value = cfg.alpha * revealRef.current
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}

const FIRE_CFG: FieldCfg = {
  count: 150,
  baseY: 0.12,
  spread: 0.42,
  rise: 1.15,
  expand: -0.34, // taper inward as flames rise
  size: 0.5,
  shrink: -0.7, // shrink toward the tip
  speed: [0.8, 1.7],
  colorA: new THREE.Color(1.0, 0.92, 0.6),
  colorB: new THREE.Color(0.85, 0.18, 0.03),
  alpha: 0.85,
  fade: 0,
  wobbleFreq: 6,
  wobbleAmp: 0.06,
  additive: true,
}
const SMOKE_CFG: FieldCfg = {
  count: 90,
  baseY: 0.95,
  spread: 0.28,
  rise: 40,
  expand: 2.4,
  size: 1.1,
  shrink: 2.0,
  speed: [0.05, 0.10],
  colorA: new THREE.Color(0.34, 0.32, 0.31),
  colorB: new THREE.Color(0.12, 0.12, 0.13),
  alpha: 0.18,
  fade: 1,
  wobbleFreq: 0.8,
  wobbleAmp: 1.4,
  additive: false,
}
const EMBER_CFG: FieldCfg = {
  count: 30,
  baseY: 0.3,
  spread: 0.3,
  rise: 2.6,
  expand: 0.35,
  size: 0.12,
  shrink: -0.4,
  speed: [0.45, 0.95],
  colorA: new THREE.Color(1.0, 0.85, 0.4),
  colorB: new THREE.Color(1.0, 0.35, 0.08),
  alpha: 1.0,
  fade: 0,
  wobbleFreq: 3,
  wobbleAmp: 0.28,
  additive: true,
}

// --- solid props ------------------------------------------------------------
const UP = new THREE.Vector3(0, 1, 0)
// A log/pole spanning two points: returns mid position, orientation and length.
function bar(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const a = new THREE.Vector3(ax, ay, az)
  const dir = new THREE.Vector3(bx - ax, by - ay, bz - az)
  const len = dir.length()
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize())
  return {
    pos: [(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2] as [number, number, number],
    quat: [q.x, q.y, q.z, q.w] as [number, number, number, number],
    len,
  }
}

// Wild campfire on the secluded west shore — no path leads here.
const CAMP_X = -46
const CAMP_Z = 30

export function Campfire() {
  const base: [number, number, number] = [CAMP_X, getHeight(CAMP_X, CAMP_Z), CAMP_Z]

  // materials — the SOLID parts (stones, logs, scorched ground) ride the island's
  // reveal clip via patchReveal, exactly like the rest of the isle: hidden on the idle
  // screen, warmed during the warm-up pass (they still render, just clipped), and swept
  // in smoothly with the ground — never toggled on/off (which would pop + compile).
  const rockMat = useMemo(() => { const m = new THREE.MeshStandardMaterial({ color: 0x787a82, roughness: 0.95, flatShading: true }); patchReveal(m); return m }, [])
  const woodMat = useMemo(() => { const m = new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.92 }); patchReveal(m); return m }, [])
  const charMat = useMemo(() => { const m = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.95 }); patchReveal(m); return m }, [])
  const scorchMat = useMemo(() => { const m = new THREE.MeshStandardMaterial({ color: 0x1a1512, roughness: 1 }); patchReveal(m); return m }, [])
  const flameOuterMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: 0xff5a16, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  )
  const flameInnerMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  )
  const coreMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: 0xff8a2e, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  )

  // geometry layouts
  const stones = useMemo(() => {
    const out: { pos: [number, number, number]; rot: [number, number, number]; s: number }[] = []
    const n = 12
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.2
      const r = 1.15 + Math.sin(i * 2.3) * 0.06
      const s = 0.26 + ((i * 7) % 5) * 0.03
      out.push({
        pos: [Math.cos(a) * r, 0.04, Math.sin(a) * r],
        rot: [Math.sin(i) * 0.4, i * 1.7, Math.cos(i) * 0.4],
        s,
      })
    }
    return out
  }, [])

  const teepee = useMemo(() => {
    const logs: ReturnType<typeof bar>[] = []
    const n = 6
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      logs.push(bar(Math.cos(a) * 0.5, 0.0, Math.sin(a) * 0.5, Math.cos(a) * 0.08, 0.75, Math.sin(a) * 0.08))
    }
    // a couple of logs lying across the base
    logs.push(bar(-0.55, 0.12, -0.15, 0.55, 0.12, 0.2))
    logs.push(bar(-0.2, 0.12, 0.55, 0.15, 0.12, -0.55))
    return logs
  }, [])

  // animation
  const light = useRef<THREE.PointLight>(null!)
  const flameOuter = useRef<THREE.Mesh>(null!)
  const flameInner = useRef<THREE.Mesh>(null!)
  const core = useRef<THREE.Mesh>(null!)
  // The FX (custom shaders / additive flames) can't ride patchReveal's clip, so they
  // FADE with this factor instead — always rendered (warm), just invisible on idle and
  // until the ring reaches the campfire. Matches the solids' clip so they reveal as one.
  const revealRef = useRef(0)

  const campDist = useMemo(() => {
    const rc = REVEAL_CENTER.value
    return Math.hypot(CAMP_X - rc.x, CAMP_Z - rc.y)
  }, [])

  useFrame((state) => {
    const reveal = THREE.MathUtils.smoothstep(REVEAL_DIST.value, campDist - 4, campDist + 6)
    revealRef.current = reveal // drained by the ParticleFields for their uAlpha

    const t = state.clock.elapsedTime
    const nf = getSky(useWorld.getState().t).nightFactor
    // layered flicker
    const flick = 0.82 + Math.sin(t * 11) * 0.1 + Math.sin(t * 23.3 + 1.3) * 0.05 + Math.sin(t * 4.7) * 0.04

    light.current.intensity = (2.3 + nf * 2.4) * flick * reveal // no firelight on the idle sea

    // flame bodies sway + breathe (opacity also scaled by reveal so they fade in cleanly)
    flameOuter.current.scale.set(1 + Math.sin(t * 7) * 0.07, flick * 1.05, 1 + Math.cos(t * 6.3) * 0.07)
    flameOuter.current.rotation.z = Math.sin(t * 3.1) * 0.07
    flameOuter.current.material && ((flameOuter.current.material as THREE.MeshBasicMaterial).opacity = 0.45 * flick * reveal)
    flameInner.current.scale.set(1 + Math.sin(t * 9 + 1) * 0.08, (0.7 + flick * 0.35), 1 + Math.cos(t * 8 + 1) * 0.08)
    flameInner.current.rotation.z = Math.sin(t * 3.7 + 2) * 0.08
    ;(flameInner.current.material as THREE.MeshBasicMaterial).opacity = 0.85 * flick * reveal
    core.current.scale.setScalar(0.9 + flick * 0.25)
    ;(core.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * flick * reveal
  })

  return (
    <group position={base}>
      {/* scorched ground under the fire */}
      <mesh material={scorchMat} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[1.05, 24]} />
      </mesh>

      {/* stone ring */}
      {stones.map((s, i) => (
        <mesh key={i} material={rockMat} position={s.pos} rotation={s.rot} scale={s.s} castShadow receiveShadow>
          <dodecahedronGeometry args={[1, 0]} />
        </mesh>
      ))}

      {/* logs (teepee + crossed base) */}
      {teepee.map((l, i) => (
        <mesh key={i} material={i < 6 ? woodMat : charMat} position={l.pos} quaternion={l.quat} castShadow>
          <cylinderGeometry args={[0.06, 0.08, l.len, 8]} />
        </mesh>
      ))}

      {/* glowing ember core */}
      <mesh ref={core} material={coreMat} position={[0, 0.22, 0]}>
        <icosahedronGeometry args={[0.28, 0]} />
      </mesh>

      {/* layered flame body (additive) */}
      <mesh ref={flameOuter} material={flameOuterMat} position={[0, 0.62, 0]}>
        <coneGeometry args={[0.36, 1.05, 10]} />
      </mesh>
      <mesh ref={flameInner} material={flameInnerMat} position={[0, 0.48, 0]}>
        <coneGeometry args={[0.2, 0.74, 9]} />
      </mesh>

      {/* GPU fire + smoke + embers */}
      <ParticleField cfg={FIRE_CFG} revealRef={revealRef} />
      <ParticleField cfg={SMOKE_CFG} revealRef={revealRef} />
      <ParticleField cfg={EMBER_CFG} revealRef={revealRef} />

      {/* warm firelight — burns day and night, with a lively flicker */}
      <pointLight ref={light} position={[0, 0.7, 0]} color={0xff7a2e} distance={13} decay={2} />
    </group>
  )
}

// A single reading bench sitting ON the north path (the straight climb to the
// Heartwood), centred between the east/social branch (z≈8) and the tree (z≈-2) — a
// comfortable distance off the east path. It faces due WEST, looking across the
// isle. Rests on the flattened path ground so it never floats. Height per-bench.
// NOTE: this GLB's front is its local +X, so rotY = π aims the seat toward -X (west).
const BENCH_DEFS = [{ x: 2.3, z: 3.4 }].map((b) => ({
  ...b,
  rotY: Math.PI, // face due west
}))

const BENCH_HEIGHT = 1.3 // world height the model is auto-scaled to
const BENCH_YAW = 0 // extra yaw so the seat faces the tree (tune to the model)

// One stylized_bench.glb, auto-scaled, base seated at y=0, materials kept (so its
// texture survives) but reveal-patched so it doesn't pop through the intro ring.
function BenchModel() {
  const { scene } = useGLTF('/models/stylized_bench.glb')
  const model = useMemo(() => {
    const root = scene.clone(true)
    root.updateMatrixWorld(true)
    const dim = new THREE.Vector3()
    new THREE.Box3().setFromObject(root).getSize(dim)
    root.scale.setScalar(BENCH_HEIGHT / (dim.y || 1))
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const c = new THREE.Vector3()
    box.getCenter(c)
    root.position.set(-c.x, -box.min.y, -c.z)
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!(mesh as { isMesh?: boolean }).isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const patch = (m: THREE.Material) => {
        const cl = m.clone()
        patchReveal(cl)
        return cl
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(patch) : patch(mesh.material)
    })
    return root
  }, [scene])
  return <primitive object={model} />
}

// Eases the camera onto the bench when `sitting` is set (a gentle cinematic glide
// to a seated, west-facing pose) and freezes the player meanwhile; standing up (E,
// any movement key, or ESC) hands the view back exactly where it started. The bench
// publishes the seated pose + an E-to-sit interact here.
const _sitM = new THREE.Matrix4()
const _sitUp = new THREE.Vector3(0, 1, 0)
function BenchSit({ x, z }: { x: number; z: number }) {
  const camera = useThree((s) => s.camera)
  const gy = useMemo(() => getHeight(x, z), [x, z])
  const p = useRef(0)
  const startPos = useRef(new THREE.Vector3())
  const startQuat = useRef(new THREE.Quaternion())
  const targetQuat = useRef(new THREE.Quaternion())
  const captured = useRef(false)

  useEffect(() => {
    BENCH.camPos.set(x + 0.12, gy + 1.12, z) // sit back on the seat, eye height
    BENCH.lookAt.set(x - 6, gy + 0.82, z) // gaze west, a touch down, across the isle
    BENCH.ready = true
    // E toggles sit/stand. The bench stays "armed" while you're seated (the camera
    // sits right on it), so the shared interact handler fires this on E both ways —
    // which is exactly what we want; no separate E handling here (that double-fired).
    registerInteract({
      id: 'bench',
      x,
      y: gy + 0.6,
      z,
      range: 3.0,
      activate: () => useWorld.getState().toggleSitting(),
    })
    return () => unregisterInteract('bench')
  }, [x, z, gy])

  // Also stand up on any MOVEMENT key (so you can just walk off) — but NOT E, which
  // the interact handler above already toggles.
  useEffect(() => {
    const STAND = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
    const onKey = (e: KeyboardEvent) => {
      if (useWorld.getState().sitting && STAND.includes(e.code)) useWorld.getState().setSitting(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useFrame((_, dtRaw) => {
    const sitting = useWorld.getState().sitting
    const dt = Math.min(dtRaw, 0.05)
    if (sitting && !captured.current) {
      startPos.current.copy(camera.position)
      startQuat.current.copy(camera.quaternion)
      captured.current = true
    }
    const target = sitting && BENCH.ready ? 1 : 0
    // Smooth glide DOWN onto the seat; snappier when getting back up.
    const rate = target > p.current ? 7 : 13
    p.current += (target - p.current) * (1 - Math.exp(-rate * dt))
    if (target === 1 && p.current > 0.999) p.current = 1
    if (target === 0 && p.current < 0.001) p.current = 0
    SIT.p = p.current

    if (p.current > 0.001) {
      SIT.active = true
      _sitM.lookAt(BENCH.camPos, BENCH.lookAt, _sitUp)
      targetQuat.current.setFromRotationMatrix(_sitM)
      const e = p.current * p.current * (3 - 2 * p.current) // smoothstep ease
      camera.position.lerpVectors(startPos.current, BENCH.camPos, e)
      camera.quaternion.slerpQuaternions(startQuat.current, targetQuat.current, e)
    } else if (SIT.active) {
      camera.position.copy(startPos.current)
      camera.quaternion.copy(startQuat.current)
      SIT.active = false
      captured.current = false
    }
  })

  return null
}

export function HilltopBenches() {
  const b0 = BENCH_DEFS[0]
  return (
    <>
      {BENCH_DEFS.map((b, i) => (
        <group key={i} position={[b.x, getHeight(b.x, b.z), b.z]} rotation={[0, b.rotY + BENCH_YAW, 0]}>
          <BenchModel />
        </group>
      ))}
      <BenchSit x={b0.x} z={b0.z} />
      <InteractMarker
        id="bench"
        x={b0.x}
        y={getHeight(b0.x, b0.z) + BENCH_HEIGHT + 0.25}
        z={b0.z}
        label="Sit"
        hint="press E to rest"
      />
    </>
  )
}

useGLTF.preload('/models/stylized_bench.glb')
