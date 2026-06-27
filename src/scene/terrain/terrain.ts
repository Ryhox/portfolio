import { createNoise2D } from 'simplex-noise'
import * as THREE from 'three'
import { smoothstep } from '../core/palette'
import { COUNT_MUL } from '../core/config'
import {
  HEART,
  ISLAND_RADIUS,
  ISLET,
  NOOK,
  PLAYER_SPAWN as SPAWN_HINT,
  SOCIAL_ARC,
  TERRAIN_HALF,
  WATER_LEVEL,
  distToMainPath,
  distToPath,
  distToSocialPath,
  distToWestPath,
} from './layout'

export { ISLAND_RADIUS, WATER_LEVEL, TERRAIN_HALF, SHORE_LIMIT } from './layout'

// ---------------------------------------------------------------------------
// The ground. getHeight(x,z) is shaped to MATCH the authored layout: a central
// Heartwood hill, flattened clearings along the path and at the Witch's Nook,
// gentle rolling detail elsewhere, sinking to a seabed past the shore. Consumed
// by the island mesh, the prop placement, and the player's ground-follow.
// ---------------------------------------------------------------------------

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

const noise = createNoise2D(mulberry32(20240))

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
  return sum / norm // -1..1
}

// --- map dispatch -----------------------------------------------------------
// getHeight is the single ground field the whole sim samples: the island mesh,
// prop placement (sampleDisc), the player's walk/swim follow, the boat's sailing
// collision, parkedPose/launchBoat, and the minimap. It dispatches to the active
// map so a second world (the archipelago) transparently drives the same physics
// with no branching at the call sites. The archipelago registers its height fn at
// import (registerArchHeight) so terrain.ts never imports it — no circular dep.
export type MapId = 'home' | 'archipelago'
let ACTIVE_MAP: MapId = 'home'
export function setActiveMap(m: MapId) {
  ACTIVE_MAP = m
}
export function getActiveMap(): MapId {
  return ACTIVE_MAP
}
let _archHeight: ((x: number, z: number) => number) | null = null
export function registerArchHeight(fn: (x: number, z: number) => number) {
  _archHeight = fn
}

export function getHeight(x: number, z: number): number {
  if (ACTIVE_MAP === 'archipelago' && _archHeight) return _archHeight(x, z)
  return homeHeight(x, z)
}

