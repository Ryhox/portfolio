// Bridges the Enter button (HTML, outside the Canvas) to the PointerLockControls
// (inside the Canvas). Pointer lock must be requested synchronously inside the
// click gesture, so the Player registers its lock fn here and StartOverlay calls
// requestLock() directly in the handler.
let lockFn: (() => void) | null = null

export function setLockFn(fn: (() => void) | null) {
  lockFn = fn
}

export function requestLock() {
  lockFn?.()
}
