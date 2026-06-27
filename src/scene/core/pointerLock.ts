// Bridges the Enter button (HTML, outside the Canvas) to the pointer-lock look
// controls (inside the Canvas). Pointer lock must be requested inside a user
// gesture, so the Player registers its lock fn here and callers invoke
// requestLock() from their handlers.
//
// The settings-menu controller (EscMenu) treats `menuOpen` as the source of truth
// and uses these helpers to make pointer lock simply follow it. The one browser
// quirk we work around: after the user exits lock with ESC there's a ~1.25s
// cooldown during which re-locking is rejected, and the browser can briefly
// grant-then-revoke the lock — `isAcquiring()` lets the controller ignore those
// bounces so the menu doesn't flicker.
import { IS_TOUCH } from '../../input/device'

let lockFn: (() => void) | null = null
let acquiring = false
let timer: ReturnType<typeof setTimeout> | null = null

export function setLockFn(fn: (() => void) | null) {
  lockFn = fn
}

// True while we're polling to (re)acquire the lock — see the note above.
export function isAcquiring() {
  return acquiring
}

// Stop any in-flight re-lock polling (e.g. the user reopened the menu mid-cooldown
// and we should leave the cursor free).
export function cancelLock() {
  acquiring = false
  if (timer != null) {
    clearTimeout(timer)
    timer = null
  }
}

export function requestLock() {
  // Touch devices have no pointer lock (and look is driven by drag instead), so
  // skip the whole acquire/poll dance — it would only fail 40× in a row.
  if (IS_TOUCH) return
  if (typeof document === 'undefined' || document.pointerLockElement) return
  cancelLock()
  acquiring = true
  let tries = 0
  const attempt = () => {
    timer = null
    if (!acquiring) return // cancelled (menu reopened) — leave the cursor be
    if (document.pointerLockElement) {
      acquiring = false
      return
    }
    try { lockFn?.() } catch { /* still on the post-ESC cooldown */ }
    // Poll tightly so we re-lock the instant the cooldown lifts (~1.25s), without
    // the cursor lingering longer than necessary.
    if (++tries < 40 && !document.pointerLockElement) {
      timer = setTimeout(attempt, 80)
    } else {
      acquiring = false
    }
  }
  attempt()
}

export function exitLock() {
  cancelLock()
  if (typeof document !== 'undefined' && document.pointerLockElement) document.exitPointerLock()
}
