import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useWorld } from '../state/useWorld'
import { smoothstep } from './palette'
import { buildColliders, buildSteps } from './placement'
import { setLockFn, requestLock } from './pointerLock'
import { WATER_LEVEL, getHeight } from './terrain'
import { waveHeight } from './oceanWave'
import { seabedHeight } from './seabedField'
import { SWIM } from './swimState'
import { addRipple } from './rippleField'
import { SEA_ROCKS } from './seaRocks'
import { WIND } from './loadNature'
import { REVEAL_DIST, WORLD_ALPHA } from './revealUniforms'
import {
  BOAT, BOAT_ACCEL, BOAT_DRAG, BOAT_MAX_SPEED, BOAT_REVERSE_SPEED,
  BOAT_SAIL_LIMIT, BOAT_TURN_RATE, BOARD_RANGE, NAV,
  boatColliders, disembarkSpot, floatPose, headingDir, launchBoat,
  parkedPose, seatWorld, strandBoat,
} from './boatState'
import { archColliders, archSteps, archipelagoExtent, islandStats, nearestIsland, useArchipelago } from './archipelago/archipelago'
import { EHOLD, ENTERING, TELEPORT, enterArchipelago, isTransitioning, returnHome } from './mapTransition'

// Scratch objects reused each frame (no per-frame allocation).
const _seat = { x: 0, y: 0, z: 0 }
const _scratch = { x: 0, y: 0, z: 0 }
const DEBUG = { freeze: false } // dev-only: hold an external camera for screenshots

const EYE = 1.7 // eye height above ground when walking
const SWIM_EYE = 0.28 // eye height above the water surface when floating (sit low in the water)
const SPEED = 9
const SWIM_SPEED = 5.5
const SPRINT = 1.9
const PLAYER_R = 0.45 // wanderer's body radius for prop collision
const SWIM_LIMIT = 220 // soft boundary: a gentle current eases you back past this
const BUOY = 0.2 // gentle float back toward the surface when not swimming down
const HORIZON_R = 150 // sail past this radius on the home sea → cross to the archipelago
const ENTER_BAND = 16 // within this distance of an island's shore → raise its banner
const HOLD_SECS = 3 // hold E this long (s) in the archipelago to sail home
const NO_SEA_ROCKS: typeof SEA_ROCKS = [] // home-only sea-stacks; empty on the archipelago

// First-person wanderer: pointer-lock look + WASD. On land it's glued to the
// ground with a head-bob; walk off any shore and it smoothly transitions to
// floating on the swell. While swimming you move along your GAZE — look down and
// swim to dive, look up and swim to surface (no dive keys). Reads the shared
// oceanWave field so the float matches the visible waves.
// Mouse-look sensitivity (matches three's PointerLockControls default) and the
// pitch clamp just shy of straight up/down.
const LOOK_SENS = 0.002
const PITCH_LIMIT = Math.PI / 2 - 0.02

