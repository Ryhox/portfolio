import * as THREE from 'three'
import { ALL_DENSE, HEART, ISLAND_RADIUS, ISLET, MESSAGE_BOARD, NOOK, PATH_WAYPOINTS, REGIONS, SOCIAL_ARC, SOCIAL_WAYPOINTS, WEST_WAYPOINTS, distToPath } from './layout'
import { type Placed, getHeight, sampleDisc } from './terrain'
import { pedestalSpots, summitColliders } from './summit'
import { BOAT_X, BOAT_Z } from './boatConfig'

// Clear ground-cover (grass/clover/bushes) off the social pedestals so nothing
// pokes through the floating logos or crowds the bases.
const PEDESTAL_AVOID = pedestalSpots().map((s) => ({ x: s.x, z: s.z, r: 2.8 }))
// Keep the meadow's grass + flowers from flooding the whole social clearing (the
// shrine sits at the edge of the meadow's reach) — clear the dais as one disc.
const DAIS_AVOID = [{ x: SOCIAL_ARC.x, z: SOCIAL_ARC.z, r: 5.5 }]

// Keep ground cover (ferns/grass/clover/bushes) out of the beached boat so nothing
// grows up through the hull.
const BOAT_AVOID = [{ x: BOAT_X, z: BOAT_Z, r: 2.8 }]
// Keep ground cover off the projects board at the end of the west spur so nothing
// grows up through its posts.
const BOARD_AVOID = [{ x: MESSAGE_BOARD.x, z: MESSAGE_BOARD.z, r: 2.2 }]
const COVER_AVOID = [...PEDESTAL_AVOID, ...BOAT_AVOID, ...BOARD_AVOID]

// ---------------------------------------------------------------------------
// THE PLACEMENT — where every prop goes, by design. Each region is filled from
// the authored layout with gentle jitter so groves feel natural but intentional.
// ---------------------------------------------------------------------------

export type Category = 'tree' | 'bush' | 'grass' | 'fern' | 'clover' | 'flower' | 'mushroom' | 'rock' | 'pebble' | 'pathstone'
export type PlacementEntry = {
  model: string
  targetH: number
  items: Placed[]
  cast?: boolean
  recv?: boolean
  align?: boolean // tilt each instance to lie flat on the terrain
  tilt?: number // max random lean in radians (grass) — fuller, less rigid cover
}

const COMMON = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5']
const PINE = ['Pine_1', 'Pine_2', 'Pine_3']
const TWISTED = ['TwistedTree_1', 'TwistedTree_2', 'TwistedTree_3']
const DEAD = ['DeadTree_1', 'DeadTree_2']
const BUSH = ['Bush_Common', 'Bush_Common_Flowers']
// Fuller, green grass for the carpet. The "wispy" models sample the dry
// gold/orange stripes of the palette atlas, so we keep them out of the lawn.
const GRASS = ['Grass_Common_Short', 'Grass_Common_Tall']
const FERN = ['Fern_1', 'Plant_1', 'Plant_7']
const CLOVER = ['Clover_1', 'Clover_2']
const FLOWER = ['Flower_3_Group', 'Flower_3_Single', 'Flower_4_Group', 'Flower_4_Single']
const MUSH = ['Mushroom_Common', 'Mushroom_Laetiporus']
const ROCK = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3']
const PEBBLE = ['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Square_1', 'Pebble_Square_2']
// Only the small single stone — the "_Wide" models are wide multi-cobble
// patches that tile into a broad road and fan out/float on the curves.
const PATHSTONE = ['RockPath_Round_Small_1']

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Split a set of points among model variants, returning one entry per variant.
function variants(
  points: Placed[],
  models: string[],
  seed: number,
  targetH: number,
  opts: { cast?: boolean; recv?: boolean; align?: boolean; tilt?: number } = {},
): PlacementEntry[] {
  const r = rng(seed)
  const buckets = new Map<string, Placed[]>()
  for (const p of points) {
    const m = models[Math.floor(r() * models.length)]
    if (!buckets.has(m)) buckets.set(m, [])
    buckets.get(m)!.push(p)
  }
  return [...buckets].map(([model, items]) => ({ model, items, targetH, ...opts }))
}

