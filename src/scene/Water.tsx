import { useFrame } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { getSky } from './palette'
import { useWorld } from '../state/useWorld'
import { WATER_LEVEL } from './terrain'
import { createWaterMaterial } from './waterMaterial'

export function Water() {
  const material = useMemo(() => createWaterMaterial(), [])
  // Large enough that its edge sits far beyond the fog distance, so the sea
  // reads as endless. Wave detail stays dense near the island where it matters.
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(2600, 2600, 280, 280)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])

  useFrame((state) => {
    const s = getSky(useWorld.getState().t)
    const u = material.uniforms
    u.uTime.value = state.clock.elapsedTime
    u.uDeep.value.copy(s.waterDeep)
    u.uShallow.value.copy(s.waterShallow)
    u.uSky.value.copy(s.skyBottom)
    u.uSunDir.value.copy(s.sunDir)
    u.uSunColor.value.copy(s.sunColor)
  })

  return <mesh geometry={geometry} material={material} position={[0, WATER_LEVEL - 0.03, 0]} renderOrder={2} />
}
