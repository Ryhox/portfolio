// ---------------------------------------------------------------------------
// THE BOAT — shared mutable state, in the spirit of SWIM / RIPPLE.
//
// One singleton describes the rowing boat's pose + drive state every frame.
// Player.tsx writes it (physics + board/disembark), RowingBoat.tsx renders the
// hull + oars from it, the minimap reads it, and the interact prompt reads the
// React mirror flags on useWorld. Keeping it off React state means the per-frame
// pose updates never trigger re-renders.
//
// RIG SPACE: the outer group sits at the waterline (rig y = 0 = the water/ground
// surface under the boat). +Z_local is the bow. Seat + oarlocks are measured in
// metres above that surface, so the numbers read intuitively.
// ---------------------------------------------------------------------------

import { BOAT_ROT_Y, BOAT_X, BOAT_Z } from './boatConfig'
import { WATER_LEVEL, getHeight } from './terrain'
import { waveHeight, waveNormal, type Vec3 } from './oceanWave'

// model wrapper offset: DX/DZ recentre the hull on the rig, DY sets the draft
// (rig y = 0 = waterline). MODEL_YAW turns the hull (native length along X) so
// its bow points +Z (travel) and the paddles land on the ±X gunwales. All tuned
// against screenshots.
export const BOAT_MODEL_DX = 0.105 // centres the hull on the rig (seat) left-right
export const BOAT_MODEL_DY = 0.02 // floor sits just above the waterline (no water through the hull)
export const BOAT_MODEL_DZ = -0.23 // centres the hull fore-aft
export const BOAT_MODEL_YAW = Math.PI / 2

// Seat (first-person eye) sits toward the stern looking forward over the bow.
// All metres above the waterline.
export const SEAT_X = 0
export const SEAT_Y = 1.4 // eye height above the waterline
export const SEAT_Z = -0.4 // a touch back from centre, looking forward over the bow

// --- drive feel -------------------------------------------------------------
export const BOAT_ACCEL = 8 // throttle accel (m/s^2)
export const BOAT_MAX_SPEED = 15 // forward top speed (m/s)
export const BOAT_REVERSE_SPEED = 5
export const BOAT_DRAG = 1.0 // passive deceleration toward 0
export const BOAT_TURN_RATE = 1.05 // yaw rate (rad/s) at cruising speed
export const BOAT_SAIL_LIMIT = 380 // soft current boundary while sailing

export const BOARD_RANGE = 4.6 // how close (m) you must be to board the parked boat

export type BoatMode = 'parked' | 'sailing'

export const BOAT = {
  mode: 'parked' as BoatMode,
  // pose
  x: BOAT_X,
  z: BOAT_Z,
  y: 0, // rig outer-group world Y (= waterline/ground under the boat)
  heading: BOAT_ROT_Y, // yaw radians; forward (bow) = (sin h, cos h)
  pitch: 0,
  roll: 0,
  // motion
  speed: 0, // signed forward speed along heading
  throttle: 0, // -1..1 smoothed input (W/S) — drives oar power
  turn: 0, // -1..1 smoothed input (A/D) — drives oar asymmetry
  // oar animation
  rowPhase: 0,
  // proximity
  near: false,
  // stranded look (a beached lean)
  strandedPitch: 0.05,
  strandedRoll: -0.07,
}

// Forward (bow) unit direction for a heading. A group rotated rotation-y=h maps
// its local +Z axis to world (sin h, cos h), so the bow points this way.
export function headingDir(h: number): { x: number; z: number } {
  return { x: Math.sin(h), z: Math.cos(h) }
}

// Reset the boat to its stranded pose on the south beach.
export function strandBoat() {
  BOAT.mode = 'parked'
  BOAT.x = BOAT_X
  BOAT.z = BOAT_Z
  BOAT.heading = BOAT_ROT_Y
  BOAT.speed = 0
  BOAT.throttle = 0
  BOAT.turn = 0
  BOAT.rowPhase = 0
  parkedPose(0)
}

