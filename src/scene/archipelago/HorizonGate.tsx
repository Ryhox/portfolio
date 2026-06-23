import { useMemo } from 'react'
import * as THREE from 'three'

// A faint ring lying on the open sea that circles the home isle at the crossing
// radius (~HORIZON_R in Player.tsx). Sailing out across it carries you to the
// archipelago — a soft, discoverable "edge of the world" marker. Flat + low
// opacity, no glow, in keeping with the HUD.
export function HorizonGate() {
  const geometry = useMemo(() => {
    const g = new THREE.RingGeometry(147, 151, 160)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])
  const material = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: 0xeadfbe,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  )
  return <mesh geometry={geometry} material={material} position={[0, 0.5, 0]} renderOrder={2} />
}