// Stepping stones following the trail, aligned to its direction AND tilted to
// lie flat on the terrain (so they don't stand upright on slopes).
// Stepping stones along ONE densified trail branch (centred on the same polyline
// distToPath measures, so they stay on the dirt). startArc skips the first stretch
// so a branch doesn't double up stones over its parent at the fork.
function stonesAlong(pts: { x: number; z: number }[], seed: number, startArc: number): Placed[] {
  const cum: number[] = [0]
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z)
  }
  const total = cum[cum.length - 1]

  // position + unit tangent at an arc-length distance along the polyline
  const at = (d: number) => {
    let i = 1
    while (i < cum.length && cum[i] < d) i++
    if (i >= cum.length) i = cum.length - 1
    const a = pts[i - 1]
    const b = pts[i]
    const segLen = cum[i] - cum[i - 1] || 1e-6
    const t = (d - cum[i - 1]) / segLen
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
      tx: (b.x - a.x) / segLen,
      tz: (b.z - a.z) / segLen,
    }
  }

  // Pick the number of GAPS from the target spacing, then place one more stone than
  // gaps — so the actual gap is total/segs ≈ the same 4.6 on every branch (short or
  // long), the first stone sits at startArc and the last lands on the endpoint.
  const segs = Math.max(1, Math.round((total - startArc) / 4.6))
  const n = segs + 1
  const r = rng(seed)
  const items: Placed[] = []
  for (let i = 0; i < n; i++) {
    const c = at(startArc + (i / segs) * (total - startArc))
    const side = Math.sin(i * 1.7) * 0.06
    const x = c.x - c.tz * side
    const z = c.z + c.tx * side
    // Orient each stone along the trail's direction (plus a little random twist) so
    // they read as a laid path, not a grid of identically-aligned slabs.
    const rotY = Math.atan2(c.tx, c.tz) + (r() - 0.5) * 0.6
    items.push({ x, y: getHeight(x, z) - 0.22, z, rotY, scale: 0.8 + r() * 0.45 })
  }
  return items
}

// Stepping stones for every trail branch (the climb to the tree + the fork to the
// socials).
function pathStones(): PlacementEntry[] {
  // Every branch the same — the climb, the social fork AND the west spur, which is
  // now flattened like the others (see terrain.ts) so its cobbles lie flush too.
  const items: Placed[] = []
  for (let b = 0; b < ALL_DENSE.length; b++) {
    items.push(...stonesAlong(ALL_DENSE[b], 900 + b * 17, b === 0 ? 1.5 : 2.6))
  }
  return variants(items, PATHSTONE, 901, 0.45, { recv: true, align: true })
}

