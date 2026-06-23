// ---------------------------------------------------------------------------
// THE ARCHIPELAGO — the second map. Each GitHub stargazer becomes one permanent
// island. Everything is a pure function of the (ordered) stargazer list, so
// nothing needs saving on a server:
//   • POSITION comes from star-RANK (your rank never changes once you've
//     starred) — islands fan outward in 5 named wedge "groups", so the map grows
//     outward as stars climb.
//   • LOOK (biome + size) comes from hash(username) — the gamble, fixed to you.
// The height field is registered into terrain.getHeight so the boat + player
// physics drive this map with no call-site changes.
// ---------------------------------------------------------------------------

import { create } from 'zustand'
import { createNoise2D } from 'simplex-noise'
import * as THREE from 'three'
import {
  getActiveMap,
  registerArchHeight,
  sampleDisc,
  setActiveMap,
  type Placed,
} from '../terrain'
import { smoothstep } from '../palette'
import type { Collider, MapProp, Step } from '../placement'
import {
  pickWeighted,
  SIZE_TIERS,
  SIZE_TOTAL,
  THEME_TOTAL,
  THEMES,
  type SizeTier,
  type Theme,
  type Tier,
  type Variant,
} from './biomes'
import { loadStargazerLogins, refreshStargazerLogins, nextRefreshAt } from './stargazers'

export type IslandInstance = {
  id: number // star rank (0-based)
  login: string
  name: string // "<login>'s Island"
  group: number // theme index 0..THEMES.length-1
  groupName: string
  theme: Theme // the group/cluster (shared look family + rarity)
  biome: Variant // the specific look within the theme
  size: SizeTier // size tier (decoupled from look)
  cx: number
  cz: number
  radius: number
  seed: number
  seedX: number
  seedZ: number
  isMother?: boolean // the big central landmark island of a group (not a stargazer)
}

// Group names come straight from the themes — one cluster per theme.
export const GROUP_NAMES = THEMES.map((t) => t.name)

export const ARCH_SPAWN = { x: 0, z: 0, heading: 0 }
const DEEP = -30 // open-sea floor away from any island

// --- deterministic helpers --------------------------------------------------
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// FNV-1a string hash → uint32 seed.
function hashLogin(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const noise = createNoise2D(mulberry32(7777))
function fbm(x: number, z: number, octaves: number, freq: number) {
  let sum = 0
  let amp = 1
  let norm = 0
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, z * freq) * amp
    norm += amp
    amp *= 0.5
    freq *= 2
  }
  return sum / norm
}

// --- cluster layout (one cluster per theme, REALLY far apart) ----------------
export const GROUP_RING = 460 // each theme's cluster centre sits this far from spawn
const CLUSTER_SPACING = 32 // phyllotaxis spacing of islands within a cluster (cosy)
const MIN_CENTER = 40 // keep the spawn (boat) area at the origin clear
const MARGIN = 20 // min open water between island shores (close, not touching)
const GOLDEN = Math.PI * (3 - Math.sqrt(5))

// Each theme owns a cluster centre, evenly spaced on a big ring around spawn.
function clusterCenter(group: number): { x: number; z: number } {
  const ang = (group / THEMES.length) * Math.PI * 2
  return { x: Math.cos(ang) * GROUP_RING, z: Math.sin(ang) * GROUP_RING }
}

// Sunflower (phyllotaxis) packing: slot 0 sits at the cluster centre, the rest
// spiral outward evenly. relax() then enforces the minimum shore gap, and each
// island's slot is permanent (its running index within the theme), so positions
// never shift as new stars arrive.
function clusterPos(group: number, slot: number): { cx: number; cz: number } {
  const c = clusterCenter(group)
  const r = CLUSTER_SPACING * Math.sqrt(slot)
  const ang = slot * GOLDEN + group * 1.7
  return { cx: c.x + Math.cos(ang) * r, cz: c.z + Math.sin(ang) * r }
}

