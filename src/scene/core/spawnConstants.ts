import { getHeight } from '../terrain/terrain'
import { HEART } from '../terrain/layout'

export const SPAWN_X = 2
export const SPAWN_Z = 66 // on the sakura headland crown (moved in with ISLET.z)

// The exact world point the camera looks at at the END of the intro fly-in AND the
// instant first-person control takes over — SHARED by Experience (fly-in) and Player
// (spawn) so the hand-off is seamless (no snap / sudden re-aim). Looks north, level,
// up the island toward the Heartwood hill, inviting the player inward.
export const SPAWN_LOOK = { x: 0, y: 3, z: 0 }

// Ring/reveal is on the hilltop Heartwood tree, not the beach spawn.
export const RING_X = HEART.x
export const RING_Z = HEART.z
export const RING_GROUND_Y = Math.max(getHeight(RING_X, RING_Z), 0) + 0.001

// Average terrain height at the ring boundary (radius 5 from center).
// The hilltop plateau is nearly flat but fbm detail causes slight variation.
// Used to align the decorative flat ring with where patchReveal terrain glow appears.
const _RING_R = 5.0
export const RING_EDGE_Y = Math.max(
  [0, 1, 2, 3, 4, 5, 6, 7].reduce((sum, i) => {
    const a = (i / 8) * Math.PI * 2
    return sum + getHeight(RING_X + Math.cos(a) * _RING_R, RING_Z + Math.sin(a) * _RING_R)
  }, 0) / 8,
  0,
) + 0.003
