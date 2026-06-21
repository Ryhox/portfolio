// Bridges the Enter button (HTML, outside the Canvas) to the PointerLockControls
// (inside the Canvas). Pointer lock must be requested synchronously inside the
// click gesture, so the Player registers its lock fn here and StartOverlay calls
// requestLock() directly in the handler.
let lockFn: (() => void) | null = null

export function setLockFn(fn: (() => void) | null) {
  lockFn = fn
}

export function requestLock() {
  // Browsers block requestPointerLock for ~1.25s after the user exits lock with
  // ESC (a hard security cooldown we can't skip). Poll on a tight interval so we
  // re-lock the very instant it's allowed again — otherwise closing the ESC menu
  // leaves the cursor on screen and mouse-look dead longer than necessary.
  let tries = 0
  const attempt = () => {
    if (document.pointerLockElement) return
    try { lockFn?.() } catch { /* still on cooldown */ }
    if (++tries < 30 && !document.pointerLockElement) setTimeout(attempt, 100)
  }
  attempt()
}
