import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { HEART, NOOK, REGIONS } from './layout'
import { getSky } from './palette'
import { getHeight } from './terrain'
import { WIND } from './loadNature'
import { useWorld } from '../state/useWorld'
import { WORLD_ALPHA, REVEAL_DIST, REVEAL_CENTER } from './revealUniforms'

// Soft round sprite for every particle.
function useDotTexture() {
  return useMemo(() => {
    const s = 64
    const c = document.createElement('canvas')
    c.width = c.height = s
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    const t = new THREE.CanvasTexture(c)
    return t
  }, [])
}

type CloudProps = {
  count: number
  center: [number, number, number]
  area: [number, number, number]
  color: number
  size: number
  mode: 'night' | 'day'
  maxOpacity?: number
  additive?: boolean
  drift?: number
}

function PointCloud({ count, center, area, color, size, mode, maxOpacity = 1, additive = true, drift = 0.6 }: CloudProps) {
  const tex = useDotTexture()
  const points = useRef<THREE.Points>(null!)
  const mat = useRef<THREE.PointsMaterial>(null!)

  // Distance from this cloud's center to the reveal ring origin — ring must
  // sweep past this point before the cloud becomes visible.
  const cloudDist = useMemo(() => {
    const rc = REVEAL_CENTER.value
    return Math.sqrt((center[0] - rc.x) ** 2 + (center[2] - rc.y) ** 2)
  }, [center])

  const { geometry, base, phase } = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const base = new Float32Array(count * 3)
    const phase = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const x = center[0] + (Math.random() - 0.5) * area[0]
      const z = center[2] + (Math.random() - 0.5) * area[2]
      const y = getHeight(x, z) + 0.4 + Math.random() * area[1]
      base[i * 3] = x
      base[i * 3 + 1] = y
      base[i * 3 + 2] = z
      positions.set([x, y, z], i * 3)
      phase[i] = Math.random() * Math.PI * 2
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return { geometry: g, base, phase }
  }, [count, center, area])

  useFrame((state) => {
    if (!useWorld.getState().worldVisible || REVEAL_DIST.value <= 0) { points.current.visible = false; return }
    const ringReveal = THREE.MathUtils.smoothstep(REVEAL_DIST.value, cloudDist - 4, cloudDist + 6)
    if (ringReveal <= 0.01) { points.current.visible = false; return }
    const s = getSky(useWorld.getState().t)
    const vis = mode === 'night' ? s.nightFactor : s.dayAmt
    mat.current.opacity = vis * maxOpacity * WORLD_ALPHA.value * ringReveal
    points.current.visible = vis > 0.02 && WORLD_ALPHA.value > 0.01

    if (points.current.visible) {
      const time = state.clock.elapsedTime
      const pos = geometry.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < count; i++) {
        const ph = phase[i]
        pos.setXYZ(
          i,
          base[i * 3] + Math.sin(time * 0.3 + ph) * drift,
          base[i * 3 + 1] + Math.sin(time * 0.8 + ph) * 0.35,
          base[i * 3 + 2] + Math.cos(time * 0.27 + ph) * drift,
        )
      }
      pos.needsUpdate = true
    }
  })

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        ref={mat}
        map={tex}
        color={color}
        size={size}
        sizeAttenuation
        transparent
        depthWrite={false}
        opacity={0}
        toneMapped={false}
        blending={additive ? THREE.AdditiveBlending : THREE.NormalBlending}
      />
    </points>
  )
}

// The kit's colored leaf atlas (the `_C` texture) used whole — the falling
// leaves are the real, correctly-coloured kit leaves (green from the normal
// tree, red from the twisted tree), just scaled down as small sprites.
function useLeafTex(url: string) {
  return useMemo(() => {
    const tex = new THREE.TextureLoader().load(url)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.generateMipmaps = false
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    return tex
  }, [url])
}