// Deterministic relaxation: nudge overlapping islands apart and off the spawn.
function relax(islands: IslandInstance[]) {
  // Space islands by their *bulged* radius (lobes reach radius·SHORE_MAX), so two
  // coastlines facing each other still keep MARGIN of open water between them.
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < islands.length; i++) {
      const a = islands[i]
      const ra = a.radius * SHORE_MAX
      if (!a.isMother) {
        const dc = Math.hypot(a.cx, a.cz) || 1
        const minC = MIN_CENTER + ra
        if (dc < minC) {
          const s = minC / dc
          a.cx *= s
          a.cz *= s
        }
      }
      for (let j = i + 1; j < islands.length; j++) {
        const b = islands[j]
        const dx = b.cx - a.cx
        const dz = b.cz - a.cz
        const d = Math.hypot(dx, dz)
        const need = ra + b.radius * SHORE_MAX + MARGIN
        if (d < need && d > 1e-3) {
          // Mother islands are fixed anchors at the cluster centre — only the
          // stargazer island moves when something overlaps a mother.
          const aFixed = a.isMother
          const bFixed = b.isMother
          const wa = aFixed ? 0 : bFixed ? 1 : 0.5
          const wb = bFixed ? 0 : aFixed ? 1 : 0.5
          const push = (need - d) / d
          a.cx -= dx * push * wa
          a.cz -= dz * push * wa
          b.cx += dx * push * wb
          b.cz += dz * push * wb
        }
      }
    }
  }
}

// The grand central landmark of every group: bigger than any stargazer island
// and named for the region, so it reads as the "capital" you sail out from.
const MOTHER_RADIUS = 40
const MOTHER_SIZE: SizeTier = { id: 'mother', name: 'Mother island', weight: 0, rMin: 38, rMax: 42 }

function buildMother(theme: Theme, group: number): IslandInstance {
  const c = clusterCenter(group)
  const login = `__mother_${theme.id}`
  const seed = hashLogin(login)
  const rng = mulberry32(seed)
  // The region's signature look = its rarest (lowest-weight) "prize" variant, so
  // the mother shows off the prettiest face of the group (e.g. Sakura Grove for
  // Bloomtide Vale, not the everyday Wildflower Meadow).
  const biome = theme.variants.reduce((a, b) => (b.weight < a.weight ? b : a))
  return {
    id: -1 - group, // unique, never collides with a 0-based star rank
    login,
    name: `${theme.name} — Mother Isle`,
    group,
    groupName: theme.name,
    theme,
    biome,
    size: MOTHER_SIZE,
    cx: c.x,
    cz: c.z,
    radius: MOTHER_RADIUS,
    seed,
    seedX: ((rng() * 2000) | 0) - 1000,
    seedZ: ((rng() * 2000) | 0) - 1000,
    isMother: true,
  }
}

// Hand-tuned island overrides for specific stargazers, keyed by lowercased login.
// These replace ONLY that person's region/look/size — everyone else is still rolled
// purely from their username hash, and the override doesn't touch the rng sequence,
// so the island's terrain detail (seedX/seedZ) and everyone else stay identical.
const ISLAND_OVERRIDES: Record<string, { themeId: string; variantId: string; sizeId: string }> = {
  plattnericus: { themeId: 'bloomtide', variantId: 'sakura', sizeId: 'huge' }, // gifted a Huge Sakura Grove
}

