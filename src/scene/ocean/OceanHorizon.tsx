import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getSky } from '../core/palette'
import { useWorld } from '../../state/useWorld'
import { WORLD_ALPHA } from '../terrain/revealUniforms'

// The far horizon: just a few faint islands barely there through the haze, for a
// sense of distance. (Rocks sticking out of the water + the far sailboat were
// removed at the user's request.) Flagged out of the island reveal and faded
// only with the world.

const patched = <M extends THREE.Material>(m: M): M => {
  ;(m as any).__revealPatched = true
  return m
}

function DistantIslands() {
  const mat = useMemo(
    () =>
      patched(
        new THREE.MeshBasicMaterial({ color: 0x9fb3c4, transparent: true, opacity: 0.5, fog: false, depthWrite: false }),
      ),
    [],
  )
  const isles = useMemo(() => {
    // spread near → very far for a layered horizon
    const defs = [
      { ang: 0.5, rad: 360, w: 120, h: 26 },
      { ang: 1.9, rad: 250, w: 70, h: 16 },
      { ang: 3.5, rad: 430, w: 160, h: 34 },
      { ang: 5.0, rad: 340, w: 70, h: 16 },
      { ang: 2.6, rad: 560, w: 220, h: 42 },
      { ang: 5.8, rad: 300, w: 90, h: 20 },
    ]
    return defs.map((d) => {
      const g = new THREE.SphereGeometry(1, 18, 10)
      g.scale(d.w, d.h, d.w * 0.5)
      return { g, x: Math.cos(d.ang) * d.rad, z: Math.sin(d.ang) * d.rad }
    })
  }, [])
  const root = useRef<THREE.Group>(null!)
  useFrame(() => {
    if (!useWorld.getState().worldVisible) {
      root.current.visible = false
      return
    }
    root.current.visible = true
    const s = getSky(useWorld.getState().t)
    // tint toward the horizon haze so they read as atmosphere, not solid land
    mat.color.copy(s.fog).lerp(s.skyBottom, 0.4).multiplyScalar(0.92)
    mat.opacity = 0.5 * WORLD_ALPHA.value
  })
  return (
    <group ref={root}>
      {isles.map((p, i) => (
        <mesh key={i} geometry={p.g} material={mat} position={[p.x, -2, p.z]} />
      ))}
    </group>
  )
}

export function OceanHorizon() {
  return <DistantIslands />
}
