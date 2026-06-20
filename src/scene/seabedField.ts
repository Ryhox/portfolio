import { createNoise2D } from 'simplex-noise'
import { smoothstep } from './palette'
import { getHeight } from './terrain'
import { TERRAIN_HALF } from './layout'

// ---------------------------------------------------------------------------
// The ocean floor height field — its own DETERMINISTIC seed, so the hills are
// the same every load (never re-randomized). Extends far past the island and is
// tucked safely beneath the island's own underwater terrain near the shore, so
// the floor reads as endless rolling dunes with no visible cut-off.
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

// Fixed seed → identical seabed on every load.
const snoise = createNoise2D(mulberry32(70732))

const SEABED_BASE = -12

export function seabedHeight(x: number, z: number): number {
  const big = snoise(x * 0.012, z * 0.012)
  const med = snoise(x * 0.032 + 11, z * 0.032 + 7) * 0.5
  const small = snoise(x * 0.08 + 40, z * 0.08 + 3) * 0.18
  const hills = SEABED_BASE + (big + med + small) * 4.5

  // Near/under the island, tuck the floor below the island's own terrain so the
  // two never poke through each other (mask = 1 within the island mesh, fading
  // out past it into the open-water dunes).
  const r = Math.hypot(x, z)
  const mask = smoothstep(TERRAIN_HALF + 46, TERRAIN_HALF, r)
  if (mask <= 0.001) return hills
  const tuck = getHeight(x, z) - 3
  return hills * (1 - mask) + Math.min(hills, tuck) * mask
}

// Half-size of the (square) seabed mesh — large enough that its edge always sits
// far beyond the dense underwater fog, so the floor feels unlimited.
export const SEABED_HALF = 320

export { mulberry32 }
