// ---------------------------------------------------------------------------
// THE MAP — authored design for Witchwood Isle.
//
// This is the hand-drawn blueprint: where each region sits, how the path winds,
// where features go. terrain.ts shapes the ground to match this, and
// placement.ts places every prop according to it. Nothing here is random — the
// only randomness later is gentle per-object jitter *within* these designed
// regions so groves look natural rather than gridded.
//
// A roomy-but-cozy island (~68u radius). Coordinate convention: XZ plane,
// +z = south (toward the camera at spawn), -z = north. Player spawns on the
// south beach looking north at the hill.
// ---------------------------------------------------------------------------

export const ISLAND_RADIUS = 68
export const WATER_LEVEL = 0
export const TERRAIN_HALF = 104
export const SHORE_LIMIT = ISLAND_RADIUS + 5

export type V2 = { x: number; z: number }

// Central landmark hill, crowned by the grand "Heartwood" twisted tree. (Lowered
// for a gentler, overall-flatter island.)
export const HEART = { x: 0, z: -2, r: 28, height: 6 }

// Designed regions. r is an approximate influence radius.
export const REGIONS = {
  pineGrove: { x: -30, z: -22, r: 18 },
  autumnGrove: { x: -28, z: 18, r: 18 },
  spookyCorner: { x: 28, z: -26, r: 14 },
  meadow: { x: 26, z: 22, r: 20 },
  rockOverlook: { x: -4, z: -42, r: 10 },
  beach: { x: 0, z: 50, r: 24 },
} as const

// The Witch's Nook clearing (flattened platform on the hill's east shoulder).
export const NOOK = { x: 20, z: -12, r: 9 }

// The trail runs as ONE path straight up to the portrait on the Heartwood. Halfway
// up the final straight — on top, before the tree — it forks at FORK: the MAIN
// branch carries straight on (north) to the portrait, while a SECOND branch peels
// off to the RIGHT and runs DUE EAST across the flat shelf to the social shrine.
// Both branches share the FORK waypoint so the dirt + stepping stones read as one
// trail that splits. FORK sits on the straight line (≈z 14 → 1.6) so the climb to
// the tree stays dead straight.
const FORK: V2 = { x: -0.66, z: 8 }

// The social shrine: a flat clearing FAR EAST of the fork, out on the hilltop's
// natural flat shelf (the crown is ~9.3; the shelf sits ~8.3 and barely varies from
// x≈12–22 at this latitude). The centre shares the fork's z so the branch runs dead
// straight east — never angling north — and the pedestals face back west toward the
// climber. `flatR` = radius of fully-level dais ground (blended out past it). Shared
// by terrain.ts (flatten the ground) and summit.ts (place the pedestals).
export const SOCIAL_ARC = { x: 16, z: FORK.z, flatR: 5 }

export const PATH_WAYPOINTS: V2[] = [
  { x: 2, z: 54 },
  { x: 4, z: 48 },
  { x: 2, z: 38 },
  { x: -4, z: 26 },
  { x: -1, z: 14 },
  FORK,
  { x: -0.2, z: -0.35 }, // carries straight on right up to just in front of the trunk, below the portrait
]

// The social branch: from the fork, peel off to the right and run DEAD STRAIGHT EAST
// (constant z) across the shelf to arrive just west of the pedestals.
export const SOCIAL_WAYPOINTS: V2[] = [
  FORK,
  { x: 5, z: FORK.z },
  { x: 9, z: FORK.z },
  { x: 15, z: FORK.z }, // run right up to the mouth of the pedestal half-circle
]

// The WEST branch: a short spur that peels off the main climb near the foot of the
// hill — right where the old reading bench stood — and runs WEST (kept up north,
// across the bench's old latitude) to a little message board (the projects board).
// It's treated exactly like the other trails: dirt + stepping stones, grass cleared,
// and the narrow path corridor flattened + slightly recessed (via distToPath) so the
// cobbles lie flush and natural. Only the path is touched; the hill is untouched.
export const WEST_WAYPOINTS: V2[] = [
  { x: -0.5, z: 3 }, // joins the main climb at the foot of the hill
  { x: -4, z: 2.3 }, // passes where the bench used to sit
  { x: -9, z: 1.7 },
  { x: -13.5, z: 1.2 }, // arrive at the message board
]

