// Shared boat constants — consumed by RowingBoat.tsx (render), boatState.ts
// (pose + colliders) and Player.tsx (spawn).
//
// minecraft_boat.glb (by vovash, CC-BY-4.0). Sketchfab node matrix makes the
// loaded scene ~1 unit, with the hull length along X and the two paddles on the
// ±Z sides. BOAT_MODEL_YAW spins it so the bow points +Z (travel); BOAT_SCALE
// sizes it to a ~3 m boat.

// Beached on the sakura headland's western shore, a short way in FRONT-LEFT of the
// spawn (player spawns at ~(2,66) looking north up the island). Sits ~39° left of the
// spawn gaze — comfortably inside the 60° fov — so it's the first thing you notice,
// pulled up on the sand at the water's edge with its bow angled toward the sea.
export const BOAT_X = -5
export const BOAT_Z = 58
export const BOAT_SCALE = 2.35
export const BOAT_ROT_Y = -0.9 // radians, Y-axis — bow angled out toward the western water
