import * as THREE from 'three'

// Procedural day-night model. Given time-of-day t (0..1) we derive the sun
// direction, then blend a small set of mood colors by "how high is the sun"
// (dayAmt) plus a warm "golden hour" term that peaks when the sun is near the
// horizon. This gives smooth dawn -> day -> dusk -> night transitions without
// hand-keying every phase.

const TWO_PI = Math.PI * 2

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

// --- mood colors ------------------------------------------------------------
const c = (hex: number) => new THREE.Color(hex)

const SKY_TOP_DAY = c(0x4a98dd)
const SKY_TOP_NIGHT = c(0x0a1030)
const SKY_BOT_DAY = c(0xdcf0f8)
const SKY_BOT_NIGHT = c(0x1b2247)
const GOLDEN = c(0xff8a44)

const FOG_DAY = c(0xe8ece2)
const FOG_NIGHT = c(0x121a36)

const SUN_DAY = c(0xfff4da)
const SUN_GOLD = c(0xff7a2e)
const MOON = c(0x9fb0ff)

const AMB_DAY = c(0xacc6dd)
const AMB_NIGHT = c(0x44558c)

const HEMI_SKY_DAY = c(0xbfe3f5)
const HEMI_SKY_NIGHT = c(0x33437a)
const HEMI_GROUND_DAY = c(0x7a8f4e)
const HEMI_GROUND_NIGHT = c(0x1c2230)

const WATER_DEEP_DAY = c(0x1b6f86)
const WATER_DEEP_NIGHT = c(0x081f33)
const WATER_SHAL_DAY = c(0x57c6c0)
const WATER_SHAL_NIGHT = c(0x143f4d)

// Direction the sunlight travels FROM (i.e. position of the sun, normalized).
export function sunDirection(t: number, out = new THREE.Vector3()) {
  const a = (t - 0.25) * TWO_PI
  return out.set(Math.cos(a), Math.sin(a), 0.38).normalize()
}
export function moonDirection(t: number, out = new THREE.Vector3()) {
  const a = (t - 0.25) * TWO_PI + Math.PI
  return out.set(Math.cos(a) * 0.9, Math.sin(a), -0.32).normalize()
}

export type SkySample = {
  sunDir: THREE.Vector3
  moonDir: THREE.Vector3
  sunColor: THREE.Color
  sunIntensity: number
  moonIntensity: number
  ambColor: THREE.Color
  ambIntensity: number
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  hemiIntensity: number
  fog: THREE.Color
  skyTop: THREE.Color
  skyBottom: THREE.Color
  waterDeep: THREE.Color
  waterShallow: THREE.Color
  dayAmt: number
  nightFactor: number
  golden: number
  starsOpacity: number
}

const mix = (a: THREE.Color, b: THREE.Color, t: number, out: THREE.Color) =>
  out.copy(a).lerp(b, t)

// Sample the full sky/lighting state for time t. Allocates a few small objects
// per call; called a handful of times per frame, which is negligible.
export function getSky(t: number): SkySample {
  const sunDir = sunDirection(t)
  const moonDir = moonDirection(t)
  const sunEl = sunDir.y // -1..1, sun elevation

  // Gentle, lingering twilight so dawn/dusk read clearly and nights stay
  // moonlit-readable rather than pitch black.
  const dayAmt = smoothstep(-0.15, 0.28, sunEl) // 0 night -> 1 day
  const nightFactor = 1 - dayAmt
  // Warm glow that blooms as the sun nears the horizon and lingers just after
  // it dips, then fades into night.
  const golden = Math.exp(-((sunEl - 0.05) ** 2) / (2 * 0.16 * 0.16)) * smoothstep(-0.3, -0.05, sunEl)
  const starsOpacity = smoothstep(-0.02, -0.24, sunEl)

  const skyTop = mix(SKY_TOP_NIGHT, SKY_TOP_DAY, dayAmt, new THREE.Color())
  const skyBottom = mix(SKY_BOT_NIGHT, SKY_BOT_DAY, dayAmt, new THREE.Color())
  skyBottom.lerp(GOLDEN, golden * 0.6)

  const fog = mix(FOG_NIGHT, FOG_DAY, dayAmt, new THREE.Color())
  fog.lerp(GOLDEN, golden * 0.45)

  const sunColor = mix(SUN_GOLD, SUN_DAY, smoothstep(0.05, 0.4, sunEl), new THREE.Color())
  // Strong key light — AgX tonemapping softly rolls off the highlights, so we can
  // push the sun hard for a bright, sunny "preview" mood without blowing out.
  const sunIntensity = smoothstep(-0.12, 0.16, sunEl) * 2.7

  const moonIntensity = smoothstep(0.04, -0.18, sunEl) * 0.5

  // Ambient + hemisphere are trimmed back versus a no-IBL setup: the procedural
  // sky environment map now provides most of the soft fill, so these just lift
  // the shadows a touch and keep the night readable.
  const ambColor = mix(AMB_NIGHT, AMB_DAY, dayAmt, new THREE.Color())
  ambColor.lerp(GOLDEN, golden * 0.35)
  const ambIntensity = 0.28 + dayAmt * 0.32

  const hemiSky = mix(HEMI_SKY_NIGHT, HEMI_SKY_DAY, dayAmt, new THREE.Color())
  const hemiGround = mix(HEMI_GROUND_NIGHT, HEMI_GROUND_DAY, dayAmt, new THREE.Color())
  const hemiIntensity = 0.34 + dayAmt * 0.4

  const waterDeep = mix(WATER_DEEP_NIGHT, WATER_DEEP_DAY, dayAmt, new THREE.Color())
  const waterShallow = mix(WATER_SHAL_NIGHT, WATER_SHAL_DAY, dayAmt, new THREE.Color())
  waterShallow.lerp(GOLDEN, golden * 0.3)

  return {
    sunDir,
    moonDir,
    sunColor,
    sunIntensity,
    moonIntensity,
    ambColor,
    ambIntensity,
    hemiSky,
    hemiGround,
    hemiIntensity,
    fog,
    skyTop,
    skyBottom,
    waterDeep,
    waterShallow,
    dayAmt,
    nightFactor,
    golden,
    starsOpacity,
  }
}
