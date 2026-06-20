import * as THREE from 'three'

// ---------------------------------------------------------------------------
// Shared handle to the GPU ripple simulation (RippleSim.tsx fills it in).
// The water shader samples RIPPLE.texture for extra surface displacement and
// foam; anything that disturbs the water (cursor, swimming player, jumping fish)
// writes "splats" into the sim. Same mutable-singleton pattern as WIND / FLY /
// REVEAL_*. Kept in its own tiny module so the water material and the sim can
// both import it with no circular dependency.
// ---------------------------------------------------------------------------

// 1×1 placeholder so the sampler uniform is always bound to a valid texture
// (sampled only when uRippleOn > 0.5, which RippleSim sets once it's live).
const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1)
blank.needsUpdate = true

export const RIPPLE = {
  texture: blank as THREE.Texture,
  center: new THREE.Vector2(0, 0), // world XZ the field is centered on
  size: 240, // world units across the (square) field
  enabled: false, // false until the sim is running (and off in ?lite)
}

export const RIPPLE_BLANK = blank

// Pending splats: world XZ + strength, drained by RippleSim each frame.
export type Splat = { x: number; z: number; strength: number; radius: number }
const queue: Splat[] = []

// Disturb the water at world (x,z). strength>0 lifts, <0 dips. Called by the
// cursor raycast, the swimming player, fish splashes, etc.
export function addRipple(x: number, z: number, strength: number, radius = 2.2) {
  if (queue.length > 64) return // safety cap
  queue.push({ x, z, strength, radius })
}

export function drainRipples(): Splat[] {
  if (queue.length === 0) return queue
  return queue.splice(0, queue.length)
}
