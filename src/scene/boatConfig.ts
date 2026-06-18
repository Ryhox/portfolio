// Shared boat constants — consumed by RowingBoat.tsx (render),
// placement.ts (collision + step), and Player.tsx (spawn).
//
// Internal node transforms in the GLB (scale 0.01 + axis swap) make the mesh
// appear inverted and tiny.  Applying scale=7 and rotation=[PI, ROT_Y, 0]
// corrects both issues:
//   • scale 7 → boat ~5.8 m long, ~2.9 m wide, ~1.7 m tall
//   • PI flip → keel at +0.142 m above pivot (bottom), gunwale at +1.695 m (top)

export const BOAT_X     = 0
export const BOAT_Z     = 58
export const BOAT_SCALE = 7
export const BOAT_ROT_Y = 0.4   // radians, Y-axis (angled on beach)

// After flip: keel sits 0.142 m above pivot; sink 0.20 m into sand.
export const BOAT_Y_HULL_MIN  = 0.142
export const BOAT_Y_HULL_SINK = 0.20

// Player stands ~30 cm above terrain when inside the hull.
export const BOAT_STEP_H = 0.30

// World-space positions of the three hull cylinders.
// After the PI flip + ROT_Y rotation the boat's axis direction is:
//   dx = -sin(ROT_Y), dz = -cos(ROT_Y)
// Local Z extents (at scale 7): -2.565 m … +3.270 m from pivot.
const SX = -Math.sin(BOAT_ROT_Y)   // ≈ -0.389
const SZ = -Math.cos(BOAT_ROT_Y)   // ≈ -0.921

function wpt(lz: number) {
  return { x: BOAT_X + lz * SX, z: BOAT_Z + lz * SZ }
}

export const BOAT_COLLIDERS = [
  { ...wpt( 3.0), r: 1.1 },   // one end
  { ...wpt( 0.0), r: 1.5 },   // amidships
  { ...wpt(-2.4), r: 1.1 },   // other end
]

export const BOAT_STEP = {
  ...wpt(0.0),
  r: 2.5,
  h: BOAT_STEP_H,
}