// Where the projects message board stands — at the very end of the west spur,
// just past the last stepping stone. Shared by MessageBoard.tsx (render + interact)
// and Campfire.tsx (so the reading bench faces it).
export const MESSAGE_BOARD = { x: -14.4, z: 1.0 }

export const PLAYER_SPAWN = { x: 2, z: 54, lookAt: { x: 0, z: 0 } }

// ---------------------------------------------------------------------------
// THE SAKURA ISLET — a small detached island raised out in the water BEHIND the
// spawn (to the south), reached by a little wooden bridge. You spawn on it, under
// a lone sakura. Purely additive: terrain.ts only RAISES new land here (Math.max),
// so the main island and its hill are never touched. `wobble` warps the outline so
// it reads as a natural island rather than a perfect disc.
// ---------------------------------------------------------------------------
export const ISLET = { x: 2, z: 74, r: 10, flatR: 5.5, top: 1.6, wobble: 2.2 }

// The bridge across the gap: end A on the main south shore, end B on the islet.
// length/yaw/modelY fine-tune the GLB so its deck spans both shores. The walk
// surface is a SMOOTH analytic deck (a gentle ramp + slight arch between the two
// banks — see bridgeCollision.ts) so crossing feels smooth, not plank-bumpy, with
// open water beneath.
export const BRIDGE = {
  ax: 2,
  az: 57,
  bx: 2,
  bz: 67,
  half: 1.8, // deck half-width
  arch: 0.18, // gentle hump in the middle of the deck
  width: 3.6, // model WIDTH/height target (keeps it a normal footbridge)
  length: 12, // model is STRETCHED along its long axis to this span (not scaled up)
  yaw: 0,
  modelY: 0.2, // vertical seat of the model (tuned to the GLB)
}

// --- 2D math helpers --------------------------------------------------------
export function dist(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(ax - bx, az - bz)
}

function buildDensePath(pts: V2[], stepsPerSeg = 10): V2[] {
  const p = [pts[0], ...pts, pts[pts.length - 1]]
  const out: V2[] = []
  const cr = (a: number, b: number, c: number, d: number, t: number) => {
    const t2 = t * t
    const t3 = t2 * t
    return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
  }
  for (let i = 1; i < p.length - 2; i++) {
    for (let s = 0; s < stepsPerSeg; s++) {
      const t = s / stepsPerSeg
      out.push({
        x: cr(p[i - 1].x, p[i].x, p[i + 1].x, p[i + 2].x, t),
        z: cr(p[i - 1].z, p[i].z, p[i + 1].z, p[i + 2].z, t),
      })
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

export const PATH_DENSE: V2[] = buildDensePath(PATH_WAYPOINTS)
export const SOCIAL_DENSE: V2[] = buildDensePath(SOCIAL_WAYPOINTS)
export const WEST_DENSE: V2[] = buildDensePath(WEST_WAYPOINTS)
// Every trail branch, for the stone/flower placement and the dirt-colour test.
export const ALL_DENSE: V2[][] = [PATH_DENSE, SOCIAL_DENSE, WEST_DENSE]

// Shortest distance from (x,z) to a single densified polyline.
function distToPolyline(x: number, z: number, pts: V2[]): number {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz || 1e-6
    let t = ((x - a.x) * dx + (z - a.z) * dz) / len2
    t = t < 0 ? 0 : t > 1 ? 1 : t
    const cx = a.x + dx * t
    const cz = a.z + dz * t
    const d = Math.hypot(x - cx, z - cz)
    if (d < best) best = d
  }
  return best
}

// Distance to the NEAREST trail branch (incl. the west spur) — drives grass/flower
// avoidance + the dirt colour so the whole network reads as walked ground.
export function distToPath(x: number, z: number): number {
  return Math.min(
    distToPolyline(x, z, PATH_DENSE),
    distToPolyline(x, z, SOCIAL_DENSE),
    distToPolyline(x, z, WEST_DENSE),
  )
}

// Per-branch distances, so the dirt colour can be drawn at a different width on the
// social branch (kept slim) than on the main climb.
export function distToMainPath(x: number, z: number): number {
  return distToPolyline(x, z, PATH_DENSE)
}
export function distToSocialPath(x: number, z: number): number {
  return distToPolyline(x, z, SOCIAL_DENSE)
}
export function distToWestPath(x: number, z: number): number {
  return distToPolyline(x, z, WEST_DENSE)
}
