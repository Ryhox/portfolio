import { PointerLockControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useWorld } from '../state/useWorld'
import { BOAT_STEP_H, BOAT_X, BOAT_Z } from './boatConfig'
import { buildColliders, buildSteps } from './placement'
import { setLockFn } from './pointerLock'
import { SHORE_LIMIT, getHeight } from './terrain'

const EYE = 1.7
const SPEED = 9
const SPRINT = 1.9
const PLAYER_R = 0.45 // wanderer's body radius for prop collision

// First-person wanderer: pointer-lock look + WASD, glued to the ground via the
// shared getHeight, gently bobbing, and kept on the island at the shoreline.
export function Player() {
  const camera = useThree((s) => s.camera)
  const controls = useRef<any>(null)
  const keys = useRef<Record<string, boolean>>({})
  const bobT = useRef(0)
  const started = useWorld((s) => s.started)
  const colliders = useMemo(() => buildColliders(), [])
  const steps = useMemo(() => buildSteps(), [])

  const fwd = useRef(new THREE.Vector3())
  const right = useRef(new THREE.Vector3())
  const move = useRef(new THREE.Vector3())

  useEffect(() => {
    const dn = (e: KeyboardEvent) => (keys.current[e.code] = true)
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

  // Spawn on the boat deck; pre-apply the deck step height so there's no
  // single-frame drop before the ground-follow loop picks it up.
  useEffect(() => {
    if (!started) return
    const spawnY = Math.max(getHeight(BOAT_X, BOAT_Z), 0.15) + BOAT_STEP_H + EYE
    camera.position.set(BOAT_X, spawnY, BOAT_Z)
    camera.lookAt(0, 3, 0)   // look north toward the island
  }, [started, camera])

  useFrame((_, dtRaw) => {
    if (!useWorld.getState().started) return
    const dt = Math.min(dtRaw, 0.05)
    const k = keys.current
    const m = move.current.set(0, 0, 0)

    camera.getWorldDirection(fwd.current)
    fwd.current.y = 0
    fwd.current.normalize()
    right.current.crossVectors(fwd.current, camera.up).normalize()

    if (k['KeyW'] || k['ArrowUp']) m.add(fwd.current)
    if (k['KeyS'] || k['ArrowDown']) m.sub(fwd.current)
    if (k['KeyD'] || k['ArrowRight']) m.add(right.current)
    if (k['KeyA'] || k['ArrowLeft']) m.sub(right.current)

    const sprint = k['ShiftLeft'] || k['ShiftRight'] ? SPRINT : 1
    const moving = m.lengthSq() > 0
    if (moving) {
      m.normalize().multiplyScalar(SPEED * sprint * dt)
      camera.position.x += m.x
      camera.position.z += m.z
    }

    // Push out of solid props (trees, rocks, path stones). Two passes so being
    // wedged between two colliders resolves cleanly.
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
    }

    // Keep the wanderer on the isle — soft wall at the shoreline.
    const r = Math.hypot(camera.position.x, camera.position.z)
    if (r > SHORE_LIMIT) {
      const s = SHORE_LIMIT / r
      camera.position.x *= s
      camera.position.z *= s
    }

    // Stick to the ground with a gentle head-bob while walking. Low props (path
    // stones, shore pebbles) act as steps: rise over a higher one, then settle
    // back down once past it.
    if (moving) bobT.current += dt * 9 * sprint
    const bob = moving ? Math.sin(bobT.current) * 0.05 : 0
    let stepUp = 0
    for (const s of steps) {
      const dx = camera.position.x - s.x
      const dz = camera.position.z - s.z
      if (dx * dx + dz * dz < s.r * s.r && s.h > stepUp) stepUp = s.h
    }
    const groundY = getHeight(camera.position.x, camera.position.z) + stepUp + EYE + bob
    camera.position.y += (groundY - camera.position.y) * Math.min(1, dt * 12)
  })

  return <PointerLockControls ref={controls} makeDefault />
}
