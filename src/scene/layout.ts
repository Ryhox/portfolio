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

// Central landmark hill, crowned by the grand "Heartwood" twisted tree.
export const HEART = { x: 0, z: -2, r: 28, height: 12 }

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

// The single trail: south beach → winds up the hill → hilltop.
export const PATH_WAYPOINTS: V2[] = [
  { x: 2, z: 54 },
  { x: 4, z: 48 },
  { x: 2, z: 38 },
  { x: -4, z: 26 },
  { x: -1, z: 14 },
  { x: 3, z: 5 },
  { x: 0, z: -2 },
]

export const PLAYER_SPAWN = { x: 2, z: 54, lookAt: { x: 0, z: 0 } }

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

export function distToPath(x: number, z: number): number {
  let best = Infinity
  for (let i = 0; i < PATH_DENSE.length - 1; i++) {
    const a = PATH_DENSE[i]
    const b = PATH_DENSE[i + 1]
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
