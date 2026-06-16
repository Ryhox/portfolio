import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { NOOK, PATH_WAYPOINTS, REGIONS } from './layout'
import { getSky } from './palette'
import { getHeight } from './terrain'
import { useWorld } from '../state/useWorld'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A little hanging lantern that warms up after dusk, with a soft flicker.
function Lantern({ pos }: { pos: [number, number, number] }) {
  const light = useRef<THREE.PointLight>(null!)
  const phase = useMemo(() => Math.random() * 6.28, [])
  const glass = useMemo(
    () => new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb24d, emissiveIntensity: 0, toneMapped: false }),
    [],
  )
  useFrame((state) => {
    const nf = getSky(useWorld.getState().t).nightFactor
    const flick = 0.85 + Math.sin(state.clock.elapsedTime * 7 + phase) * 0.15
    glass.emissiveIntensity = nf * 1.7 * flick
    light.current.intensity = nf * 3.2 * flick
  })
  return (
    <group position={pos}>
      <mesh castShadow position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.035, 0.05, 1.2, 8]} />
        <meshStandardMaterial color={0x3a2a1a} roughness={0.9} />
      </mesh>
      <mesh material={glass} position={[0, 1.26, 0]}>
        <boxGeometry args={[0.2, 0.26, 0.2]} />
      </mesh>
      <mesh position={[0, 1.46, 0]}>
        <coneGeometry args={[0.18, 0.13, 4]} />
        <meshStandardMaterial color={0x2a2018} roughness={0.85} />
      </mesh>
      <pointLight ref={light} position={[0, 1.26, 0]} color={0xffb86a} distance={9} decay={2} />
    </group>
  )
}

// A cluster of bioluminescent toadstools. They glow softly even by day (so they
// read as "magic" in daylight) and blaze at night. `light` adds an illuminating
// point light — kept off for the purely-decorative extra clusters so the light
// count (and the per-instance lighting cost on the dense grass) stays sane.
function GlowMushrooms({
  center,
  count,
  seed,
  color = 0x49f5e0,
  light = true,
}: {
  center: [number, number]
  count: number
  seed: number
  color?: number
  light?: boolean
}) {
  const lightRef = useRef<THREE.PointLight>(null!)
  const cap = useMemo(
    () => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.5, toneMapped: false }),
    [color],
  )
  const stem = useMemo(() => new THREE.MeshStandardMaterial({ color: 0xe9e3d2, roughness: 0.9 }), [])
  const defs = useMemo(() => {
    const r = rng(seed)
    return Array.from({ length: count }, () => {
      const ang = r() * Math.PI * 2
      const rad = r() * 1.6
      const x = center[0] + Math.cos(ang) * rad
      const z = center[1] + Math.sin(ang) * rad
      return { x, y: getHeight(x, z), z, s: 0.6 + r() * 0.8 }
    })
  }, [center, count, seed])

  useFrame((state) => {
    const nf = getSky(useWorld.getState().t).nightFactor
    const pulse = 0.8 + Math.sin(state.clock.elapsedTime * 1.6 + seed) * 0.2
    // a gentle base glow by day, blazing at night
    cap.emissiveIntensity = (0.45 + nf * 1.4) * pulse
    if (lightRef.current) lightRef.current.intensity = nf * 2.4
  })

  return (
    <group>
      {defs.map((d, i) => (
        <group key={i} position={[d.x, d.y, d.z]} scale={d.s}>
          <mesh material={stem} position={[0, 0.1, 0]}>
            <cylinderGeometry args={[0.03, 0.045, 0.2, 8]} />
          </mesh>
          <mesh material={cap} position={[0, 0.22, 0]} scale={[1, 0.6, 1]}>
            <sphereGeometry args={[0.12, 12, 10]} />
          </mesh>
        </group>
      ))}
      {light && (
        <pointLight ref={lightRef} position={[center[0], getHeight(center[0], center[1]) + 0.6, center[1]]} color={color} distance={6} decay={2} />
      )}
    </group>
  )
}

export function GlowProps() {
  const lanterns = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(
      PATH_WAYPOINTS.map((w) => new THREE.Vector3(w.x, 0, w.z)),
      false,
      'catmullrom',
      0.5,
    )
    return [0.16, 0.4, 0.64, 0.85].map((u) => {
      const p = curve.getPoint(u)
      const tan = curve.getTangent(u)
      const nx = -tan.z
      const nz = tan.x
      const off = 1.5
      const x = p.x + nx * off
      const z = p.z + nz * off
      return [x, getHeight(x, z), z] as [number, number, number]
    })
  }, [])

  return (
    <>
      {lanterns.map((p, i) => (
        <Lantern key={i} pos={p} />
      ))}
      <GlowMushrooms center={[NOOK.x - 1.8, NOOK.z + 1.6]} count={7} seed={1} color={0x49f5e0} />
      <GlowMushrooms center={[REGIONS.spookyCorner.x, REGIONS.spookyCorner.z]} count={9} seed={2} color={0x7be36b} />
      <GlowMushrooms center={[REGIONS.pineGrove.x + 3, REGIONS.pineGrove.z + 2]} count={6} seed={3} color={0x6fd0ff} />
      {/* extra decorative clusters scattered around the isle (no point light) */}
      <GlowMushrooms center={[REGIONS.autumnGrove.x + 2, REGIONS.autumnGrove.z - 3]} count={8} seed={4} color={0xff9a3d} light={false} />
      <GlowMushrooms center={[REGIONS.autumnGrove.x - 6, REGIONS.autumnGrove.z + 4]} count={6} seed={8} color={0xb06bff} light={false} />
      <GlowMushrooms center={[REGIONS.meadow.x - 4, REGIONS.meadow.z + 2]} count={7} seed={5} color={0xff6bd0} light={false} />
      <GlowMushrooms center={[REGIONS.rockOverlook.x + 3, REGIONS.rockOverlook.z + 2]} count={6} seed={6} color={0x6fa3ff} light={false} />
      <GlowMushrooms center={[REGIONS.beach.x - 6, REGIONS.beach.z - 6]} count={7} seed={7} color={0x49f5e0} />
    </>
  )
}