export function buildIslands(logins: string[]): IslandInstance[] {
  // One mother island per group, anchored at the cluster centre. Stargazers start
  // at slot 1 so they ring the mother instead of landing on top of it.
  const mothers = THEMES.map((theme, g) => buildMother(theme, g))
  const slotByGroup = new Array(THEMES.length).fill(1)
  const stars: IslandInstance[] = logins.map((login, rank) => {
    const seed = hashLogin(login.toLowerCase())
    const rng = mulberry32(seed)
    // Three permanent rolls from the username hash: theme (group), the look
    // within it, and the size tier. Order matters — keep it stable.
    let theme = pickWeighted(THEMES, rng)
    let biome = pickWeighted(theme.variants, rng)
    let size = pickWeighted(SIZE_TIERS, rng)
    let radius = size.rMin + rng() * (size.rMax - size.rMin)
    // Apply a hand-tuned override for this login, if any (after consuming the rng
    // above so terrain detail and everyone else are unaffected).
    const ov = ISLAND_OVERRIDES[login.toLowerCase()]
    if (ov) {
      theme = THEMES.find((t) => t.id === ov.themeId) ?? theme
      biome = theme.variants.find((v) => v.id === ov.variantId) ?? biome
      size = SIZE_TIERS.find((s) => s.id === ov.sizeId) ?? size
      radius = (size.rMin + size.rMax) / 2
    }
    const group = THEMES.indexOf(theme)
    const slot = slotByGroup[group]++ // running index within the cluster
    const { cx, cz } = clusterPos(group, slot)
    return {
      id: rank,
      login,
      name: `${login}'s Island`,
      group,
      groupName: theme.name,
      theme,
      biome,
      size,
      cx,
      cz,
      radius,
      seed,
      seedX: ((rng() * 2000) | 0) - 1000,
      seedZ: ((rng() * 2000) | 0) - 1000,
    }
  })
  const islands = [...mothers, ...stars]
  relax(islands)
  return islands
}

// --- height field -----------------------------------------------------------
// Per-island coastline warp: instead of a perfect circle, the effective radius
// breathes in and out with direction so every island reads as an organic, lobed
// landmass. Built from a few angular harmonics with per-island phases (derived
// from the seed) — periodic in angle, deterministic, and cheap to sample. Mean
// is 1.0 so the island keeps its rolled `radius`; total swing stays under ~38%
// so the shore stays convex-ish (no pinched-off or self-crossing spikes).
// SHORE_MAX = the farthest the coast can bulge out (1 + sum of amplitudes); prop
// sampling scales its disc by this so the lobes don't sit bare.
export const SHORE_MAX = 1 + 0.18 + 0.12 + 0.08
function shoreShape(isl: IslandInstance, ang: number): number {
  const s = isl.seed
  const p1 = ((s & 0xff) / 255) * Math.PI * 2
  const p2 = (((s >> 8) & 0xff) / 255) * Math.PI * 2
  const p3 = (((s >> 16) & 0xff) / 255) * Math.PI * 2
  return (
    1 +
    0.18 * Math.sin(ang * 2 + p1) +
    0.12 * Math.sin(ang * 3 + p2) +
    0.08 * Math.sin(ang * 5 + p3)
  )
}

// A single island's dome: a smooth hill that rises in the core and plunges below
// the seabed past its shore. Used for both the visible mesh and archHeight.
export function islandHeightAt(isl: IslandInstance, x: number, z: number): number {
  const dx = x - isl.cx
  const dz = z - isl.cz
  const d = Math.hypot(dx, dz)
  // Warp the radius by direction so the coastline is island-shaped, not round.
  const R = isl.radius * shoreShape(isl, Math.atan2(dz, dx))
  if (d > R * 1.9) return DEEP
  const edge = d / R
  const mask = 1 - smoothstep(0.5, 1.0, edge)
  // Broad, gentle crown (sigma 0.72·R, not 0.5·R) so the centre rounds off
  // softly instead of peaking. Peak height ≈ heightScale·0.46 so the islands read
  // as low, rather-flat land rather than steep domes.
  const crown = Math.exp(-(d * d) / (2 * (R * 0.72) ** 2))
  // Mothers stand taller so they read as the grand central landmark of a group.
  const hs = isl.biome.heightScale * (isl.isMother ? 2.4 : 1)
  let h = mask * hs * 0.30 + crown * hs * 0.16
  h += mask * fbm(x + isl.seedX, z + isl.seedZ, 3, 0.05) * isl.biome.detail
  h -= smoothstep(0.92, 1.6, edge) * 26 // plunge to the seabed past the shore
  return h
}

// --- spatial grid so archHeight only checks nearby islands ------------------
const CELL = 48
type Grid = Map<string, IslandInstance[]>
const ARCH: { islands: IslandInstance[]; grid: Grid; extent: number } = {
  islands: [],
  grid: new Map(),
  extent: 120,
}
const EMPTY: IslandInstance[] = []
const cellKey = (ci: number, cj: number) => ci + ',' + cj

