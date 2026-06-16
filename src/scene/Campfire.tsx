import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { NOOK } from './layout'
import { getSky } from './palette'
import { getHeight } from './terrain'
import { useWorld } from '../state/useWorld'

// ---------------------------------------------------------------------------
// The campfire at the end of the trail: a ring of stones, a teepee of logs, a
// witch's cauldron on a tripod, log benches, and a GPU-driven fire + smoke +
// ember FX that burns day AND night.
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

function ParticleField({ cfg }: { cfg: FieldCfg }) {
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
  count: 48,
  baseY: 0.95,
  spread: 0.22,
  rise: 2.6,
  expand: 0.7, // billow outward
  size: 0.7,
  shrink: 1.7, // grow as it rises
  speed: [0.18, 0.34],
  colorA: new THREE.Color(0.34, 0.32, 0.31),
  colorB: new THREE.Color(0.1, 0.1, 0.11),
  alpha: 0.24,
  fade: 1,
  wobbleFreq: 1.4,
  wobbleAmp: 0.3,
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

export function Campfire() {
  const base: [number, number, number] = [NOOK.x, getHeight(NOOK.x, NOOK.z), NOOK.z]

  // materials
  const rockMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x787a82, roughness: 0.95, flatShading: true }), [])
  const woodMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.92 }), [])
  const charMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.95 }), [])
  const ironMat = useMemo(() => new THREE.MeshStandardMaterial({ color: 0x201e24, roughness: 0.5, metalness: 0.6 }), [])
  const brewMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0x6bd66b, emissive: 0x49ff8a, emissiveIntensity: 1.4, roughness: 0.4, toneMapped: false }),
    [],
  )
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

  const tripod = useMemo(() => {
    const legs: ReturnType<typeof bar>[] = []
    const n = 3
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.5
      legs.push(bar(Math.cos(a) * 0.62, 0.0, Math.sin(a) * 0.62, 0, 1.5, 0))
    }
    return legs
  }, [])

  const benches = useMemo(() => {
    // three rustic benches around the fire, leaving the trail entrance open
    return [0.5, Math.PI * 0.92, Math.PI * 1.46].map((a) => ({
      pos: [Math.cos(a) * 2.5, 0, Math.sin(a) * 2.5] as [number, number, number],
      rotY: -a + Math.PI / 2,
    }))
  }, [])

  // animation
  const light = useRef<THREE.PointLight>(null!)
  const flameOuter = useRef<THREE.Mesh>(null!)
  const flameInner = useRef<THREE.Mesh>(null!)
  const core = useRef<THREE.Mesh>(null!)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const nf = getSky(useWorld.getState().t).nightFactor
    // layered flicker
    const flick = 0.82 + Math.sin(t * 11) * 0.1 + Math.sin(t * 23.3 + 1.3) * 0.05 + Math.sin(t * 4.7) * 0.04

    light.current.intensity = (2.3 + nf * 2.4) * flick

    // flame bodies sway + breathe
    flameOuter.current.scale.set(1 + Math.sin(t * 7) * 0.07, flick * 1.05, 1 + Math.cos(t * 6.3) * 0.07)
    flameOuter.current.rotation.z = Math.sin(t * 3.1) * 0.07
    flameOuter.current.material && ((flameOuter.current.material as THREE.MeshBasicMaterial).opacity = 0.45 * flick)
    flameInner.current.scale.set(1 + Math.sin(t * 9 + 1) * 0.08, (0.7 + flick * 0.35), 1 + Math.cos(t * 8 + 1) * 0.08)
    flameInner.current.rotation.z = Math.sin(t * 3.7 + 2) * 0.08
    core.current.scale.setScalar(0.9 + flick * 0.25)
    ;(core.current.material as THREE.MeshBasicMaterial).opacity = 0.7 * flick

    brewMat.emissiveIntensity = 1.0 + nf * 0.8 + Math.sin(t * 2) * 0.2
  })

  return (
    <group position={base}>
      {/* scorched ground under the fire */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[1.05, 24]} />
        <meshStandardMaterial color={0x1a1512} roughness={1} />
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
      <ParticleField cfg={FIRE_CFG} />
      <ParticleField cfg={SMOKE_CFG} />
      <ParticleField cfg={EMBER_CFG} />

      {/* tripod + witch cauldron over the flames */}
      {tripod.map((l, i) => (
        <mesh key={i} material={ironMat} position={l.pos} quaternion={l.quat} castShadow>
          <cylinderGeometry args={[0.022, 0.028, l.len, 6]} />
        </mesh>
      ))}
      <group position={[0, 0.92, 0]}>
        {/* hanging chain */}
        <mesh material={ironMat} position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.012, 0.012, 0.5, 5]} />
        </mesh>
        {/* cauldron body */}
        <mesh material={ironMat} scale={[1, 0.86, 1]} castShadow>
          <sphereGeometry args={[0.32, 18, 14]} />
        </mesh>
        {/* rim */}
        <mesh material={ironMat} position={[0, 0.17, 0]}>
          <torusGeometry args={[0.29, 0.045, 8, 20]} />
        </mesh>
        {/* glowing brew */}
        <mesh material={brewMat} position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.27, 18]} />
        </mesh>
      </group>

      {/* benches */}
      {benches.map((b, i) => (
        <group key={i} position={b.pos} rotation={[0, b.rotY, 0]}>
          <mesh material={woodMat} position={[0, 0.42, 0]} castShadow receiveShadow>
            <boxGeometry args={[1.3, 0.13, 0.4]} />
          </mesh>
          <mesh material={charMat} position={[-0.5, 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.11, 0.13, 0.4, 7]} />
          </mesh>
          <mesh material={charMat} position={[0.5, 0.2, 0]} castShadow>
            <cylinderGeometry args={[0.11, 0.13, 0.4, 7]} />
          </mesh>
        </group>
      ))}

      {/* warm firelight — burns day and night, with a lively flicker */}
      <pointLight ref={light} position={[0, 0.7, 0]} color={0xff7a2e} distance={13} decay={2} />
    </group>
  )
}
