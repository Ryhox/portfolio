// Shared boat constants — consumed by RowingBoat.tsx (render),
// placement.ts (collision + step), and Player.tsx (spawn).

export const BOAT_X     = 0
export const BOAT_Z     = 58
export const BOAT_SCALE = 0.15
export const BOAT_ROT_Y = 0.4   // radians, Y-axis

// GLB bounding box: Y min=2.03 (hull keel), scale 0.15 → keel is 0.305 m above pivot
export const BOAT_Y_HULL_MIN  = 2.03 * BOAT_SCALE   // 0.305 m
export const BOAT_Y_HULL_SINK = 0.15                 // how deep we bed into sand

// Deck estimate: model Y≈6 × scale (gunwale rim, not the tall oar tips)
const DECK_MODEL_Y          = 6
export const DECK_ABOVE_PIVOT = DECK_MODEL_Y * BOAT_SCALE  // 0.90 m

// Step-system offset so the player stands on the deck.
// = DECK_ABOVE_PIVOT − HULL_MIN − HULL_SINK  (terrain cancels out)
export const BOAT_STEP_H =
  DECK_ABOVE_PIVOT - BOAT_Y_HULL_MIN - BOAT_Y_HULL_SINK  // ≈ 0.45 m

// Three hull cylinders (stern / amidships / bow) in world XZ.
// Local model Z: stern ≈ -40, mid ≈ -5, bow ≈ +25 (model units)
const _c = Math.cos(BOAT_ROT_Y)
const _s = Math.sin(BOAT_ROT_Y)
function cyl(lz: number, r: number) {
  return { x: BOAT_X + lz * BOAT_SCALE * _s, z: BOAT_Z + lz * BOAT_SCALE * _c, r }
}
export const BOAT_COLLIDERS = [
  cyl(-40, 1.8),   // stern
  cyl( -5, 2.5),   // amidships (widest)
  cyl( 25, 1.8),   // bow
]

// Single deck step centred at amidships
export const BOAT_STEP = {
  x: BOAT_X + (-5) * BOAT_SCALE * _s,
  z: BOAT_Z + (-5) * BOAT_SCALE * _c,
  r: 3.0,
  h: BOAT_STEP_H,
}
