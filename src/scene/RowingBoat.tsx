import { useGLTF } from '@react-three/drei'
import { BOAT_ROT_Y, BOAT_X, BOAT_Z } from './boatConfig'

export function RowingBoat() {
  const { scene } = useGLTF('/models/rowing_boat.glb')

  return (
    <primitive
      object={scene}
      position={[BOAT_X, 8, BOAT_Z]}
      rotation={[0.04, BOAT_ROT_Y, -0.06]}
      scale={0.3}
    />
  )
}

useGLTF.preload('/models/rowing_boat.glb')