// Points strewn just to the sides of a trail branch (for flower borders).
function pathSides(count: number, seed: number, waypoints: { x: number; z: number }[] = PATH_WAYPOINTS): Placed[] {
  const curve = new THREE.CatmullRomCurve3(
    waypoints.map((w) => new THREE.Vector3(w.x, 0, w.z)),
    false,
    'catmullrom',
    0.5,
  )
  const r = rng(seed)
  const out: Placed[] = []
  let guard = 0
  while (out.length < count && guard < count * 20) {
    guard++
    const u = r()
    const p = curve.getPoint(u)
    const tan = curve.getTangent(u)
    const nx = -tan.z
    const nz = tan.x
    const off = (3.2 + r() * 1.8) * (r() < 0.5 ? -1 : 1)
    const x = p.x + nx * off
    const z = p.z + nz * off
    const h = getHeight(x, z)
    if (h < 0.6) continue
    // Keep flowers off the dirt itself (where branches cross at the fork the offset
    // alone isn't enough) and clear of the social pedestals.
    if (distToPath(x, z) < 2.4) continue
    if (PEDESTAL_AVOID.some((a) => (x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r)) continue
    out.push({ x, y: h, z, rotY: r() * Math.PI * 2, scale: 0.8 + r() * 0.5 })
  }
  return out
}

export function buildPlacements(): PlacementEntry[] {
  const e: PlacementEntry[] = []
  const { pineGrove, autumnGrove, spookyCorner, meadow, rockOverlook } = REGIONS

  // ✦ Heartwood — the grand landmark tree crowning the central hill.
  e.push({
    model: 'TwistedTree_2',
    targetH: 16,
    cast: true,
    items: [{ x: HEART.x, y: getHeight(HEART.x, HEART.z), z: HEART.z, rotY: 0.7, scale: 1 }],
  })

  // ✦ Autumn grove (warm CommonTrees), west. Trees are tall and majestic.
  e.push(
    ...variants(
      sampleDisc({ cx: autumnGrove.x, cz: autumnGrove.z, r: autumnGrove.r, count: 18, seed: 11, minScale: 0.85, maxScale: 1.3, minDist: 6, awayFromPath: 3 }),
      COMMON,
      101,
      9.2,
      { cast: true },
    ),
  )

  // ✦ Pine grove (cool, dense), northwest.
  e.push(
    ...variants(
      sampleDisc({ cx: pineGrove.x, cz: pineGrove.z, r: pineGrove.r, count: 24, seed: 12, minScale: 0.85, maxScale: 1.35, minDist: 5.5 }),
      PINE,
      102,
      10.5,
      { cast: true },
    ),
  )

  // ✦ Spooky corner (dead + twisted), backing the witch's nook.
  e.push(
    ...variants(
      sampleDisc({ cx: spookyCorner.x, cz: spookyCorner.z, r: spookyCorner.r, count: 13, seed: 13, minScale: 0.8, maxScale: 1.3, minDist: 5 }),
      [...DEAD, ...TWISTED],
      103,
      8.5,
      { cast: true },
    ),
  )

  // ✦ Bushes — human-scale, soft borders scattered across the isle.
  e.push(
    ...variants(
      sampleDisc({ cx: 0, cz: 0, r: ISLAND_RADIUS - 4, count: 95, seed: 21, minScale: 0.8, maxScale: 1.4, minDist: 2.2, awayFromPath: 1.6, avoid: COVER_AVOID }),
      BUSH,
      104,
      1.4,
      { cast: true },
    ),
  )

  // ✦ Grass — a thick carpet everywhere, then even thicker in the meadow. This
  // dense ground cover is what gives the lush, painterly look.
  e.push(...variants(sampleDisc({ cx: 0, cz: 0, r: ISLAND_RADIUS - 0.5, count: 6500, seed: 31, minScale: 0.7, maxScale: 1.7, awayFromPath: 2.4, avoid: COVER_AVOID }), GRASS, 105, 0.85, { tilt: 0.32 }))
  e.push(...variants(sampleDisc({ cx: meadow.x, cz: meadow.z, r: meadow.r + 3, count: 2600, seed: 32, minScale: 0.8, maxScale: 1.6, awayFromPath: 2.4, avoid: [...COVER_AVOID, ...DAIS_AVOID] }), GRASS, 106, 0.95, { tilt: 0.32 }))
  e.push(...variants(sampleDisc({ cx: autumnGrove.x, cz: autumnGrove.z, r: autumnGrove.r, count: 1400, seed: 36, minScale: 0.8, maxScale: 1.5, awayFromPath: 2.4 }), GRASS, 37, 0.9, { tilt: 0.32 }))

  // ✦ Flowers — fill the meadow and line the path.
  e.push(...variants(sampleDisc({ cx: meadow.x, cz: meadow.z, r: meadow.r, count: 520, seed: 33, minScale: 0.85, maxScale: 1.5, awayFromPath: 2.4, avoid: [...PEDESTAL_AVOID, ...DAIS_AVOID] }), FLOWER, 107, 0.65))
  e.push(...variants(pathSides(220, 34, PATH_WAYPOINTS), FLOWER, 108, 0.6))
  e.push(...variants(pathSides(70, 38, SOCIAL_WAYPOINTS), FLOWER, 115, 0.6))
  e.push(...variants(pathSides(55, 39, WEST_WAYPOINTS), FLOWER, 116, 0.6))

  // ✦ Clover — broad low ground cover filling between the grass.
  e.push(...variants(sampleDisc({ cx: 0, cz: 0, r: ISLAND_RADIUS - 1, count: 2400, seed: 35, minScale: 0.8, maxScale: 1.5, awayFromPath: 2.2, avoid: COVER_AVOID }), CLOVER, 109, 0.34))

  // ✦ Ferns — shady pine grove + along the shore.
  e.push(...variants(sampleDisc({ cx: pineGrove.x, cz: pineGrove.z, r: pineGrove.r, count: 120, seed: 41, minScale: 0.8, maxScale: 1.5 }), FERN, 110, 1.1))
  e.push(...variants(sampleDisc({ cx: 0, cz: 0, r: ISLAND_RADIUS, innerR: ISLAND_RADIUS - 14, count: 150, seed: 42, zones: ['grass', 'sand'], maxSlope: 0.5, minScale: 0.8, maxScale: 1.3, avoid: BOAT_AVOID }), FERN, 111, 0.95))

  // ✦ Mushrooms — clustered in the shady pine grove + spooky corner.
  e.push(...variants(sampleDisc({ cx: pineGrove.x, cz: pineGrove.z, r: pineGrove.r, count: 40, seed: 51, minScale: 0.8, maxScale: 1.6 }), MUSH, 112, 0.55))
  e.push(...variants(sampleDisc({ cx: spookyCorner.x, cz: spookyCorner.z, r: spookyCorner.r, count: 22, seed: 52, minScale: 0.9, maxScale: 1.7 }), MUSH, 113, 0.55))

  // ✦ Rocks — human-scale, a little overlook outcrop on the north shoulder.
  // maxSlope raised to 0.65 so rocks only land on gently sloping ground — on
  // steep faces an upright rock looks half-buried and half-floating.
  e.push(
    ...variants(
      sampleDisc({ cx: rockOverlook.x, cz: rockOverlook.z, r: rockOverlook.r, count: 8, seed: 61, minScale: 0.9, maxScale: 1.8, minDist: 3, maxSlope: 0.65 }),
      ROCK,
      62,
      1.9,
      { cast: true, recv: true },
    ),
  )

  // ✦ Pebbles — strewn along the sandy shore.
  // maxSlope raised to 0.75 (≈41° max) so align:true pebbles don't lie nearly
  // horizontal and look like floating planks on steep cliff faces.
  e.push(
    ...variants(
      sampleDisc({ cx: 0, cz: 0, r: ISLAND_RADIUS, innerR: ISLAND_RADIUS - 12, count: 110, seed: 63, zones: ['sand', 'grass'], maxSlope: 0.75, minScale: 0.7, maxScale: 1.5, avoid: BOAT_AVOID }),
      PEBBLE,
      64,
      0.4,
      { recv: true, align: true },
    ),
  )

  // ✦ Path — stepping stones along the trail.
  e.push(...pathStones())

  // ✦ Sakura islet behind the spawn — a lone cherry tree on its little crown,
  // softened with grass and a few pink blooms.
  e.push({
    model: 'SakuraTree_1',
    targetH: 7,
    cast: true,
    items: [{ x: ISLET.x, y: getHeight(ISLET.x, ISLET.z), z: ISLET.z, rotY: 0.6, scale: 1.1 }],
  })
  e.push(
    ...variants(
      sampleDisc({ cx: ISLET.x, cz: ISLET.z, r: ISLET.flatR + 1.5, count: 260, seed: 71, minScale: 0.7, maxScale: 1.5 }),
      GRASS,
      72,
      0.9,
      { tilt: 0.32 },
    ),
  )
  e.push(
    ...variants(
      sampleDisc({ cx: ISLET.x, cz: ISLET.z, r: ISLET.flatR, count: 46, seed: 73, minScale: 0.8, maxScale: 1.4 }),
      ['FlowerPink_Group', 'FlowerPink_Single'],
      74,
      0.6,
    ),
  )

  return e
}

// Built once and shared by the renderer (Scatter) and the collision system so
// the heavy sampling only runs a single time.
let _cache: PlacementEntry[] | null = null
export function getPlacements(): PlacementEntry[] {
  if (!_cache) _cache = buildPlacements()
  return _cache
}

// --- collision --------------------------------------------------------------
// Trees and rocks become solid cylinders the wanderer can't walk through.
// Everything else (grass, bushes, flowers, pebbles…) stays walk-through. Radii
// are deliberately a touch generous so you stop before clipping into a trunk.
// The path stones are NOT walls — see buildPathSteps: you step up and over them.
const TREE_MODELS = new Set([...COMMON, ...PINE, ...TWISTED, ...DEAD])
const ROCK_MODELS = new Set(ROCK)
const PATHSTONE_MODELS = new Set(PATHSTONE)

export type Collider = { x: number; z: number; r: number }

export function buildColliders(): Collider[] {
  const out: Collider[] = []
  for (const e of getPlacements()) {
    let base = 0
    if (e.model === 'TwistedTree_2' && e.targetH >= 14) base = 1.8 // the grand Heartwood
    else if (TREE_MODELS.has(e.model)) base = 0.55
    else if (e.model.startsWith('SakuraTree')) base = 0.7 // the islet sakura — solid trunk
    else if (ROCK_MODELS.has(e.model)) base = 0.9
    else continue
    for (const it of e.items) out.push({ x: it.x, z: it.z, r: base * it.scale })
  }
  // The path lamps are solid posts you bump into.
  for (const s of buildLampSpots()) out.push({ x: s.x, z: s.z, r: 0.4 })
  // The summit social pedestals are solid stone you bump into.
  for (const s of summitColliders()) out.push(s)
  return out
}

// Where the path lamps stand — shared by the renderer (GlowProps) and the
// collision system so they line up exactly. Spaced along the same trail curve, and
// they ALTERNATE sides (left, right, left, right…) like a real avenue. The offset is
// pushed clear of the dirt half-width so a lamp never sits in the walking lane — the
// last one used to land on the trail and block it.
const LAMP_US = [0.16, 0.4, 0.64, 0.84]
const LAMP_OFFSET = 2.5
export function buildLampSpots(): { x: number; y: number; z: number; rotY: number }[] {
  const curve = new THREE.CatmullRomCurve3(
    PATH_WAYPOINTS.map((w) => new THREE.Vector3(w.x, 0, w.z)),
    false,
    'catmullrom',
    0.5,
  )
  return LAMP_US.map((u, i) => {
    const p = curve.getPoint(u)
    const tan = curve.getTangent(u)
    const side = i % 2 === 0 ? 1 : -1 // alternate left/right down the avenue
    const x = p.x + -tan.z * LAMP_OFFSET * side
    const z = p.z + tan.x * LAMP_OFFSET * side
    // The lamp model faces a fixed way; the left-side ones need a half-turn so they
    // lean over the trail instead of away from it.
    return { x, y: getHeight(x, z), z, rotY: side === -1 ? Math.PI : 0 }
  })
}

// Low, solid props (the path stones and the shore pebbles) read as gentle steps
// rather than walls: when the wanderer is over one the camera rises to its top
// and settles back down once past it — a soft stair feel, never a hard block.
// Taller rock outcrops stay walls (buildColliders) — so it's all decided by height.
const PEBBLE_MODELS = new Set(PEBBLE)
export type Step = { x: number; z: number; r: number; h: number }

export function buildSteps(): Step[] {
  const out: Step[] = []
  for (const e of getPlacements()) {
    let rk = 0
    let hk = 0
    if (PATHSTONE_MODELS.has(e.model)) {
      rk = 0.7
      hk = 0.3
    } else if (PEBBLE_MODELS.has(e.model)) {
      rk = 0.5
      hk = 0.22
    } else continue
    for (const it of e.items) out.push({ x: it.x, z: it.z, r: rk * it.scale, h: hk * it.scale })
  }
  return out
}

// --- minimap markers --------------------------------------------------------
// The notable .glb landmarks worth plotting on the minimap: every tree (incl.
// the grand Heartwood), the rock outcrops, and the path lamps. Grass/flowers/
// pebbles are skipped — they'd just be noise at map scale.
// `color` is an optional per-prop override (the archipelago sets it per biome);
// the home map leaves it unset and falls back to the generic kind colours.
export type MapProp = { x: number; z: number; kind: 'tree' | 'rock' | 'lamp'; color?: string }
export function buildMapProps(): MapProp[] {
  const out: MapProp[] = []
  for (const e of getPlacements()) {
    let kind: MapProp['kind'] | null = null
    if (TREE_MODELS.has(e.model)) kind = 'tree'
    else if (ROCK_MODELS.has(e.model)) kind = 'rock'
    else continue
    for (const it of e.items) out.push({ x: it.x, z: it.z, kind })
  }
  for (const s of buildLampSpots()) out.push({ x: s.x, z: s.z, kind: 'lamp' })
  return out
}
