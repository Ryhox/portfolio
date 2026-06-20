// Bridges the Enter button (HTML, outside the Canvas) to the PointerLockControls
// (inside the Canvas). Pointer lock must be requested synchronously inside the
// click gesture, so the Player registers its lock fn here and StartOverlay calls
// requestLock() directly in the handler.
let lockFn: (() => void) | null = null

export function setLockFn(fn: (() => void) | null) {
  lockFn = fn
}

export function requestLock() {
  try {
    lockFn?.()
  } catch {
    // Browser security: pointer lock can't be acquired immediately after exiting.
    // Retry once after a short delay to clear the cooldown period.
    setTimeout(() => {
      try { lockFn?.() } catch { /* ignore */ }
    }, 200)
  }
}
