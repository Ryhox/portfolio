// ---------------------------------------------------------------------------
// MAP TRANSITION — the fade that carries you between the home isle and the
// archipelago, plus the small shared singletons the HUD overlays read each frame
// (the fade veil, the hold-E-to-return progress, and the "entering X's Island"
// banner). Kept off React state like NAV/SWIM so per-frame updates never
// re-render; GSAP animates the veil alpha.
// ---------------------------------------------------------------------------

import gsap from 'gsap'
import * as THREE from 'three'
import { useWorld } from '../state/useWorld'
import { tg } from '../i18n'
import { setActiveMap, getHeight } from './terrain'
import { SPAWN_X, SPAWN_Z, SPAWN_LOOK } from './spawnConstants'
import { BOAT, NAV, strandBoat } from './boatState'
import {
  ARCH_SPAWN,
  useArchipelago,
  type IslandInstance,
  type IslandStats,
} from './archipelago/archipelago'

// Full-screen fade veil (0 = clear, 1 = opaque). Read by MapTransition.tsx.
export const TRANSITION = { alpha: 0, label: '' }

// Hold-E-to-return progress 0..1. Read by HoldReturnIndicator.tsx; driven by Player.
export const EHOLD = { progress: 0 }

// "You are entering <name>'s Island" banner + the luck readout for that island.
// `key` bumps to retrigger the banner/card pop when you reach a new island.
export const ENTERING = {
  name: null as string | null,
  key: 0,
  stats: null as IslandStats | null,
}

// A one-shot camera teleport consumed by Player's useFrame after a map flip (so
// the camera ref state — yaw/pitch — is set from inside the component that owns it).
export const TELEPORT = {
  pending: false,
  setPos: false, // true → also move the camera (walking); false → leave to the seated cam
  ground: false, // true → snap Y to terrain height + eye
  x: 0,
  z: 0,
  yaw: 0,
  pitch: 0,
}

// Scratch used to derive the spawn-facing yaw/pitch for the return-home teleport.
const EYE_H = 1.7
const _eye = new THREE.Vector3()
const _tgt = new THREE.Vector3()
const _m = new THREE.Matrix4()
const _up = new THREE.Vector3(0, 1, 0)
const _euler = new THREE.Euler(0, 0, 0, 'YXZ')
let busy = false
export function isTransitioning(): boolean {
  return busy
}

function clearBanner() {
  ENTERING.name = null
  ENTERING.stats = null
}

// Drop the boat (with you seated in it, sailing) just off an island's
// centre-facing shore, bow pointing at the island. Shared by the world-map
// "travel here" actions. Arriving afloat — not on foot — means no swim/collision
// shove, the boat is right there, and the seated camera frames the island. The
// sailing branch's own detection raises the "entering" banner + luck card.
function placeAtIsland(isl: IslandInstance) {
  const len = Math.hypot(isl.cx, isl.cz) || 1
  const inX = -isl.cx / len // unit vector from the island toward the centre
  const inZ = -isl.cz / len
  const GAP = 10 // how far off the shore the boat sits
  BOAT.x = isl.cx + inX * (isl.radius + GAP)
  BOAT.z = isl.cz + inZ * (isl.radius + GAP)
  BOAT.heading = Math.atan2(-inX, -inZ) // bow faces the island centre
  BOAT.mode = 'sailing'
  BOAT.speed = 0
  BOAT.throttle = 0
  BOAT.turn = 0
  NAV.sailing = true
  NAV.px = BOAT.x
  NAV.pz = BOAT.z
  // Seat the camera in the boat (the sailing branch positions it each frame);
  // just reset the look so you face the island. setPos:false → no on-foot teleport.
  TELEPORT.pending = true
  TELEPORT.setPos = false
  TELEPORT.yaw = 0
  TELEPORT.pitch = -0.06
  useWorld.getState().setBoatMode('sailing')
  useWorld.getState().setBoardPrompt(false)
}

