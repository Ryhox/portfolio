// `?lite` URL flag: a lighter render path used by the headless screenshot
// harness (software WebGL can't handle full shadows + tens of thousands of
// instances). Has no effect on the normal, full-quality app.
export const LITE =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lite')

// Multiplier applied to scatter counts in lite mode.
export const COUNT_MUL = LITE ? 0.18 : 1
export const n = (count: number) => Math.max(1, Math.round(count * COUNT_MUL))
