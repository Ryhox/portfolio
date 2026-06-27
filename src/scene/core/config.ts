import { IS_TOUCH } from '../../input/device'

// `?lite` URL flag: a lighter render path used by the headless screenshot
// harness (software WebGL can't handle full shadows + tens of thousands of
// instances). Has no effect on the normal, full-quality app.
export const LITE =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('lite')

// Multiplier applied to scatter/particle counts. Lite mode is the harness; touch
// devices (phones/tablets) thin everything out so the GPU budget stays sane.
export const COUNT_MUL = LITE ? 0.18 : IS_TOUCH ? 0.6 : 1
export const n = (count: number) => Math.max(1, Math.round(count * COUNT_MUL))