// Leaves shed from the canopies: they spawn through a column, drift down with a
// gentle sway, and loop back to the top. Visible by day, tied to dayAmt.
function FallingLeaves({
  count,
  center,
  area,
  texture,
  size = 0.9,
  speed = 1.4,
}: {
  count: number
  center: [number, number]
  area: number
  texture: THREE.Texture
  size?: number
  speed?: number
}) {
  const points = useRef<THREE.Points>(null!)
  const mat = useRef<THREE.PointsMaterial>(null!)

  const cloudDist = useMemo(() => {
    const rc = REVEAL_CENTER.value
    return Math.sqrt((center[0] - rc.x) ** 2 + (center[1] - rc.y) ** 2)
  }, [center])

  const data = useMemo(() => {
    const positions = new Float32Array(count * 3)
    const bx = new Float32Array(count)
    const bz = new Float32Array(count)
    const top = new Float32Array(count)
    const ground = new Float32Array(count)
    const spd = new Float32Array(count)
    const phase = new Float32Array(count)
    const swayR = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const x = center[0] + (Math.random() - 0.5) * area
      const z = center[1] + (Math.random() - 0.5) * area
      const g = getHeight(x, z)
      bx[i] = x
      bz[i] = z
      ground[i] = g + 0.3
      top[i] = g + 6 + Math.random() * 7
      const y = g + Math.random() * (top[i] - g)
      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
      spd[i] = speed * (0.6 + Math.random() * 0.9)
      phase[i] = Math.random() * Math.PI * 2
      swayR[i] = 0.4 + Math.random() * 0.9
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return { geo, bx, bz, top, ground, spd, phase, swayR }
  }, [count, center, area, speed])

  useFrame((state, delta) => {
    if (!useWorld.getState().worldVisible || REVEAL_DIST.value <= 0) { points.current.visible = false; return }
    const ringReveal = THREE.MathUtils.smoothstep(REVEAL_DIST.value, cloudDist - 4, cloudDist + 6)
    if (ringReveal <= 0.01) { points.current.visible = false; return }
    const s = getSky(useWorld.getState().t)
    mat.current.opacity = (0.35 + s.dayAmt * 0.65) * WORLD_ALPHA.value * ringReveal
    points.current.visible = s.dayAmt > 0.05 && WORLD_ALPHA.value > 0.01
    if (!points.current.visible) return
    const ws = WIND.strength.value
    const swayMul = 0.5 + ws // calmer or more tumbling with the wind
    const fallMul = 0.75 + ws * 0.5
    const t = state.clock.elapsedTime
    const dt = Math.min(delta, 0.05)
    const pos = data.geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < count; i++) {
      let y = pos.getY(i) - data.spd[i] * fallMul * dt
      if (y < data.ground[i]) y = data.top[i]
      const x = data.bx[i] + Math.sin(t * 1.5 + data.phase[i]) * data.swayR[i] * swayMul
      const z = data.bz[i] + Math.cos(t * 1.1 + data.phase[i]) * data.swayR[i] * swayMul
      pos.setXYZ(i, x, y, z)
    }
    pos.needsUpdate = true
  })

  return (
    <points ref={points} geometry={data.geo} frustumCulled={false}>
      <pointsMaterial ref={mat} map={texture} size={size} sizeAttenuation transparent depthWrite={false} opacity={0} alphaTest={0.35} />
    </points>
  )
}

// Fireflies + drifting magic by night; soft pollen by day; leaves shed by day.
export function Particles() {
  // the kit's colored leaf atlases, used whole and scaled down
  const greenLeaf = useLeafTex('/models/nature/Leaves_NormalTree_C.png')
  const redLeaf = useLeafTex('/models/nature/Leaves_TwistedTree_C.png')
  return (
    <>
      {/* warm fireflies drifting across the whole isle at night */}
      <PointCloud count={90} center={[0, 1.4, 0]} area={[58, 3.2, 58]} color={0xffd27a} size={0.5} mode="night" maxOpacity={0.95} drift={0.9} />
      {/* a denser glimmer over the meadow */}
      <PointCloud count={55} center={[REGIONS.meadow.x, 1.4, REGIONS.meadow.z]} area={[REGIONS.meadow.r * 2, 3, REGIONS.meadow.r * 2]} color={0xfff0a0} size={0.45} mode="night" maxOpacity={0.9} drift={0.8} />
      {/* warm embers drifting around the campfire clearing */}
      <PointCloud count={60} center={[NOOK.x, 1.3, NOOK.z]} area={[7, 3, 7]} color={0xff9d4d} size={0.5} mode="night" maxOpacity={0.9} drift={0.6} />
      {/* pale pollen catching the daylight over the meadow */}
      <PointCloud count={70} center={[REGIONS.meadow.x, 1.8, REGIONS.meadow.z]} area={[REGIONS.meadow.r * 2.2, 4, REGIONS.meadow.r * 2.2]} color={0xfff6cf} size={0.3} mode="day" maxOpacity={0.5} additive={false} drift={1.1} />

      {/* falling leaves shed from the canopies (daytime), using the real kit
          leaf textures — green over the green groves, red around the red trees */}
      <FallingLeaves count={12} center={[REGIONS.autumnGrove.x, REGIONS.autumnGrove.z]} area={REGIONS.autumnGrove.r * 2.2} texture={greenLeaf} size={1.4} />
      <FallingLeaves count={7} center={[REGIONS.pineGrove.x, REGIONS.pineGrove.z]} area={REGIONS.pineGrove.r * 2.2} texture={greenLeaf} size={1.2} speed={1.1} />
      <FallingLeaves count={11} center={[HEART.x, HEART.z]} area={34} texture={redLeaf} size={1.4} />
      <FallingLeaves count={6} center={[REGIONS.spookyCorner.x, REGIONS.spookyCorner.z]} area={REGIONS.spookyCorner.r * 2.2} texture={redLeaf} size={1.3} />
    </>
  )
}
