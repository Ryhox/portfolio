import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { NOOK, REGIONS } from './layout'
import { getSky } from './palette'
import { getHeight, getNormal } from './terrain'
import { buildLampSpots } from './placement'
import { useWorld } from '../state/useWorld'
import { patchReveal } from './patchReveal'

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Target world-space height for the lamp model. The GLB is auto-scaled to this
// regardless of its native units, then its base is dropped flush to the ground.
const LAMP_HEIGHT = 3.4
const LAMP_WARM = new THREE.Color(0xffb86a)
const LAMP_UP = new THREE.Vector3(0, 1, 0)

// Stylized lamp model — replaces the old box-built lantern. Auto-scaled from its
// own bounding box so it stands LAMP_HEIGHT tall, base on the ground. Each
// instance gets its own cloned materials so they can glow independently: every
// material emits in its own (warm-shifted) color, scaled by the night factor, so
// the light shade blazes at night while the dark post barely glows. A warm point
// light near the head matches the old lantern's pool of light.
const lum = (c: THREE.Color) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b

function Lamp({ pos, rotY }: { pos: [number, number, number]; rotY: number }) {
  const { scene } = useGLTF('/models/stylized_lamp.glb')
  const light = useRef<THREE.PointLight>(null!)
  const phase = useMemo(() => Math.random() * 6.28, [])
  const glowMats = useRef<THREE.MeshStandardMaterial[]>([])

  const { model, lightPos } = useMemo(() => {
    const root = scene.clone(true)
    root.updateMatrixWorld(true)
    const size = new THREE.Vector3()
    new THREE.Box3().setFromObject(root).getSize(size)
    root.scale.setScalar(LAMP_HEIGHT / (size.y || 1))
    root.updateMatrixWorld(true)

    // Recompute at final scale to seat the base on the ground and centre it.
    const box = new THREE.Box3().setFromObject(root)
    const center = new THREE.Vector3()
    box.getCenter(center)
    root.position.set(-center.x, -box.min.y, -center.z)
    root.updateMatrixWorld(true)

    // First pass: clone+patch every material and find the brightest one — the
    // lantern glass/shade. Only that part glows (not the dark post).
    type Hit = { mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial }
    const hits: Hit[] = []
    let maxLum = 0
    // The lantern is one mesh per part, all sharing a single vertex-coloured
    // material, so the "brightest material" test can't tell the glass from the
    // post — anchor the light to the glass panel mesh by name instead.
    let lanternMesh: THREE.Mesh | null = null
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!(mesh as { isMesh?: boolean }).isMesh) return
      if (mesh.name.includes('lamp7')) lanternMesh = mesh
      mesh.castShadow = true
      // Build a FRESH MeshStandardMaterial (rather than cloning the GLB's) so the
      // reveal patch reliably takes — cloned materials can skip the shader patch
      // and pop in unmasked during the intro sweep.
      const apply = (src: THREE.Material) => {
        const s = src as THREE.MeshStandardMaterial
        const m = new THREE.MeshStandardMaterial({
          color: s.color ? s.color.clone() : new THREE.Color(0xffffff),
          map: s.map ?? null,
          normalMap: s.normalMap ?? null,
          roughnessMap: s.roughnessMap ?? null,
          metalnessMap: s.metalnessMap ?? null,
          roughness: s.roughness ?? 1,
          metalness: s.metalness ?? 0,
          vertexColors: s.vertexColors ?? false,
          transparent: s.transparent ?? false,
          opacity: s.opacity ?? 1,
          side: s.side,
        })
        if (s.emissive) m.emissive.copy(s.emissive)
        if (s.emissiveMap) m.emissiveMap = s.emissiveMap
        patchReveal(m)
        if (m.color) {
          hits.push({ mesh, mat: m })
          maxLum = Math.max(maxLum, lum(m.color))
        }
        return m
      }
      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(apply)
        : apply(mesh.material)
    })

    // Second pass: the bright materials become the glowing shade; collect the
    // world-space centre of their meshes so the point light sits in the lantern.
    const glowBox = new THREE.Box3()
    const mats: THREE.MeshStandardMaterial[] = []
    for (const { mesh, mat } of hits) {
      if (mat.color && lum(mat.color) >= Math.max(0.18, maxLum * 0.7)) {
        mat.emissive.copy(mat.color).lerp(LAMP_WARM, 0.45)
        mat.emissiveIntensity = 0
        mat.toneMapped = false
        mats.push(mat)
        glowBox.expandByObject(mesh)
      }
    }
    // Seat the point light in the centre of the lantern glass (where the flame
    // is), not at the centroid of the whole lamp.
    const lp = new THREE.Vector3()
    if (lanternMesh) new THREE.Box3().setFromObject(lanternMesh).getCenter(lp)
    else if (!glowBox.isEmpty()) glowBox.getCenter(lp)
    else lp.set(0, LAMP_HEIGHT * 0.82, 0)

    glowMats.current = mats
    return { model: root, lightPos: lp }
  }, [scene])

  // Tilt the post so it stands on the slope correctly (its base follows the
  // ground normal instead of poking through / floating on inclines).
  const quat = useMemo(() => {
    const n = getNormal(pos[0], pos[2])
    return new THREE.Quaternion().setFromUnitVectors(LAMP_UP, n)
  }, [pos])

  useFrame((state) => {
    const nf = getSky(useWorld.getState().t).nightFactor
    const flick = 0.85 + Math.sin(state.clock.elapsedTime * 7 + phase) * 0.15
    const e = nf * 1.7 * flick
    for (const m of glowMats.current) m.emissiveIntensity = e
    light.current.intensity = nf * 3.2 * flick
  })

  return (
    <group position={pos} quaternion={quat}>
      <group rotation={[0, rotY, 0]}>
        <primitive object={model} />
        <pointLight ref={light} position={lightPos} color={0xffb86a} distance={9} decay={2} />
      </group>
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
  const cap = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0, roughness: 0.5, toneMapped: false })
    patchReveal(m); return m
  }, [color])
  const stem = useMemo(() => { const m = new THREE.MeshStandardMaterial({ color: 0xe9e3d2, roughness: 0.9 }); patchReveal(m); return m }, [])
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
  const lanterns = useMemo(
    () => buildLampSpots().map((s) => ({ pos: [s.x, s.y, s.z] as [number, number, number], rotY: s.rotY })),
    [],
  )

  return (
    <>
      {lanterns.map((l, i) => (
        <Lamp key={i} pos={l.pos} rotY={l.rotY} />
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

useGLTF.preload('/models/stylized_lamp.glb')
