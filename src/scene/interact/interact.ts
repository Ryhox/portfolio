// ---------------------------------------------------------------------------
// A tiny world-interaction registry. Anything you can walk up to and press E on
// (the social pedestals, the Heartwood portrait) registers an entry with a world
// position, a range and an activate() callback. A single driver in Summit.tsx
// finds the nearest in-range entry each frame (→ ACTIVE.id, read by the bloom
// markers to know which one is "armed") and fires it on the E keypress.
// ---------------------------------------------------------------------------

export type InteractEntry = {
  id: string
  x: number
  y: number
  z: number
  range: number
  activate: () => void
}

const entries = new Map<string, InteractEntry>()

// The currently armed entry (nearest one in range), shared so markers can
// highlight themselves without re-rendering React.
export const ACTIVE = { id: null as string | null }

export function registerInteract(e: InteractEntry) {
  entries.set(e.id, e)
}

export function unregisterInteract(id: string) {
  entries.delete(id)
  if (ACTIVE.id === id) ACTIVE.id = null
}

// Arm the entry the player is both NEAR and LOOKING AT — at most one at a time.
// (cx,cz) is the camera position, (fx,fz) its normalized horizontal gaze. An
// entry qualifies if it's within range and inside a view cone; the most-centred
// one wins (distance breaks ties), so glancing between two picks just one.
const VIEW_COS = Math.cos((42 * Math.PI) / 180)
export function refreshNearest(cx: number, cz: number, fx: number, fz: number): string | null {
  let best: string | null = null
  let bestScore = -Infinity
  for (const e of entries.values()) {
    const dx = e.x - cx
    const dz = e.z - cz
    const d = Math.hypot(dx, dz)
    if (d > e.range || d < 1e-3) continue
    const dot = (dx / d) * fx + (dz / d) * fz // how centred it is in view
    if (dot < VIEW_COS) continue
    const score = dot - d * 0.03 // prefer centred, then near
    if (score > bestScore) {
      bestScore = score
      best = e.id
    }
  }
  ACTIVE.id = best
  return best
}

export function activateNearest() {
  if (!ACTIVE.id) return
  entries.get(ACTIVE.id)?.activate()
}
