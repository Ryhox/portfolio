// Shared boat constants — consumed by RowingBoat.tsx (render), boatState.ts
// (pose + colliders) and Player.tsx (spawn).
//
// minecraft_boat.glb (by vovash, CC-BY-4.0). Sketchfab node matrix makes the
// loaded scene ~1 unit, with the hull length along X and the two paddles on the
// ±Z sides. BOAT_MODEL_YAW spins it so the bow points +Z (travel); BOAT_SCALE
// sizes it to a ~3 m boat.

// Beached on the south shore just west of the bridge, so it's in view (and clear
// of the crossing) when you turn around at spawn.
export const BOAT_X = -7
export const BOAT_Z = 58
export const BOAT_SCALE = 2.35
export const BOAT_ROT_Y = 2.5 // radians, Y-axis — beached lean (tuned visually)