export function Player() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const keys = useRef<Record<string, boolean>>({})
  const bobT = useRef(0)
  const wadeAmt = useRef(0)
  const rippleClock = useRef(0)
  const eWasDown = useRef(false)
  const eHeld = useRef(0)
  const eConsumed = useRef(false)
  const enteringId = useRef(-1)
  const started = useWorld((s) => s.started)
  const menuOpen = useWorld((s) => s.menuOpen)
  const mapOpen = useWorld((s) => s.mapOpen)
  const mapId = useWorld((s) => s.mapId)
  const islands = useArchipelago((s) => s.islands)
  const colliders = useMemo(
    () => (mapId === 'archipelago' ? archColliders(islands) : buildColliders()),
    [mapId, islands],
  )
  const steps = useMemo(
    () => (mapId === 'archipelago' ? archSteps(islands) : buildSteps()),
    [mapId, islands],
  )

  const look = useRef(new THREE.Vector3())
  const fwd = useRef(new THREE.Vector3())
  const right = useRef(new THREE.Vector3())
  const move = useRef(new THREE.Vector3())

  // Custom first-person look state (replaces drei PointerLockControls so we can
  // honour the Invert X / Invert Y toggles, which it has no option for).
  const yaw = useRef(0)
  const pitch = useRef(0)
  const euler = useMemo(() => new THREE.Euler(0, 0, 0, 'YXZ'), [])

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      // Ignore movement input entirely while the settings sheet or world map is open.
      const ws = useWorld.getState()
      if (ws.menuOpen || ws.mapOpen) return
      keys.current[e.code] = true
      if (useWorld.getState().started && document.pointerLockElement !== gl.domElement) {
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
          requestLock()
        }
      }
    }
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false)
    window.addEventListener('keydown', dn)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', dn)
      window.removeEventListener('keyup', up)
    }
  }, [gl])

  // Pointer-lock look controller: requestLock() locks the canvas; mouse movement
  // (only while locked, playing, and the menu is closed) drives yaw/pitch with the
  // invert flags applied. A canvas click re-locks (e.g. after closing the menu).
  useEffect(() => {
    const canvas = gl.domElement
    setLockFn(() => {
      const r = canvas.requestPointerLock() as unknown as Promise<void> | undefined
      if (r && typeof r.catch === 'function') r.catch(() => {})
    })

    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== canvas) return
      const ws = useWorld.getState()
      if (!ws.started || ws.menuOpen || ws.mapOpen) return
      yaw.current   -= e.movementX * LOOK_SENS * (ws.invertX ? -1 : 1)
      pitch.current -= e.movementY * LOOK_SENS * (ws.invertY ? -1 : 1)
      pitch.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch.current))
      // While sailing, yaw.current is a look OFFSET around the boat's heading —
      // useFrame composes the final orientation, so don't set the camera here.
      if (BOAT.mode === 'sailing') return
      euler.set(pitch.current, yaw.current, 0)
      camera.quaternion.setFromEuler(euler)
    }
    const onClick = () => {
      const ws = useWorld.getState()
      if (ws.started && !ws.menuOpen && !ws.mapOpen && document.pointerLockElement !== canvas) requestLock()
    }

    document.addEventListener('mousemove', onMove)
    canvas.addEventListener('click', onClick)
    return () => {
      setLockFn(null)
      document.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('click', onClick)
    }
  }, [gl, camera, euler])

  // Drop any held keys when the sheet or world map opens so the camera doesn't keep gliding.
  useEffect(() => {
    if (menuOpen || mapOpen) keys.current = {}
  }, [menuOpen, mapOpen])

  // Cursor follows the *real* lock state, not the menu state: it stays visible
  // through the browser's ~1.25s re-lock cooldown after ESC (so you always have a
  // working cursor to click and resume) and only hides once we're actually locked.
  useEffect(() => {
    const sync = () => {
      document.body.style.cursor = document.pointerLockElement === gl.domElement ? 'none' : ''
    }
    document.addEventListener('pointerlockchange', sync)
    sync()
    return () => {
      document.removeEventListener('pointerlockchange', sync)
      document.body.style.cursor = ''
    }
  }, [gl])

  // Spawn on the south beach looking north toward the hill.
  useEffect(() => {
    if (!started) return
    const spawnX = 2
    const spawnZ = 54
    const spawnY = Math.max(getHeight(spawnX, spawnZ), 0.15) + EYE
    camera.position.set(spawnX, spawnY, spawnZ)
    camera.lookAt(0, 3, 0)
    // Seed the look controller's yaw/pitch from the spawn orientation so the first
    // mouse move continues smoothly instead of snapping.
    euler.setFromQuaternion(camera.quaternion)
    yaw.current = euler.y
    pitch.current = euler.x
    // Start with the boat stranded on the beach behind the spawn.
    useWorld.getState().setBoatMode('parked')
    useWorld.getState().setBoardPrompt(false)
    strandBoat()
  }, [started, camera, euler])

  // E is handled in useFrame now (a tap boards/disembarks; a 3s hold in the
  // archipelago sails you home) so we can tell a tap from a hold — see useFrame.

  // Dev-only: lets the screenshot harness frame / board the boat.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    ;(window as unknown as { __boat: unknown }).__boat = {
      face(dist = 7, h = 3) {
        DEBUG.freeze = true
        camera.position.set(
          BOAT.x + Math.sin(BOAT.heading + 0.7) * dist,
          h,
          BOAT.z + Math.cos(BOAT.heading + 0.7) * dist,
        )
        camera.lookAt(BOAT.x, BOAT.y + 1.1, BOAT.z)
        euler.setFromQuaternion(camera.quaternion)
        yaw.current = euler.y
        pitch.current = euler.x
      },
      board(p = -0.32) {
        DEBUG.freeze = false
        launchBoat()
        BOAT.mode = 'sailing'
        useWorld.getState().setBoatMode('sailing')
        yaw.current = 0
        pitch.current = p
      },
      reveal() {
        REVEAL_DIST.value = 99999
        WORLD_ALPHA.value = 1
        useWorld.getState().setWorldVisible(true)
      },
      // Float the boat out on the sea and row in place, camera external.
      extOars(thr = 1, trn = 0) {
        DEBUG.freeze = true
        BOAT.mode = 'parked'
        BOAT.x = 0
        BOAT.z = 96
        BOAT.heading = 0
        BOAT.throttle = thr
        BOAT.turn = trn
      },
    }
  }, [camera, euler])

  // Raise the "you are entering <island>" banner + luck card when you're within
  // ENTER_BAND of an island's shore. Called both while sailing (boat position)
  // and on foot (camera position), so the text updates either way.
  const updateEntering = (x: number, z: number) => {
    const ni = nearestIsland(x, z)
    if (ni && ni.edgeDist < ENTER_BAND) {
      if (enteringId.current !== ni.isl.id) {
        enteringId.current = ni.isl.id
        ENTERING.name = ni.isl.name
        ENTERING.stats = islandStats(ni.isl)
        ENTERING.key++
      }
    } else if (enteringId.current !== -1) {
      enteringId.current = -1
      ENTERING.name = null
      ENTERING.stats = null
    }
  }

  useFrame((state, dtRaw) => {
    const ws = useWorld.getState()
    if (!ws.started || ws.menuOpen || ws.mapOpen) return // freeze while the menu/map is up
    const dt = Math.min(dtRaw, 0.05)
    const time = state.clock.elapsedTime

    if (DEBUG.freeze) { parkedPose(time); return } // dev: external camera holds

    // Apply a pending map-flip teleport (sets the camera-ref state we own here).
    if (TELEPORT.pending) {
      yaw.current = TELEPORT.yaw
      pitch.current = TELEPORT.pitch
      if (TELEPORT.setPos) {
        const ty = TELEPORT.ground ? Math.max(getHeight(TELEPORT.x, TELEPORT.z), WATER_LEVEL) + EYE : 0
        camera.position.set(TELEPORT.x, ty, TELEPORT.z)
        euler.set(pitch.current, yaw.current, 0)
        camera.quaternion.setFromEuler(euler)
        wadeAmt.current = 0
        bobT.current = 0
      }
      TELEPORT.pending = false
    }

    // E — a tap boards / disembarks; a 3s hold in the archipelago sails you home.
    // Acting on the RELEASE edge is what lets us tell a quick tap from a long hold.
    if (isTransitioning()) {
      eWasDown.current = false
      EHOLD.progress = 0
    } else {
      const eDown = !!keys.current['KeyE']
      if (eDown) {
        if (!eWasDown.current) {
          eHeld.current = 0
          eConsumed.current = false
        }
        eHeld.current += dt
        if (ws.mapId === 'archipelago') {
          EHOLD.progress = Math.min(1, eHeld.current / HOLD_SECS)
          if (eHeld.current >= HOLD_SECS && !eConsumed.current) {
            eConsumed.current = true
            EHOLD.progress = 0
            returnHome()
          }
        }
      } else {
        if (eWasDown.current && !eConsumed.current) {
          if (BOAT.mode === 'parked') {
            if (BOAT.near) {
              if (ws.mapId === 'home') {
                // Board on the home isle → open the world map to choose where to
                // sail; picking an island carries you across to it.
                keys.current = {}
                useArchipelago.getState().ensureLoaded()
                ws.setMapOpen(true)
              } else {
                // Island-hopping: local sailing between the isles.
                launchBoat()
                BOAT.mode = 'sailing'
                BOAT.speed = 0
                keys.current = {}
                yaw.current = 0
                pitch.current = -0.06
                ws.setBoatMode('sailing')
                ws.setBoardPrompt(false)
                BOAT.near = false
                NAV.sailing = true
              }
            }
          } else {
            // Disembark beside the boat — onto sand, or into the water to SWIM if
            // you're out at sea (seed the float so you never snap to the seabed).
            const d = disembarkSpot(_scratch)
            const gY = getHeight(d.x, d.z)
            let standY: number
            if (gY < -0.3) {
              standY = WATER_LEVEL + waveHeight(d.x, d.z, time) + SWIM_EYE
              wadeAmt.current = 1
            } else {
              standY = Math.max(gY, WATER_LEVEL) + EYE
              wadeAmt.current = 0
            }
            camera.position.set(d.x, standY, d.z)
            yaw.current = BOAT.heading + Math.PI + yaw.current
            pitch.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch.current))
            euler.set(pitch.current, yaw.current, 0)
            camera.quaternion.setFromEuler(euler)
            BOAT.mode = 'parked'
            BOAT.throttle = 0
            BOAT.turn = 0
            keys.current = {}
            ws.setBoatMode('parked')
            NAV.sailing = false
          }
        }
        EHOLD.progress = 0
        eConsumed.current = false
      }
      eWasDown.current = eDown
    }

    // ── BOAT: sailing the open sea (first-person, seated) ──────────────────
    if (BOAT.mode === 'sailing') {
      const bk = keys.current
      const thrIn = (bk['KeyW'] || bk['ArrowUp'] ? 1 : 0) - (bk['KeyS'] || bk['ArrowDown'] ? 1 : 0)
      const trnIn = (bk['KeyD'] || bk['ArrowRight'] ? 1 : 0) - (bk['KeyA'] || bk['ArrowLeft'] ? 1 : 0)
      // Smooth the inputs — these also drive the oar power/asymmetry.
      BOAT.throttle += (thrIn - BOAT.throttle) * Math.min(1, dt * 6)
      BOAT.turn += (trnIn - BOAT.turn) * Math.min(1, dt * 6)
      // Integrate speed with passive drag.
      BOAT.speed += thrIn * BOAT_ACCEL * dt
      BOAT.speed -= BOAT.speed * BOAT_DRAG * dt
      BOAT.speed = Math.max(-BOAT_REVERSE_SPEED, Math.min(BOAT_MAX_SPEED, BOAT.speed))
      if (thrIn === 0 && Math.abs(BOAT.speed) < 0.04) BOAT.speed = 0
      // Steering keeps some authority at a standstill so you can pivot in place.
      const auth = 0.45 + 0.55 * Math.min(1, Math.abs(BOAT.speed) / 4)
      BOAT.heading += trnIn * BOAT_TURN_RATE * auth * dt
      // Move, but never climb onto land — slide along the shoreline instead.
      const f = headingDir(BOAT.heading)
      const nx = BOAT.x + f.x * BOAT.speed * dt
      const nz = BOAT.z + f.z * BOAT.speed * dt
      let blocked = false
      if (getHeight(nx, BOAT.z) < -0.6) BOAT.x = nx
      else blocked = true
      if (getHeight(BOAT.x, nz) < -0.6) BOAT.z = nz
      else blocked = true
      if (blocked) BOAT.speed *= 0.6
      // Gentle current easing you back inside the sailable area. On the home sea,
      // crossing the horizon instead carries you off to the archipelago.
      const rr = Math.hypot(BOAT.x, BOAT.z)
      const sailLimit = ws.mapId === 'archipelago' ? archipelagoExtent() + 50 : BOAT_SAIL_LIMIT
      if (rr > sailLimit) {
        const s = (sailLimit + (rr - sailLimit) * (1 - Math.min(1, dt * 0.8))) / rr
        BOAT.x *= s
        BOAT.z *= s
      }
      if (ws.mapId === 'home' && rr > HORIZON_R) enterArchipelago()
      // Float on the swell, with a touch of bow-lift from speed.
      floatPose(time)
      BOAT.pitch -= Math.min(0.14, Math.abs(BOAT.speed) * 0.008) * Math.sign(BOAT.speed)
      // Seat the camera; the mouse adds a free-look offset around the heading.
      seatWorld(_seat)
      camera.position.set(_seat.x, _seat.y, _seat.z)
      // Camera faces the bow: the camera's yaw=0 looks down -Z, the bow points
      // +Z, so add PI. yaw.current is the free-look offset on top.
      euler.set(pitch.current, BOAT.heading + Math.PI + yaw.current, 0)
      camera.quaternion.setFromEuler(euler)
      // No swimming while aboard; feed foliage + the minimap.
      SWIM.wadeAmt = 0
      SWIM.inWater = false
      SWIM.underwater = false
      SWIM.depth = 0
      WIND.player.value.set(BOAT.x, BOAT.y, BOAT.z)
      NAV.px = BOAT.x
      NAV.pz = BOAT.z
      NAV.fx = f.x
      NAV.fz = f.z
      NAV.sailing = true
      // Near an island → raise the "entering X's Island" banner + luck card.
      if (ws.mapId === 'archipelago') updateEntering(BOAT.x, BOAT.z)
      return
    }
    // Keep the parked hull beached (or bobbing if you left it at sea).
    parkedPose(time)

    const k = keys.current
    const w = wadeAmt.current // wade/swim amount from last frame
    const swimming = w >= 0.5

    // Look basis: full 3D gaze (for swimming) + a horizontal forward (for walking).
    camera.getWorldDirection(look.current)
    fwd.current.copy(look.current)
    fwd.current.y = 0
    if (fwd.current.lengthSq() < 1e-6) fwd.current.set(0, 0, -1)
    fwd.current.normalize()
    right.current.crossVectors(fwd.current, camera.up).normalize()

    const forward = swimming ? look.current : fwd.current
    const m = move.current.set(0, 0, 0)
    if (k['KeyW'] || k['ArrowUp']) m.add(forward)
    if (k['KeyS'] || k['ArrowDown']) m.sub(forward)
    if (k['KeyD'] || k['ArrowRight']) m.add(right.current)
    if (k['KeyA'] || k['ArrowLeft']) m.sub(right.current)

    const sprint = k['ShiftLeft'] || k['ShiftRight'] ? SPRINT : 1
    const moving = m.lengthSq() > 0
    const speed = (SPEED * (1 - w) + SWIM_SPEED * w) * sprint
    if (moving) {
      m.normalize().multiplyScalar(speed * dt)
      camera.position.x += m.x
      camera.position.z += m.z
    }

    // Push out of solid props + the sea-stacks (two passes resolves wedging).
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colliders) {
        const dx = camera.position.x - c.x
        const dz = camera.position.z - c.z
        const rr = c.r + PLAYER_R
        const d2 = dx * dx + dz * dz
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2)
          const push = (rr - d) / d
          camera.position.x += dx * push
          camera.position.z += dz * push
        }
      }
      for (const rk of ws.mapId === 'home' ? SEA_ROCKS : NO_SEA_ROCKS) {
        const dx = camera.position.x - rk.x
        const dz = camera.position.z - rk.z
        const rr = rk.r + PLAYER_R
        const d2 = dx * dx + dz * dz
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2)
          const push = (rr - d) / d
          camera.position.x += dx * push
          camera.position.z += dz * push
        }
      }
      // The stranded boat is a solid hull you bump into (board it with E).
      for (const c of boatColliders()) {
        const dx = camera.position.x - c.x
        const dz = camera.position.z - c.z
        const rr = c.r + PLAYER_R
        const d2 = dx * dx + dz * dz
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2)
          const push = (rr - d) / d
          camera.position.x += dx * push
          camera.position.z += dz * push
        }
      }
    }

    // Soft swim boundary — a gentle current eases you back, no hard wall. On the
    // archipelago the playable area reaches the far clusters, so widen it to the
    // archipelago extent (mirrors the sailing limit); otherwise stepping ashore on
    // a distant island would drag you back toward the centre.
    const walkLimit = ws.mapId === 'archipelago' ? archipelagoExtent() + 50 : SWIM_LIMIT
    const r = Math.hypot(camera.position.x, camera.position.z)
    if (r > walkLimit) {
      const target = walkLimit + (r - walkLimit) * (1 - Math.min(1, dt * 0.8))
      const s = target / r
      camera.position.x *= s
      camera.position.z *= s
    }

    // --- swim blend: ground depth decides how much you're floating ---
    const groundY = getHeight(camera.position.x, camera.position.z)
    // the real floor you can stand/rest on is the HIGHER of the island terrain
    // and the seabed — so you can never dive below the visible seabed plane
    const floorY = Math.max(groundY, seabedHeight(camera.position.x, camera.position.z))
    const wadeTarget = smoothstep(0.4, -0.8, groundY) // 0 on dry land → 1 over deep water
    wadeAmt.current += (wadeTarget - wadeAmt.current) * Math.min(1, dt * 4)
    const ww = wadeAmt.current
    const inWater = wadeTarget > 0.05

    const surfaceY = WATER_LEVEL + waveHeight(camera.position.x, camera.position.z, time)
    const floatEyeY = surfaceY + SWIM_EYE

    if (ww >= 0.5) {
      // Swimming: vertical comes from the gaze (m.y), with gentle buoyancy so you
      // drift back to the surface when you stop, clamped to the seabed/surface.
      if (moving) camera.position.y += m.y
      camera.position.y += (floatEyeY - camera.position.y) * Math.min(1, dt * BUOY)
      camera.position.y = Math.min(camera.position.y, floatEyeY + 0.05)
      camera.position.y = Math.max(camera.position.y, floorY + 0.7) // stay above the seabed
    } else {
      // Walking / wading: ground-follow with a head-bob, blended toward the float.
      if (moving) bobT.current += dt * 9 * sprint
      const bob = moving ? Math.sin(bobT.current) * 0.05 : 0
      let stepUp = 0
      for (const s of steps) {
        const dx = camera.position.x - s.x
        const dz = camera.position.z - s.z
        if (dx * dx + dz * dz < s.r * s.r && s.h > stepUp) stepUp = s.h
      }
      const landY = groundY + stepUp + EYE + bob
      const targetY = landY * (1 - ww) + floatEyeY * ww
      const settle = 12 * (1 - ww) + 7 * ww
      camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * settle)
    }

    // Feed the player position to the foliage shader so grass/ferns bend away.
    WIND.player.value.copy(camera.position)

    // --- publish swim state ---
    SWIM.wadeAmt = ww
    SWIM.inWater = inWater
    SWIM.surfaceY = surfaceY
    // Depth is measured against the ACTUAL wavy surface at the player (not the
    // flat water level), so the underwater murk/fog tracks exactly when the eye
    // dips under a passing swell — no clear-water gap or fog-on-the-sky while
    // straddling the surface.
    SWIM.depth = Math.max(0, surfaceY - camera.position.y)
    SWIM.underwater = camera.position.y < surfaceY - 0.1

    // Only shallow wading (footsteps near the shore) stirs the ripple field —
    // floating/swimming leaves no wake, so the surface stays calm around you.
    if (inWater && moving && ww < 0.5) {
      rippleClock.current += dt
      if (rippleClock.current > 0.06) {
        rippleClock.current = 0
        addRipple(camera.position.x, camera.position.z, 0.08, 2.2)
      }
    }

    // Parked boat: raise the board prompt when you're close; feed the minimap.
    const bdx = camera.position.x - BOAT.x
    const bdz = camera.position.z - BOAT.z
    const near = bdx * bdx + bdz * bdz < BOARD_RANGE * BOARD_RANGE
    if (near !== BOAT.near) {
      BOAT.near = near
      useWorld.getState().setBoardPrompt(near)
    }
    NAV.px = camera.position.x
    NAV.pz = camera.position.z
    NAV.fx = -Math.sin(yaw.current)
    NAV.fz = -Math.cos(yaw.current)
    NAV.sailing = false

    // On foot in the archipelago, keep the entering banner + luck card current.
    if (ws.mapId === 'archipelago') updateEntering(camera.position.x, camera.position.z)
  })

  return null
}
