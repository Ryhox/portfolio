import { createNoise2D } from 'simplex-noise'
import * as THREE from 'three'
import { clamp01, smoothstep } from './palette'
import { COUNT_MUL } from './config'
import {
  HEART,
  ISLAND_RADIUS,
  NOOK,
  PLAYER_SPAWN as SPAWN_HINT,
  TERRAIN_HALF,
  WATER_LEVEL,
  distToPath,
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

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export function getHeight(x: number, z: number): number {
  const r = Math.hypot(x, z)
  const coast = noise(x * 0.015, z * 0.015) * 9 // irregular coastline
  const edge = (r + coast) / ISLAND_RADIUS // ~0 centre, ~1 at shore

  const mask = 1 - smoothstep(0.46, 0.99, edge)

  // --- macro: the smooth, intentional shape ---
  let macro = mask * 3.2
  const dHill = Math.hypot(x - HEART.x, z - HEART.z)
  // Clamped Gaussian: plateau at the summit so the hilltop is a proper flat
  // chilling spot rather than a sharp peak. Cap kicks in within ~12 units of
  // center, giving a generous flat crown before the slope falls away.
  const hillGauss = Math.exp(-(dHill * dHill) / (2 * (HEART.r * 0.6) ** 2))
  const hillShape = Math.min(hillGauss * 1.5, 1.0)
  macro += hillShape * HEART.height * (0.45 + 0.55 * mask)
  macro -= smoothstep(0.9, 1.5, edge) * 18 // seabed

  // --- detail: rolling bumps, smoothed out in cleared areas ---
  const onPath = smoothstep(7.0, 3.0, distToPath(x, z))
  const dNook = Math.hypot(x - NOOK.x, z - NOOK.z)
  const inNook = smoothstep(NOOK.r, NOOK.r * 0.4, dNook)
  // Flat summit clearing — suppresses bumpy detail on the hilltop plateau
  const inHilltop = smoothstep(9.0, 4.0, dHill)
  const flatten = Math.max(onPath * 0.92, inNook * 0.88, inHilltop * 0.85)

  const detail = mask * fbm(x, z, 4, 0.015) * 4.0 * (1 - flatten)

  let h = macro + detail
  h -= onPath * 0.08
  return h
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

  // worn dirt trail — generously wide so the stepping stones always sit on bare
  // ground rather than appearing to float over the grass.
  const onPath = smoothstep(7.0, 3.0, distToPath(x, z)) * smoothstep(0.3, 1.6, h)
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
  } = o
  const rng = mulberry32(seed)
  const out: Placed[] = []
  let guard = 0
  const md2 = minDist * minDist
  const target = Math.max(1, Math.round(count * COUNT_MUL))
  while (out.length < target && guard < target * 60) {
    guard++
    const ang = rng() * Math.PI * 2
    const rad = innerR + Math.sqrt(rng()) * (r - innerR)
    const x = cx + Math.cos(ang) * rad
    const z = cz + Math.sin(ang) * rad
    const h = getHeight(x, z)
    const ny = getNormal(x, z).y
    if (!zones.includes(classifyZone(h, ny))) continue
    if (ny < maxSlope) continue
    if (awayFromPath > 0 && distToPath(x, z) < awayFromPath) continue
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
