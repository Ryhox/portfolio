// Shared height-field rasteriser for the minimap + the full world map. Samples a
// height field across world [-rWorld, rWorld] and paints sea → land into an
// offscreen canvas. Flat cozy colours — no glow/blur/gradient.

const C_DEEP = [33, 67, 80]
const C_SEA = [50, 104, 119]
const C_SHALLOW = [96, 156, 165]
const C_SAND = [219, 201, 156]
const C_GRASS_LO = [74, 130, 52]
const C_GRASS_HI = [112, 176, 74]

export function lerp3(a: number[], b: number[], t: number) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export function hexToRgb(hex: number): number[] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]
}

// Sea + waterline ramp (h < 0.4) — the same for every island.
export function seaRamp(h: number): number[] {
  if (h < -3) return C_DEEP
  if (h < -0.4) return lerp3(C_DEEP, C_SEA, (h + 3) / 2.6)
  return lerp3(C_SEA, C_SHALLOW, (h + 0.4) / 0.8)
}

// Beach + land ramp (h >= 0.4). Defaults to the home-island greens; pass a biome's
// sand / grass colours so the archipelago map paints each island's real palette
// (grey for Bleakshoal, white for Frostfell, sandy for the desert, …).
export function landRamp(
  h: number,
  sand = C_SAND,
  grassLo = C_GRASS_LO,
  grassHi = C_GRASS_HI,
): number[] {
  if (h < 1.1) return lerp3(C_SHALLOW, sand, (h - 0.4) / 0.7)
  return lerp3(grassLo, grassHi, Math.min(1, (h - 1.1) / 9))
}

function defaultColor(h: number): number[] {
  return h < 0.4 ? seaRamp(h) : landRamp(h)
}

export function buildMap(
  sample: (x: number, z: number) => number,
  rWorld: number,
  res = 320,
  colorAt?: (wx: number, wz: number, h: number) => number[],
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = res
  c.height = res
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(res, res)
  const d = img.data
  for (let j = 0; j < res; j++) {
    const wz = -rWorld + (j / (res - 1)) * 2 * rWorld
    for (let i = 0; i < res; i++) {
      const wx = -rWorld + (i / (res - 1)) * 2 * rWorld
      const h = sample(wx, wz)
      const col = colorAt ? colorAt(wx, wz, h) : defaultColor(h)
      const o = (j * res + i) * 4
      d[o] = col[0]
      d[o + 1] = col[1]
      d[o + 2] = col[2]
      d[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}