function rebuildGrid() {
  const grid: Grid = new Map()
  let extent = 120
  for (const isl of ARCH.islands) {
    const reach = isl.radius * 1.8
    extent = Math.max(extent, Math.hypot(isl.cx, isl.cz) + isl.radius + 24)
    const i0 = Math.floor((isl.cx - reach) / CELL)
    const i1 = Math.floor((isl.cx + reach) / CELL)
    const j0 = Math.floor((isl.cz - reach) / CELL)
    const j1 = Math.floor((isl.cz + reach) / CELL)
    for (let ci = i0; ci <= i1; ci++) {
      for (let cj = j0; cj <= j1; cj++) {
        const k = cellKey(ci, cj)
        let arr = grid.get(k)
        if (!arr) {
          arr = []
          grid.set(k, arr)
        }
        arr.push(isl)
      }
    }
  }
  ARCH.grid = grid
  ARCH.extent = extent
}

function nearbyIslands(x: number, z: number): IslandInstance[] {
  return ARCH.grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))) ?? EMPTY
}

// Registered into terrain.getHeight: open sea everywhere, rising over islands.
// Exported too so the minimap can sample the archipelago directly.
export function archHeight(x: number, z: number): number {
  let h = DEEP
  const near = nearbyIslands(x, z)
  for (let i = 0; i < near.length; i++) {
    const hi = islandHeightAt(near[i], x, z)
    if (hi > h) h = hi
  }
  return h
}
registerArchHeight(archHeight)

export function archipelagoExtent(): number {
  return ARCH.extent
}

// Island whose shore is nearest (edgeDist < 0 means you're over its land).
export function nearestIsland(x: number, z: number): { isl: IslandInstance; edgeDist: number } | null {
  let best: IslandInstance | null = null
  let bestD = Infinity
  for (const isl of ARCH.islands) {
    const d = Math.hypot(x - isl.cx, z - isl.cz) - isl.radius
    if (d < bestD) {
      bestD = d
      best = isl
    }
  }
  return best ? { isl: best, edgeDist: bestD } : null
}

// The island whose dome is the tallest at (x,z) — i.e. the one whose terrain you
// actually stand on there. Used to colour the maps with that island's biome
// palette. Returns null over open sea.
export function archDominantIsland(x: number, z: number): IslandInstance | null {
  const near = nearbyIslands(x, z)
  let best: IslandInstance | null = null
  let bestH = -Infinity
  for (let i = 0; i < near.length; i++) {
    const hi = islandHeightAt(near[i], x, z)
    if (hi > bestH) {
      bestH = hi
      best = near[i]
    }
  }
  return best
}

// Nearest islands to a point — fed to the water shader as a foam-ring array.
// `seed` carries the low 24 bits of the island seed so the shader can rebuild the
// exact same `shoreShape` phases and hug the real (lobed) coastline, not a circle.
export type FoamIsland = { cx: number; cz: number; radius: number; seed: number }
export function foamIslands(x: number, z: number, max: number): FoamIsland[] {
  return ARCH.islands
    .map((i) => ({ i, d: Math.hypot(x - i.cx, z - i.cz) - i.radius }))
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map(({ i }) => ({ cx: i.cx, cz: i.cz, radius: i.radius, seed: i.seed & 0xffffff }))
}

// --- per-island "how lucky was this roll" stats (shown on the luck card) -----
export type IslandStats = {
  group: string
  biomeName: string
  biomePct: number // P(theme) * P(variant within theme) — chance of this exact look
  sizeName: string
  sizePct: number
  tier: Tier
  luck: string
  isMother?: boolean // a group's central landmark, not a rolled stargazer island
  // Mother isles show the whole REGION's odds instead of one island's roll:
  region?: {
    groupPct: number // chance any star lands in this group at all
    variants: { name: string; pct: number }[] // odds of each look once you're in it
    sizes: { name: string; pct: number }[] // size-tier odds (independent of group)
  }
}

function luckLabel(p: number): string {
  if (p < 0.004) return 'Legendary luck!'
  if (p < 0.02) return 'Incredibly lucky!'
  if (p < 0.06) return 'Lucky find!'
  if (p < 0.16) return 'A tidy roll'
  return 'A common roll'
}

