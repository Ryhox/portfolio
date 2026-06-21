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

const EYE = 1.7 // eye height above ground when walking
const SWIM_EYE = 0.5 // eye height above the water surface when floating
const SPEED = 9
const SWIM_SPEED = 5.5
const SPRINT = 1.9
const PLAYER_R = 0.45 // wanderer's body radius for prop collision
const SWIM_LIMIT = 220 // soft boundary: a gentle current eases you back past this
const BUOY = 0.2 // gentle float back toward the surface when not swimming down

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
  const started = useWorld((s) => s.started)
  const menuOpen = useWorld((s) => s.menuOpen)
  const colliders = useMemo(() => buildColliders(), [])
  const steps = useMemo(() => buildSteps(), [])

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
      // Ignore movement input entirely while the settings sheet is open.
      if (useWorld.getState().menuOpen) return
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
      if (!ws.started || ws.menuOpen) return
      yaw.current   -= e.movementX * LOOK_SENS * (ws.invertX ? -1 : 1)
      pitch.current -= e.movementY * LOOK_SENS * (ws.invertY ? -1 : 1)
      pitch.current = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, pitch.current))
      euler.set(pitch.current, yaw.current, 0)
      camera.quaternion.setFromEuler(euler)
    }
    const onClick = () => {
      const ws = useWorld.getState()
      if (ws.started && !ws.menuOpen && document.pointerLockElement !== canvas) requestLock()
    }

    document.addEventListener('mousemove', onMove)
    canvas.addEventListener('click', onClick)
    return () => {
      setLockFn(null)
      document.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('click', onClick)
    }
  }, [gl, camera, euler])

  // Drop any held keys when the sheet opens so the camera doesn't keep gliding.
  useEffect(() => {
    if (menuOpen) keys.current = {}
  }, [menuOpen])

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
  }, [started, camera, euler])

  useFrame((state, dtRaw) => {
    const ws = useWorld.getState()
    if (!ws.started || ws.menuOpen) return // freeze movement while the menu is up
    const dt = Math.min(dtRaw, 0.05)
    const time = state.clock.elapsedTime
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
      for (const rk of SEA_ROCKS) {
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
    }

    // Soft swim boundary — a gentle current eases you back, no hard wall.
    const r = Math.hypot(camera.position.x, camera.position.z)
    if (r > SWIM_LIMIT) {
      const target = SWIM_LIMIT + (r - SWIM_LIMIT) * (1 - Math.min(1, dt * 0.8))
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

    // Swimming stirs the ripple field.
    if (inWater && (moving || ww > 0.5)) {
      rippleClock.current += dt
      if (rippleClock.current > 0.06) {
        rippleClock.current = 0
        addRipple(camera.position.x, camera.position.z, moving ? 0.12 : 0.05, 2.2)
      }
    }
  })

  return null
}
