import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getSky } from '../core/palette'
import { useWorld } from '../../state/useWorld'
import { WATER_LEVEL } from '../terrain/terrain'
import { createWaterMaterial, ISLE_FOAM_MAX } from './waterMaterial'
import { RIPPLE } from './rippleField'
import { SWIM } from './swimState'
import { NAV } from '../boat/boatState'
import { foamIslands } from '../archipelago/archipelago'

export function Water() {
  const material = useMemo(() => createWaterMaterial(), [])
  const meshRef  = useRef<THREE.Mesh>(null)
  const foamTimer = useRef(0)
  // Large enough that its edge sits far beyond the fog distance, so the sea
  // reads as endless. Wave detail stays dense near the island where it matters.
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(2600, 2600, 280, 280)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])

  useFrame((state, delta) => {
    const { worldVisible, started, mapId } = useWorld.getState()
    if (meshRef.current) meshRef.current.visible = worldVisible
    if (!worldVisible) return

    const s = getSky(useWorld.getState().t)
    const u = material.uniforms
    u.uTime.value = state.clock.elapsedTime
    // Stay fully present the moment the sea appears — no slow see-through fade-in on
    // the idle "click to start" screen. (Mesh visibility is still gated by worldVisible.)
    u.uOpacity.value = 0.96  // mostly opaque, stylized
    u.uUnder.value = THREE.MathUtils.smoothstep(SWIM.depth, 0, 0.5) // smooth surface→underside
    // shore foam stays hidden on the idle "click to start" screen, ramps in once playing
    u.uShoreFoam.value += ((started ? 1 : 0) - u.uShoreFoam.value) * Math.min(1, delta * 1.5)
    u.uDeep.value.copy(s.waterDeep)
    u.uShallow.value.copy(s.waterShallow)
    u.uSky.value.copy(s.skyBottom)
    u.uSunDir.value.copy(s.sunDir)
    u.uSunColor.value.copy(s.sunColor)
    // night sky / star reflection (fades in with the stars)
    u.uNight.value = s.starsOpacity
    u.uMoonDir.value.copy(s.moonDir)

    // live ripple field — RippleSim swaps RIPPLE.texture each frame
    u.uRipple.value = RIPPLE.texture
    u.uRippleOn.value = RIPPLE.enabled ? 1 : 0
    u.uRippleCenter.value.copy(RIPPLE.center)
    u.uRippleSize.value = RIPPLE.size

    // foam: the home isle uses its shore ring; the archipelago gives each nearby
    // island its own ring (and turns the home ring off so it doesn't stray here).
    if (mapId === 'archipelago') {
      u.uHomeFoamOn.value = 0
      foamTimer.current += delta
      if (foamTimer.current > 0.15) {
        foamTimer.current = 0
        const near = foamIslands(NAV.px, NAV.pz, ISLE_FOAM_MAX)
        const slots = u.uIslands.value as THREE.Vector4[]
        for (let i = 0; i < ISLE_FOAM_MAX; i++) {
          const isl = near[i]
          if (isl) slots[i].set(isl.cx, isl.cz, isl.radius, isl.seed)
          else slots[i].set(0, 0, 0, 0)
        }
        u.uIslandCount.value = near.length
      }
    } else {
      u.uHomeFoamOn.value = 1
      u.uIslandCount.value = 0
    }
  })

  return <mesh ref={meshRef} geometry={geometry} material={material} position={[0, WATER_LEVEL - 0.03, 0]} renderOrder={2} />
}
