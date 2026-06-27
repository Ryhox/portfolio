// ---------------------------------------------------------------------------
// THE OCEAN SURFACE — single source of truth.
//
// One height field h(x,z,t) drives EVERYTHING that touches the sea: the water
// shader's vertex displacement, the player's float while swimming, the bob/tilt
// of driftwood and jumping fish, and (later) a boat. Because the GLSL string and
// the JS function are both generated from the same WAVES table, the visible
// waves and the physics always agree.
//
// Deliberately a *pure vertical* sum of directional sines (no Gerstner
// horizontal pinch) so "the height at world (x,z)" is unambiguous and cheap to
// sample on the CPU. A touch of crest-sharpening gives the rounded, swelly,
// stylized look without making it ambiguous.
// ---------------------------------------------------------------------------

export type Wave = {
  dx: number // direction (need not be normalized)
  dz: number
  freq: number // spatial frequency (1/wavelength-ish)
  speed: number // temporal phase speed
  amp: number // amplitude in world units
}

// Gentle, cozy swell: a couple of big slow rollers plus finer detail, aimed in
// varied (non-axis-aligned) directions so the sea never looks like a grid.
export const WAVES: Wave[] = [
  { dx: 1.0, dz: 0.2, freq: 0.07, speed: 0.55, amp: 0.36 },
  { dx: 0.3, dz: 1.0, freq: 0.1, speed: 0.48, amp: 0.26 },
  { dx: -0.7, dz: 0.6, freq: 0.14, speed: 0.7, amp: 0.16 },
  { dx: 0.9, dz: -0.5, freq: 0.2, speed: 0.85, amp: 0.1 },
  { dx: -0.4, dz: -0.9, freq: 0.3, speed: 1.05, amp: 0.06 },
]

// Crest sharpening exponent — folded into both GLSL and JS so they stay in sync.
// 1 = plain sine; >1 lifts the troughs and rounds the crests for a swelly read.
export const WAVE_SHARP = 1.35

// Normalized directions, precomputed once.
const DIRS = WAVES.map((w) => {
  const len = Math.hypot(w.dx, w.dz) || 1
  return { nx: w.dx / len, nz: w.dz / len, freq: w.freq, speed: w.speed, amp: w.amp }
})

// --- JS sampler (CPU) -------------------------------------------------------
// Matches oceanWave() in the GLSL below. Shape: each wave is a sine mapped to
// 0..1, sharpened, then recentred to roughly -amp..+amp.
export function waveHeight(x: number, z: number, t: number): number {
  let h = 0
  for (const d of DIRS) {
    const s = Math.sin((x * d.nx + z * d.nz) * d.freq + t * d.speed) * 0.5 + 0.5
    h += (Math.pow(s, WAVE_SHARP) - 0.5) * 2 * d.amp
  }
  return h
}

export type Vec3 = { x: number; y: number; z: number }

// Surface normal via finite differences — used to tilt floating props.
export function waveNormal(x: number, z: number, t: number, e = 0.5, out: Vec3 = { x: 0, y: 1, z: 0 }): Vec3 {
  const h = waveHeight(x, z, t)
  const hx = waveHeight(x + e, z, t)
  const hz = waveHeight(x, z + e, t)
  out.x = h - hx
  out.y = e
  out.z = h - hz
  const len = Math.hypot(out.x, out.y, out.z) || 1
  out.x /= len
  out.y /= len
  out.z /= len
  return out
}

// --- GLSL sampler (GPU) -----------------------------------------------------
// Generated from the same table so it can't drift from the JS above. Defines
// `float oceanWave(vec2 p, float t)` and `vec3 oceanNormal(vec2 p, float t, float e)`.
// Note p.xy maps to world (x, z).
const glf = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n))

const body = DIRS.map(
  (d) =>
    `  { float s = sin((p.x * ${glf(d.nx)} + p.y * ${glf(d.nz)}) * ${glf(d.freq)} + t * ${glf(
      d.speed,
    )}) * 0.5 + 0.5; h += (pow(s, ${glf(WAVE_SHARP)}) - 0.5) * 2.0 * ${glf(d.amp)}; }`,
).join('\n')

export const WAVE_GLSL = /* glsl */ `
  float oceanWave(vec2 p, float t) {
    float h = 0.0;
${body}
    return h;
  }
  vec3 oceanNormal(vec2 p, float t, float e) {
    float h  = oceanWave(p, t);
    float hx = oceanWave(p + vec2(e, 0.0), t);
    float hz = oceanWave(p + vec2(0.0, e), t);
    return normalize(vec3(h - hx, e, h - hz));
  }
`