export function islandStats(isl: IslandInstance): IslandStats {
  if (isl.isMother) {
    // Not a roll — it's the region's capital. Show the whole region's odds:
    // chance to land in this group, the look odds within it, and the size odds.
    const vTotal = isl.theme.variants.reduce((s, v) => s + v.weight, 0)
    return {
      group: isl.theme.name,
      biomeName: 'Mother Island',
      biomePct: 0,
      sizeName: isl.theme.name,
      sizePct: 0,
      tier: isl.theme.tier,
      luck: 'The heart of this region',
      isMother: true,
      region: {
        groupPct: (isl.theme.weight / THEME_TOTAL) * 100,
        variants: isl.theme.variants.map((v) => ({ name: v.name, pct: (v.weight / vTotal) * 100 })),
        sizes: SIZE_TIERS.map((sz) => ({ name: sz.name, pct: (sz.weight / SIZE_TOTAL) * 100 })),
      },
    }
  }
  const pTheme = isl.theme.weight / THEME_TOTAL
  const vTotal = isl.theme.variants.reduce((s, v) => s + v.weight, 0)
  const pBiome = pTheme * (isl.biome.weight / vTotal)
  const pSize = isl.size.weight / SIZE_TOTAL
  return {
    group: isl.theme.name,
    biomeName: isl.biome.name,
    biomePct: pBiome * 100,
    sizeName: isl.size.name,
    sizePct: pSize * 100,
    tier: isl.theme.tier,
    luck: luckLabel(pBiome * pSize),
  }
}

// --- vertex colouring (biome palette) ---------------------------------------
const _grass = new THREE.Color()
const _hi = new THREE.Color()
const _sand = new THREE.Color()
const _sandWet = new THREE.Color()
const _rock = new THREE.Color()
const _under = new THREE.Color()

export function archColorAt(
  isl: IslandInstance,
  x: number,
  h: number,
  z: number,
  normalY: number,
  out: THREE.Color,
): THREE.Color {
  const p = isl.biome.palette
  const tint = (noise(x * 0.18 + isl.seedX, z * 0.18) + 1) * 0.5
  const up = smoothstep(0.7, Math.max(2, isl.biome.heightScale), h)
  _grass.setHex(p.grassLo).lerp(_hi.setHex(p.grassHi), up * 0.65 + tint * 0.35)
  out.copy(_grass)
  const sandAmt = smoothstep(1.6, 0.3, h)
  const wet = smoothstep(0.3, -0.8, h)
  _sand.setHex(p.sand).lerp(_sandWet.setHex(p.sandWet), wet)
  out.lerp(_sand, sandAmt)
  out.lerp(_under.setHex(p.under), smoothstep(-0.25, -2.4, h))
  const rockAmt = smoothstep(0.76, 0.56, normalY) * smoothstep(-0.5, 0.8, h)
  out.lerp(_rock.setHex(p.rock), rockAmt)
  return out
}

// --- props ------------------------------------------------------------------
export type ArchEntry = {
  model: string
  items: Placed[]
  targetH: number
  cast?: boolean
  recv?: boolean
  align?: boolean
  tilt?: number
  tint?: number
  sink?: number // metres to embed the base (rocks/trees) so they don't float on slopes
}

// Split sampled points among a biome plan's model variants (one entry each).
function splitVariants(points: Placed[], models: string[], seed: number) {
  const r = mulberry32(seed)
  const buckets = new Map<string, Placed[]>()
  for (const p of points) {
    const m = models[Math.floor(r() * models.length)]
    let arr = buckets.get(m)
    if (!arr) {
      arr = []
      buckets.set(m, arr)
    }
    arr.push(p)
  }
  return [...buckets].map(([model, items]) => ({ model, items }))
}