// Home isle → archipelago. With a target island you arrive ON it (chosen from
// the world map you open when you set sail); without one you arrive sailing at
// the archipelago centre.
export function enterArchipelago(target?: IslandInstance) {
  if (busy || useWorld.getState().mapId !== 'home') return
  busy = true
  clearBanner()
  // Build the islands during the fade-out so they're ready when we flip.
  useArchipelago.getState().ensureLoaded()

  TRANSITION.label = tg('transition.settingSail')
  const tl = gsap.timeline({
    onComplete: () => {
      busy = false
    },
  })
  tl.to(TRANSITION, { alpha: 1, duration: 0.5, ease: 'power2.in' })
  tl.add(() => {
    setActiveMap('archipelago')
    useWorld.getState().setMapId('archipelago')
    if (target) {
      placeAtIsland(target)
    } else {
      BOAT.x = ARCH_SPAWN.x
      BOAT.z = ARCH_SPAWN.z
      BOAT.heading = ARCH_SPAWN.heading
      BOAT.mode = 'sailing'
      BOAT.speed = 0
      BOAT.throttle = 0
      BOAT.turn = 0
      NAV.sailing = true
      NAV.px = BOAT.x
      NAV.pz = BOAT.z
      TELEPORT.pending = true
      TELEPORT.setPos = false
      TELEPORT.yaw = 0
      TELEPORT.pitch = -0.06
      useWorld.getState().setBoatMode('sailing')
      useWorld.getState().setBoardPrompt(false)
    }
  })
  tl.to(TRANSITION, { alpha: 0, duration: 0.7, ease: 'power2.out' }, '+=0.15')
}

// Archipelago → home isle. Triggered by holding E for 3s, or the hold indicator.
export function returnHome() {
  if (busy || useWorld.getState().mapId !== 'archipelago') return
  busy = true
  EHOLD.progress = 0
  clearBanner()

  TRANSITION.label = tg('transition.comingAshore')
  const tl = gsap.timeline({
    onComplete: () => {
      busy = false
    },
  })
  tl.to(TRANSITION, { alpha: 1, duration: 0.5, ease: 'power2.in' })
  tl.add(() => {
    setActiveMap('home')
    strandBoat() // the boat goes back to the south beach…
    BOAT.mode = 'parked'
    NAV.sailing = false
    // …but YOU land back at the original spawn pose (not beside the boat). Derive
    // the spawn-facing yaw/pitch the same way Player seeds it: look at SPAWN_LOOK.
    const sy = Math.max(getHeight(SPAWN_X, SPAWN_Z), 0.15) + EYE_H
    _eye.set(SPAWN_X, sy, SPAWN_Z)
    _tgt.set(SPAWN_LOOK.x, SPAWN_LOOK.y, SPAWN_LOOK.z)
    _m.lookAt(_eye, _tgt, _up)
    _euler.setFromRotationMatrix(_m)
    NAV.px = SPAWN_X
    NAV.pz = SPAWN_Z
    TELEPORT.pending = true
    TELEPORT.setPos = true
    TELEPORT.ground = true
    TELEPORT.x = SPAWN_X
    TELEPORT.z = SPAWN_Z
    TELEPORT.yaw = _euler.y
    TELEPORT.pitch = _euler.x
    useWorld.getState().setBoatMode('parked')
    useWorld.getState().setBoardPrompt(false)
    useWorld.getState().setMapId('home')
  })
  tl.to(TRANSITION, { alpha: 0, duration: 0.7, ease: 'power2.out' }, '+=0.15')
}

// Hop to an island while already in the archipelago.
export function teleportToIsland(isl: IslandInstance) {
  if (busy || useWorld.getState().mapId !== 'archipelago') return
  placeAtIsland(isl)
}

// World-map "travel here": from the home isle, sail across and arrive on the
// island; from the archipelago, hop straight to it.
export function goToIsland(isl: IslandInstance) {
  if (useWorld.getState().mapId === 'archipelago') teleportToIsland(isl)
  else enterArchipelago(isl)
}

// Dev convenience — drive the crossing from the screenshot harness.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { __arch: unknown }).__arch = {
    enter: enterArchipelago,
    home: returnHome,
    islands: () => useArchipelago.getState().islands,
    go: (i: number) => goToIsland(useArchipelago.getState().islands[i]),
  }
}