function homeHeight(x: number, z: number): number {
  const r = Math.hypot(x, z)
  const coast = noise(x * 0.015, z * 0.015) * 9 // irregular coastline
  const edge = (r + coast) / ISLAND_RADIUS // ~0 centre, ~1 at shore

  const mask = 1 - smoothstep(0.46, 0.99, edge)

  // --- macro: the smooth, intentional shape ---
  let macro = mask * 3.2
  const dHill = Math.hypot(x - HEART.x, z - HEART.z)
  // Gaussian with a SMOOTH plateau cap. A hard Math.min(…, 1) leaves a sharp
  // crease where the flat crown meets the slope — that kink reads as a steep step
  // and makes the path's stepping stones float at the shoulder. smoothstep eases
  // into the plateau (derivative → 0 at the cap), so the crown rounds gently into
  // the hillside with no crease.
  const hillGauss = Math.exp(-(dHill * dHill) / (2 * (HEART.r * 0.82) ** 2))
  const hillShape = smoothstep(0, 1, hillGauss * 1.5)
  macro += hillShape * HEART.height * (0.45 + 0.55 * mask)
  macro -= smoothstep(0.9, 1.5, edge) * 26 // plunge below the seabed dunes so the open-water floor covers the island edge

  // --- detail: rolling bumps, smoothed out in cleared areas ---
  // distToPath covers every trail branch (climb, social fork, west spur), so each is
  // flattened + slightly recessed the same way and the stones lie flush on all of
  // them. Only the narrow path corridor is touched — the hill/island are untouched.
  const onPath = smoothstep(7.0, 3.0, distToPath(x, z))
  const dNook = Math.hypot(x - NOOK.x, z - NOOK.z)
  const inNook = smoothstep(NOOK.r, NOOK.r * 0.4, dNook)
  // Flat summit clearing — suppresses bumpy detail on the hilltop plateau
  const inHilltop = smoothstep(9.0, 4.0, dHill)
  const flatten = Math.max(onPath * 0.92, inNook * 0.88, inHilltop * 0.85)

  // Lowered amplitude (was 4.0) for a gentler, less bumpy island to walk.
  const detail = mask * fbm(x, z, 4, 0.015) * 2.4 * (1 - flatten)

  let h = macro + detail
  h -= onPath * 0.08

  // The west spur reads better as a gentle RAISED dirt trail than a recessed one on
  // the hill's shoulder — lift just that path corridor a touch (smoothly blended).
  h += smoothstep(3.6, 1.4, distToWestPath(x, z)) * 0.1

  // Flat dais beside the tree for the social pedestals: level the ground to the
  // height at the arc centre, blended out past flatR. Guarded against recursion
  // (the one-off centre sample skips this block).
  if (!_arcOff) {
    const dArc = Math.hypot(x - SOCIAL_ARC.x, z - SOCIAL_ARC.z)
    const arcBlend = smoothstep(SOCIAL_ARC.flatR + 2.5, SOCIAL_ARC.flatR, dArc)
    if (arcBlend > 0) h = h * (1 - arcBlend) + arcFlatHeight() * arcBlend
  }

  // The sakura islet behind the spawn — raise a small flat-topped island out of
  // the sea. Purely additive (Math.max), so it never lowers the main island: a
  // level crown within flatR, sloping down to below the waterline past r. The
  // outline is warped by low-frequency noise so it reads as a natural island.
  {
    const ix = x - ISLET.x
    const iz = z - ISLET.z
    const ang = Math.atan2(iz, ix)
    const wob = noise(Math.cos(ang) * 1.3 + 40, Math.sin(ang) * 1.3 - 20) * ISLET.wobble
    const dIslet = Math.hypot(ix, iz)
    const crownR = ISLET.flatR + wob * 0.5 // wobbled flat-crown radius
    const slopeLen = 18 // length of the ONE continuous side slope (beach → seabed)
    if (dIslet < crownR + slopeLen) {
      // A SINGLE smooth grade down the side — flat crown, easing into a shallow beach,
      // continuing on the same curve straight under the waterline and flattening onto
      // the seabed. smoothstep eases the slope at BOTH ends, so there is no shelf and
      // no kink where the beach meets the underwater part: the headland just melts into
      // the water. Additive (Math.max) — the neck and main shore (higher) are untouched.
      const fall = smoothstep(crownR, crownR + slopeLen, dIslet)
      const sideH = ISLET.top + (WATER_LEVEL - 12 - ISLET.top) * fall
      if (sideH > h) h = sideH
    }
  }

  // The spawn isthmus — UNITE the sakura headland with the main island. A BROAD,
  // short land neck fills the shallows between the south shore (~z56) and the islet,
  // so the two read as ONE island (no bridge, no channel). Purely additive (Math.max):
  // it only ever RAISES land in the southern shallows, so the hill and the existing
  // shores upstream are never reshaped. The neck tapers into the main shore (along)
  // and slopes to its own beaches on the east/west flanks (flank); its width + crown
  // are warped by noise so it reads as real land, not a flat causeway.
  {
    const nx = x - ISLET.x // neck runs north→south on the islet's x
    // Longitudinal envelope: reaches well INTO the main island (low z) so the plateau
    // ties into already-high ground with no saddle/dip, and hands off to the islet
    // crown (high z).
    const along = smoothstep(45, 50, z) * (1 - smoothstep(63, 69, z))
    if (along > 0.001) {
      const ang = Math.atan2(z - 58, nx)
      const wob = noise(Math.cos(ang) * 1.5 + 12, Math.sin(ang) * 1.5 + 7) * 2.6
      const halfW = 15 + wob // wide connection — a chunky headland, not a thin bridge
      const d = Math.abs(nx)
      if (d < halfW) {
        const flank = smoothstep(halfW, halfW * 0.4, d) // 1 along the spine → 0 at the beach
        const crown = ISLET.top + fbm(x, z, 3, 0.04) * 0.12 // SAME height as the headland — even
        // RAISE the ground toward the plateau by (flank*along) — never lower it, so the
        // higher inland island always wins and the connection becomes ONE level surface
        // flush with the island (no sandy dip, no step), while the flanks still slope to
        // their own beaches.
        const lift = flank * along
        const nh = h + (crown - h) * lift
        if (nh > h) h = nh
      }
    }
  }
  return h
}

