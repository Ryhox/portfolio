import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getSky } from './palette'
import { useWorld } from '../state/useWorld'
import { SWIM } from './swimState'
import { useShaftTexture } from './LightShafts'

// Underwater life: soft sunbeams raking down from the surface (day) + rising
// bubbles around the diver. The blue-green/aqua tint itself is the dense fog +
// background DayNight swaps in while submerged; this adds the cozy light & motion
// from the reference. Shown only while diving.

function useBubbleTexture() {
  return useMemo(() => {
    const s = 64
    const c = document.createElement('canvas')
    c.width = c.height = s
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,0.9)')
    g.addColorStop(0.5, 'rgba(255,255,255,0.25)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    return new THREE.CanvasTexture(c)
  }, [])
}

const BUBBLES = 70
const RAYS = 6
// Cool aqua tint mixed into the sunbeam colour each frame — a shared constant so
// the per-ray recolour below allocates nothing.
const _RAY_AQUA = new THREE.Color(0xdff6ff)

export function Underwater() {
  const camera = useThree((s) => s.camera)
  const group = useRef<THREE.Group>(null!)

  // sunbeams
  const shaftTex = useShaftTexture()
  const rayMats = useMemo(
    () =>
      Array.from({ length: RAYS }, () => {
        const m = new THREE.MeshBasicMaterial({
          map: shaftTex,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          fog: false,
          side: THREE.DoubleSide,
          color: new THREE.Color(0xdff6ff),
          opacity: 0,
        })
        ;(m as any).__revealPatched = true
        return m
      }),
    [shaftTex],
  )
  const rayDefs = useMemo(
    () => Array.from({ length: RAYS }, (_, i) => ({ ang: (i / RAYS) * Math.PI * 2 + 0.4, rad: 5 + (i % 3) * 3, phase: i * 1.7 })),
    [],
  )

  // bubbles
  const bubbleTex = useBubbleTexture()
  const bubbleMat = useRef<THREE.PointsMaterial>(null!)
  const bubbles = useMemo(() => {
    const positions = new Float32Array(BUBBLES * 3)
    const spd = new Float32Array(BUBBLES)
    for (let i = 0; i < BUBBLES; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14
      positions[i * 3 + 1] = -5 + Math.random() * 14
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14
      spd[i] = 0.6 + Math.random() * 1.5
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return { g, spd }
  }, [])

  useFrame((state, dt) => {
    const amt = THREE.MathUtils.clamp(THREE.MathUtils.smoothstep(SWIM.depth, 0.1, 1.0), 0, 1)
    if (amt < 0.01 || !useWorld.getState().worldVisible) {
      group.current.visible = false
      return
    }
    group.current.visible = true
    group.current.position.copy(camera.position)

    const time = state.clock.elapsedTime
    const s = getSky(useWorld.getState().t)

    // sunbeams: gentle, daytime, sway on their own phase
    const rayBase = amt * s.dayAmt * 0.16
    rayMats.forEach((m, i) => {
      m.opacity = rayBase * (0.6 + 0.4 * Math.sin(time * 0.6 + rayDefs[i].phase))
      m.color.copy(s.sunColor).lerp(_RAY_AQUA, 0.6)
    })

    // bubbles rise
    const dtc = Math.min(dt, 0.05)
    const pos = bubbles.g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < BUBBLES; i++) {
      let y = pos.getY(i) + bubbles.spd[i] * dtc
      const x = pos.getX(i) + Math.sin(time * 1.5 + i) * 0.012
      if (y > 9) y = -5
      pos.setXYZ(i, x, y, pos.getZ(i))
    }
    pos.needsUpdate = true
    if (bubbleMat.current) bubbleMat.current.opacity = amt * 0.5
  })

  return (
    <group ref={group}>
      {rayDefs.map((d, i) => (
        <mesh
          key={i}
          material={rayMats[i]}
          position={[Math.cos(d.ang) * d.rad, 8, Math.sin(d.ang) * d.rad]}
          rotation={[0.12 * Math.cos(d.ang), d.ang, 0.12 * Math.sin(d.ang)]}
        >
          <planeGeometry args={[5, 26]} />
        </mesh>
      ))}

      <points geometry={bubbles.g} frustumCulled={false}>
        <pointsMaterial
          ref={bubbleMat}
          map={bubbleTex}
          color={0xcfeeff}
          size={0.22}
          sizeAttenuation
          transparent
          depthWrite={false}
          opacity={0}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}
