// Shared analog input written by the on-screen touch controls and read by the
// Player each frame. A mutable singleton (like BOAT / SWIM) so writing it never
// triggers a React re-render.
//
// Only ANALOG input lives here. Discrete actions (E / I / M / N / Esc) are fed
// through the existing keyboard handlers by dispatching synthetic KeyboardEvents
// from the touch buttons — that reuses every tap-vs-hold rule already in place.
export const INPUT = {
  // Joystick, components in -1..1. y>0 = forward, x>0 = strafe right.
  move: { x: 0, y: 0 },
  // Drag-to-look delta accumulated since the Player last consumed it (in the
  // same screen-pixel units as MouseEvent.movementX/Y so it shares LOOK_SENS).
  look: { dx: 0, dy: 0 },
}

// Press / release a key everywhere the game already listens, so touch buttons
// drive boarding, sitting, info, etc. with zero changes to game logic.
export function pressKey(code: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }))
}
export function releaseKey(code: string) {
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }))
}
// A quick tap (down then up next frame) for one-shot actions like Info / Mute.
export function tapKey(code: string) {
  pressKey(code)
  requestAnimationFrame(() => releaseKey(code))
}
