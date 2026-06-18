import { useGLTF } from '@react-three/drei'
import {
  BOAT_ROT_Y, BOAT_SCALE, BOAT_X,
  BOAT_Y_HULL_MIN, BOAT_Y_HULL_SINK, BOAT_Z,
} from './boatConfig'
import { getHeight } from './terrain'

export function RowingBoat() {
  const { scene } = useGLTF('/models/rowing_boat.glb')

  // Internal node transforms leave the hull hanging *below* the pivot (all Y
  // values negative at scale 7).  Raising the pivot by hull depth + sink buries
  // the keel 0.20 m into the sand while keeping the gunwale visible above it.
  const groundY = Math.max(getHeight(BOAT_X, BOAT_Z), 0.15)
  // keel sits BOAT_Y_HULL_SINK (0.20 m) below the sand surface
  const pivotY  = groundY - BOAT_Y_HULL_MIN - BOAT_Y_HULL_SINK

  return (
    // Use a group so position/rotation/scale are applied cleanly on top of the
    // primitive's own internal glTF hierarchy.
    <group
      position={[BOAT_X, pivotY, BOAT_Z]}
      rotation={[Math.PI, BOAT_ROT_Y, -0.06]}
      scale={BOAT_SCALE}
    >
      <primitive object={scene} />
    </group>
  )
}

useGLTF.preload('/models/rowing_boat.glb')