function buildArchPlacements(islands: IslandInstance[]): ArchEntry[] {
  const prev = getActiveMap()
  setActiveMap('archipelago') // so sampleDisc samples archipelago terrain
  const out: ArchEntry[] = []
  for (const isl of islands) {
    const refR = (isl.size.rMin + isl.size.rMax) / 2
    // Mothers are far bigger than any size tier, so scale their prop counts by
    // actual area (vs a normal island) instead — otherwise they'd look bare.
    const areaScale = isl.isMother
      ? Math.min(4.5, (isl.radius / 13) ** 2)
      : Math.min(2.2, Math.max(0.5, (isl.radius / refR) ** 2))
    isl.biome.props.forEach((plan, pi) => {
      const seed = (isl.seed ^ Math.imul(pi + 1, 0x9e3779b1)) >>> 0
      // Keep trees well inland — sampling them out to the shore puts them on the
      // edge slope where they float / hang over the water. Ground cover & rocks
      // keep the wider spread so the island still looks full to its beaches.
      const isTreePlan = plan.models.some((m) => TREE_SET.has(m))
      // Fill follows the warped coast: the disc reaches the same edge fraction in
      // every direction (radiusShape), so lobes fill and dents pull back — no bare
      // bulges, no props pushed past the shore or into the water.
      const items = sampleDisc({
        cx: isl.cx,
        cz: isl.cz,
        r: isl.radius * (isTreePlan ? 0.74 : 0.92),
        radiusShape: (ang) => shoreShape(isl, ang),
        count: Math.max(1, Math.round(plan.count * areaScale)),
        seed,
        minScale: plan.minScale ?? 1,
        maxScale: plan.maxScale ?? 1,
        zones: plan.zones ?? ['grass', 'sand'],
        maxSlope: plan.maxSlope ?? 0.7,
        minDist: plan.minDist ?? 0,
      })
      const tint = plan.tint ?? isl.biome.propTint
      for (const v of splitVariants(items, plan.models, (seed ^ 0x5bd1e995) >>> 0)) {
        // Ground props firmly: rocks tilt to the surface normal AND sink a little,
        // trees just sink at the base — so neither floats where the island curves
        // or slopes (worst at the shores). Plans can still override `align`.
        const isRock = ROCK_SET.has(v.model)
        const isTree = TREE_SET.has(v.model)
        const align = plan.align ?? isRock
        const sink = isRock ? plan.targetH * 0.18 : isTree ? 0.35 : 0
        out.push({
          model: v.model,
          items: v.items,
          targetH: plan.targetH,
          cast: plan.cast,
          recv: plan.recv,
          align,
          tilt: plan.tilt,
          tint,
          sink,
        })
      }
    })
  }
  setActiveMap(prev)
  return out
}

// Build the heavy placement once per island set; scatter/colliders/steps/minimap
// all read it (mirrors placement.getPlacements()).
let _placeCache: { islands: IslandInstance[]; entries: ArchEntry[] } | null = null
export function getArchPlacements(islands: IslandInstance[]): ArchEntry[] {
  if (!_placeCache || _placeCache.islands !== islands) {
    _placeCache = { islands, entries: buildArchPlacements(islands) }
  }
  return _placeCache.entries
}

const TREE_SET = new Set([
  'CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5',
  'Pine_1', 'Pine_2', 'Pine_3',
  'TwistedTree_1', 'TwistedTree_2', 'TwistedTree_3',
  'DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'DeadTree_4', 'DeadTree_5',
  'SakuraTree_1', 'SakuraTree_2', 'SakuraTree_3', 'SakuraTree_4', 'SakuraTree_5',
  'SnowPine_1', 'SnowPine_2', 'SnowPine_3',
  'SnowTree_1', 'SnowTree_2', 'SnowTree_3', 'SnowTree_4', 'SnowTree_5',
])
const ROCK_SET = new Set([
  'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3',
  'DesertRock_Medium_1', 'DesertRock_Medium_2', 'DesertRock_Medium_3',
  'SnowRock_Medium_1', 'SnowRock_Medium_2', 'SnowRock_Medium_3',
])
const PEBBLE_SET = new Set(['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Square_1', 'Pebble_Square_2'])

export function archColliders(islands: IslandInstance[]): Collider[] {
  const out: Collider[] = []
  for (const e of getArchPlacements(islands)) {
    let base = 0
    if (TREE_SET.has(e.model)) base = 0.55
    else if (ROCK_SET.has(e.model)) base = 0.9
    else continue
    for (const it of e.items) out.push({ x: it.x, z: it.z, r: base * it.scale })
  }
  return out
}