// Sit the hull on the live wave surface, tilting to the swell.
const _n: Vec3 = { x: 0, y: 1, z: 0 }
export function floatPose(t: number) {
  BOAT.y = WATER_LEVEL + waveHeight(BOAT.x, BOAT.z, t)
  waveNormal(BOAT.x, BOAT.z, t, 0.6, _n)
  BOAT.pitch = Math.atan2(_n.z, _n.y) * 0.5
  BOAT.roll = -Math.atan2(_n.x, _n.y) * 0.5
}

// Parked: beached + leaning on sand near the shore, or bobbing if left at sea.
export function parkedPose(t: number) {
  const gY = getHeight(BOAT.x, BOAT.z)
  if (gY > -0.3) {
    BOAT.y = Math.max(gY, 0.15)
    BOAT.pitch = BOAT.strandedPitch
    BOAT.roll = BOAT.strandedRoll
  } else {
    floatPose(t)
  }
}

// Slide a beached boat out past the waterline and point it at open sea. If it's
// already afloat (re-boarding out on the water) it's left exactly where it is.
export function launchBoat() {
  if (getHeight(BOAT.x, BOAT.z) < -0.8) return
  const r = Math.hypot(BOAT.x, BOAT.z) || 1
  const dx = BOAT.x / r
  const dz = BOAT.z / r
  let x = BOAT.x
  let z = BOAT.z
  for (let i = 0; i < 80; i++) {
    x += dx * 2
    z += dz * 2
    if (getHeight(x, z) < -1.4) break
  }
  BOAT.x = x + dx * 3
  BOAT.z = z + dz * 3
  BOAT.heading = Math.atan2(dx, dz) // face straight out to sea
  BOAT.speed = 0
}

// World-space eye position for the seated camera (heading only — wave tilt is
// left out so the view stays steady).
export function seatWorld(out: Vec3): Vec3 {
  const sinH = Math.sin(BOAT.heading)
  const cosH = Math.cos(BOAT.heading)
  // local +X (starboard) under Ry = (cosH, 0, -sinH); local +Z (bow) = (sinH, 0, cosH)
  out.x = BOAT.x + cosH * SEAT_X + sinH * SEAT_Z
  out.z = BOAT.z - sinH * SEAT_X + cosH * SEAT_Z
  out.y = BOAT.y + SEAT_Y
  return out
}

// A point just off the port beam to step out onto when you disembark.
export function disembarkSpot(out: Vec3): Vec3 {
  const sinH = Math.sin(BOAT.heading)
  const cosH = Math.cos(BOAT.heading)
  // port = local -X direction = -(cosH, 0, -sinH)
  const d = 2.0
  out.x = BOAT.x - cosH * d
  out.z = BOAT.z + sinH * d
  out.y = BOAT.y
  return out
}

// Three solid discs along the hull axis — the parked boat blocks the walker so
// you can't stroll through it (you board with E instead). Recomputed from the
// live pose so it follows the boat wherever it's left beached.
export function boatColliders(): { x: number; z: number; r: number }[] {
  const f = headingDir(BOAT.heading)
  return [
    { x: BOAT.x + f.x * 1.3, z: BOAT.z + f.z * 1.3, r: 0.85 }, // bow
    { x: BOAT.x, z: BOAT.z, r: 1.05 }, // amidships
    { x: BOAT.x - f.x * 1.3, z: BOAT.z - f.z * 1.3, r: 0.85 }, // stern
  ]
}

// --- minimap feed (player + boat poses, off React state) --------------------
export const NAV = {
  px: BOAT_X,
  pz: BOAT_Z,
  fx: 0, // forward direction (world XZ) for the minimap heading arrow
  fz: -1,
  sailing: false,
}

// Beach it at module load so the first rendered frame already has a valid pose.
strandBoat()

// Dev convenience — inspect/drive from the screenshot harness.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { BOAT: typeof BOAT }).BOAT = BOAT
}
