import { PointerLockControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useWorld } from '../state/useWorld'
import { smoothstep } from './palette'
import { buildColliders, buildSteps } from './placement'
import { setLockFn } from './pointerLock'
import { WATER_LEVEL, getHeight } from './terrain'
import { waveHeight } from './oceanWave'
import { seabedHeight } from './seabedField'
import { SWIM } from './swimState'
import { addRipple } from './rippleField'
import { SEA_ROCKS } from './seaRocks'

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
export function Player() {
  const camera = useThree((s) => s.camera)
  const controls = useRef<any>(null)
  const keys = useRef<Record<string, boolean>>({})
  const bobT = useRef(0)
  const wadeAmt = useRef(0)
  const rippleClock = useRef(0)
  const started = useWorld((s) => s.started)
  const colliders = useMemo(() => buildColliders(), [])
  const steps = useMemo(() => buildSteps(), [])

  const look = useRef(new THREE.Vector3())
  const fwd = useRef(new THREE.Vector3())
  const right = useRef(new THREE.Vector3())
  const move = useRef(new THREE.Vector3())

  useEffect(() => {
    const dn = (e: KeyboardEvent) => {
      keys.current[e.code] = true
      if (useWorld.getState().started && !document.pointerLockElement) {
        if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
          controls.current?.lock?.()
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
  }, [])

  // Let the Enter button request pointer lock within its click gesture.
  useEffect(() => {
    setLockFn(() => controls.current?.lock?.())
    return () => setLockFn(null)
  }, [])

  // Spawn on the south beach looking north toward the hill.
  useEffect(() => {
    if (!started) return
    const spawnX = 2
    const spawnZ = 54
    const spawnY = Math.max(getHeight(spawnX, spawnZ), 0.15) + EYE
    camera.position.set(spawnX, spawnY, spawnZ)
    camera.lookAt(0, 3, 0)
  }, [started, camera])

  useFrame((state, dtRaw) => {
    if (!useWorld.getState().started) return
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

    // --- publish swim state ---
    SWIM.wadeAmt = ww
    SWIM.inWater = inWater
    SWIM.surfaceY = surfaceY
    SWIM.depth = Math.max(0, WATER_LEVEL - camera.position.y)
    SWIM.underwater = camera.position.y < WATER_LEVEL - 0.1

    // Swimming stirs the ripple field.
    if (inWater && (moving || ww > 0.5)) {
      rippleClock.current += dt
      if (rippleClock.current > 0.06) {
        rippleClock.current = 0
        addRipple(camera.position.x, camera.position.z, moving ? 0.12 : 0.05, 2.2)
      }
    }
  })

  return <PointerLockControls ref={controls} makeDefault selector="canvas" />
}