export function archSteps(islands: IslandInstance[]): Step[] {
  const out: Step[] = []
  for (const e of getArchPlacements(islands)) {
    if (!PEBBLE_SET.has(e.model)) continue
    for (const it of e.items) out.push({ x: it.x, z: it.z, r: 0.5 * it.scale, h: 0.22 * it.scale })
  }
  return out
}

// Minimap dot colours per biome: rocks take the biome's rock colour; trees take a
// representative canopy colour for the theme (snow-white on Frostfell, pink on
// Sakura, ember-red, sandy dead wood on the desert, green in the woods).
const hexColor = (n: number) => '#' + (n & 0xffffff).toString(16).padStart(6, '0')
const TREE_MAP_COLOR: Record<string, string> = {
  wildwood: '#3f7a32',
  bleakshoal: '#6b7158',
  ember_hollow: '#b9532f',
  frostfell: '#dbe7ee',
  bloomtide: '#eaa6cb',
  desert: '#c3ad84',
}

export function buildArchMapProps(islands: IslandInstance[]): MapProp[] {
  const out: MapProp[] = []
  for (const e of getArchPlacements(islands)) {
    let kind: MapProp['kind'] | null = null
    if (TREE_SET.has(e.model)) kind = 'tree'
    else if (ROCK_SET.has(e.model)) kind = 'rock'
    else continue
    for (const it of e.items) {
      const isl = archDominantIsland(it.x, it.z)
      const color = isl
        ? kind === 'rock'
          ? hexColor(isl.biome.palette.rock)
          : TREE_MAP_COLOR[isl.theme.id] ?? '#3f7a32'
        : undefined
      out.push({ x: it.x, z: it.z, kind, color })
    }
  }
  return out
}

// Label anchors for the maps: centroid of each group's islands, or the cluster
// centre when a group is still empty (so every group name always shows).
export function groupLabels(islands: IslandInstance[]): { name: string; x: number; z: number }[] {
  return THEMES.map((theme, g) => {
    const mine = islands.filter((i) => i.group === g)
    if (mine.length === 0) {
      const c = clusterCenter(g)
      return { name: theme.name, x: c.x, z: c.z }
    }
    let sx = 0
    let sz = 0
    for (const i of mine) {
      sx += i.cx
      sz += i.cz
    }
    return { name: theme.name, x: sx / mine.length, z: sz / mine.length }
  })
}

// --- store: load stargazers → islands (stale-while-revalidate) --------------
type ArchStore = { islands: IslandInstance[]; ready: boolean; ensureLoaded: () => void }

let _started = false
let _currentKey = ''

export const useArchipelago = create<ArchStore>((set) => {
  const apply = (logins: string[]) => {
    const key = logins.join(',')
    if (key === _currentKey && ARCH.islands.length) return
    _currentKey = key
    const islands = buildIslands(logins)
    ARCH.islands = islands
    rebuildGrid()
    _placeCache = null
    set({ islands, ready: true })
  }
  // Re-pull the stargazer list on a UTC-aligned 5-min cadence so brand-new
  // islands appear without a reload. Self-rescheduling (re-aligns each cycle, so
  // it survives clock drift / a sleeping tab); applies only when the list changed.
  let _live = false
  const startLiveRefresh = () => {
    if (_live || typeof window === 'undefined') return
    _live = true
    const scheduleNext = () => {
      const delay = Math.max(1000, nextRefreshAt(Date.now()) - Date.now())
      window.setTimeout(() => {
        refreshStargazerLogins().then(apply).catch(() => {})
        scheduleNext()
      }, delay)
    }
    scheduleNext()
  }

  return {
    islands: [],
    ready: false,
    ensureLoaded: () => {
      if (_started) return
      _started = true
      // Resolves immediately with cache-or-fetch; onFresh fires later if a
      // background revalidate finds new stargazers.
      loadStargazerLogins(apply)
        .then(apply)
        .catch(() => set({ ready: true }))
      startLiveRefresh() // then keep it fresh every 5 min
    },
  }
})