// --- baked shore field ------------------------------------------------------
// The home coastline is carved by simplex noise, so the water shader can't rebuild
// it analytically the way the (sine-harmonic) archipelago isles do — a sine guess
// drifts off the real shore. Instead, bake a signed distance-to-shoreline field from
// homeHeight: the R channel holds the SEAWARD distance from the waterline (positive
// in the sea, negative on land), normalised to ±SHORE_FIELD_RANGE. The water shader
// samples it to lay a foam band that hugs the REAL coast. Built once, lazily.
export const SHORE_FIELD_HALF = 96 // world half-extent the field covers (centred on origin)
export const SHORE_FIELD_RANGE = 24 // metres of shore distance packed into the byte channel
let _shoreTex: THREE.DataTexture | null = null
export function homeShoreField(): THREE.DataTexture {
  if (_shoreTex) return _shoreTex
  const N = 320
  const span = SHORE_FIELD_HALF * 2
  const eps = 0.75
  const data = new Uint8Array(N * N * 4)
  for (let j = 0; j < N; j++) {
    const z = -SHORE_FIELD_HALF + ((j + 0.5) / N) * span
    for (let i = 0; i < N; i++) {
      const x = -SHORE_FIELD_HALF + ((i + 0.5) / N) * span
      const h = homeHeight(x, z)
      const gx = homeHeight(x + eps, z) - homeHeight(x - eps, z)
      const gz = homeHeight(x, z + eps) - homeHeight(x, z - eps)
      const grad = Math.hypot(gx, gz) / (2 * eps)
      // (waterLevel - height)/slope ≈ signed distance to the shoreline, + out at sea
      const dist = (WATER_LEVEL - h) / Math.max(grad, 1e-3)
      const v = Math.max(-1, Math.min(1, dist / SHORE_FIELD_RANGE))
      const o = (j * N + i) * 4
      data[o] = Math.round((v * 0.5 + 0.5) * 255)
      data[o + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat)
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.wrapS = THREE.ClampToEdgeWrapping
  tex.wrapT = THREE.ClampToEdgeWrapping
  tex.needsUpdate = true
  _shoreTex = tex
  return tex
}

// The level height of the social dais — matched to the LOCAL ground at the dais
// centre (out on the eastern shelf, ~1u below the tree crown) so the platform sits
// flush with the shelf instead of as a raised terrace. Sampled once with the
// flatten disabled, then reused so the platform is perfectly flat.
let _arcOff = false
let _arcH: number | null = null
function arcFlatHeight(): number {
  if (_arcH === null) {
    _arcOff = true
    _arcH = getHeight(SOCIAL_ARC.x, SOCIAL_ARC.z)
    _arcOff = false
  }
  return _arcH
}

const EPS = 0.6
const _n = new THREE.Vector3()
export function getNormal(x: number, z: number, out = _n): THREE.Vector3 {
  const hL = getHeight(x - EPS, z)
  const hR = getHeight(x + EPS, z)
  const hD = getHeight(x, z - EPS)
  const hU = getHeight(x, z + EPS)
  return out.set(hL - hR, 2 * EPS, hD - hU).normalize()
}

export type Zone = 'underwater' | 'sand' | 'grass' | 'rock'

export function classifyZone(h: number, normalY: number): Zone {
  if (h < -0.4) return 'underwater'
  if (h < 0.9) return 'sand'
  if (normalY < 0.72) return 'rock'
  return 'grass'
}

// --- vertex coloring --------------------------------------------------------
// Everything is blended continuously (no hard zone switch) so there is no
// blocky banding at the grass/sand/rock boundaries.
// Deep, saturated turf greens. The ground is coloured to read as a lush green
// carpet that matches the grass blades, so the gaps between sparse blade clumps
// look like more grass rather than bald patches of bare earth (the trick the
// previews use). Low/base areas lean deep green — a shaded bed the brighter
// blades sit on — rising to a rich bright green on the sunlit higher ground.
const COL_GRASS_LOW = new THREE.Color(0x42822a)
const COL_GRASS_HI = new THREE.Color(0x6fb43e)
const COL_SAND = new THREE.Color(0xe9dca8)
const COL_SAND_WET = new THREE.Color(0xc3ad7c)
const COL_ROCK = new THREE.Color(0x80818a)
const COL_UNDER = new THREE.Color(0x46604f)
const COL_DIRT = new THREE.Color(0xa07f50)
const _col = new THREE.Color()
const _grass = new THREE.Color()
const _sand = new THREE.Color()
const _rock = new THREE.Color()

export function colorAt(x: number, h: number, z: number, normalY: number, out = _col): THREE.Color {
  const tint = (noise(x * 0.18, z * 0.18) + 1) * 0.5
  const tint2 = (noise(x * 0.6 + 50, z * 0.6) + 1) * 0.5

  // grass, varying lighter toward higher ground + micro mottling
  const up = smoothstep(0.7, 12.0, h)
  _grass.copy(COL_GRASS_LOW).lerp(COL_GRASS_HI, up * 0.65 + tint * 0.35)
  _grass.multiplyScalar(0.92 + tint2 * 0.16)
  out.copy(_grass)

  // sand blended over a soft band near the waterline
  const sandAmt = smoothstep(1.7, 0.35, h)
  const wet = smoothstep(0.35, -0.8, h)
  _sand.copy(COL_SAND).lerp(COL_SAND_WET, wet)
  out.lerp(_sand, sandAmt)

  // submerged ground
  out.lerp(COL_UNDER, smoothstep(-0.25, -2.4, h))

  // rock on steep faces (above the waterline)
  const rockAmt = smoothstep(0.76, 0.56, normalY) * smoothstep(-0.5, 0.8, h)
  _rock.copy(COL_ROCK).multiplyScalar(0.82 + tint * 0.32)
  out.lerp(_rock, rockAmt)

  // worn dirt trail — kept fairly narrow so it hugs the stepping stones instead of
  // washing wide swaths of grass to dirt on either side. The MAIN climb fans a touch
  // wider only at the front (the trailhead near the south beach, z≳34); the social
  // branch stays slim the whole way so it reads as the same kind of trail, not a
  // broad muddy clearing.
  const frontWiden = smoothstep(34, 50, z)
  const mainDirt = smoothstep(4.0 + frontWiden * 2.6, 1.6, distToMainPath(x, z))
  const socialDirt = smoothstep(2.6, 1.3, distToSocialPath(x, z))
  const westDirt = smoothstep(2.6, 1.3, distToWestPath(x, z))
  const onPath = Math.max(mainDirt, socialDirt, westDirt) * smoothstep(0.3, 1.6, h)
  out.lerp(COL_DIRT, onPath * 0.82)
  return out
}

// --- designed placement helper ---------------------------------------------
// Fill a disc-shaped region with natural jitter. placement.ts decides WHERE the
// discs are (the design); this just snaps points to the surface and rejects
// invalid spots, optionally enforcing spacing.
export type Placed = { x: number; y: number; z: number; rotY: number; scale: number }

export type DiscFill = {
  cx: number
  cz: number
  r: number
  count: number
  seed: number
  minScale?: number
  maxScale?: number
  zones?: Zone[]
  maxSlope?: number
  minDist?: number // min spacing between accepted points
  innerR?: number // keep a clear centre
  yOffset?: number
  awayFromPath?: number // reject if closer than this to the path
  avoid?: { x: number; z: number; r: number }[] // reject points inside these discs (e.g. clear ground around the pedestals)
  // Optional per-angle radius multiplier (mean ~1). Lets the fill follow a warped,
  // non-circular shore so points spread to the same edge fraction in every
  // direction instead of inside one inner circle. Defaults to a plain circle.
  radiusShape?: (ang: number) => number
}

export function sampleDisc(o: DiscFill): Placed[] {
  const {
    cx,
    cz,
    r,
    count,
    seed,
    minScale = 1,
    maxScale = 1,
    zones = ['grass'],
    maxSlope = 0.7,
    minDist = 0,
    innerR = 0,
    yOffset = 0,
    awayFromPath = 0,
    avoid,
    radiusShape,
  } = o
  const rng = mulberry32(seed)
  const out: Placed[] = []
  let guard = 0
  const md2 = minDist * minDist
  const target = Math.max(1, Math.round(count * COUNT_MUL))
  while (out.length < target && guard < target * 60) {
    guard++
    const ang = rng() * Math.PI * 2
    const rOuter = radiusShape ? r * radiusShape(ang) : r
    const rad = innerR + Math.sqrt(rng()) * (rOuter - innerR)
    const x = cx + Math.cos(ang) * rad
    const z = cz + Math.sin(ang) * rad
    const h = getHeight(x, z)
    const ny = getNormal(x, z).y
    if (!zones.includes(classifyZone(h, ny))) continue
    if (ny < maxSlope) continue
    if (awayFromPath > 0 && distToPath(x, z) < awayFromPath) continue
    if (avoid) {
      let inAvoid = false
      for (const a of avoid) {
        if ((x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r) {
          inAvoid = true
          break
        }
      }
      if (inAvoid) continue
    }
    if (md2 > 0) {
      let tooClose = false
      for (const p of out) {
        if ((p.x - x) ** 2 + (p.z - z) ** 2 < md2) {
          tooClose = true
          break
        }
      }
      if (tooClose) continue
    }
    out.push({ x, y: h + yOffset, z, rotY: rng() * Math.PI * 2, scale: minScale + rng() * (maxScale - minScale) })
  }
  return out
}

// Spawn on the south beach: walk outward along +z from the hill until the
// ground drops near the waterline, then step back slightly onto dry sand.
export const PLAYER_SPAWN = (() => {
  let z = 16
  while (z < TERRAIN_HALF && getHeight(SPAWN_HINT.x, z) > 1.0) z += 0.5
  z -= 3
  return { x: SPAWN_HINT.x, z, y: getHeight(SPAWN_HINT.x, z), look: SPAWN_HINT.lookAt }
})()
