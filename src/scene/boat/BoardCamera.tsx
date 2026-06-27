import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { useWorld } from '../../state/useWorld'
import { BOARD, BOARD_FOCUS } from './boardFocus'
import { exitLock, requestLock } from '../core/pointerLock'

// Glides the camera in to frame the projects message board while `projectsOpen` is
// set, then hands it back to the player exactly where it started on leave. The
// player is frozen (BOARD_FOCUS.active) for the whole animation so nothing fights
// for the camera, and the eased progress (BOARD_FOCUS.p) doubles as the board's
// wind-sway damper so the sign stills smoothly while you read.

const _m = new THREE.Matrix4()
const _up = new THREE.Vector3(0, 1, 0)

export function BoardCamera() {
  const camera = useThree((s) => s.camera)
  const p = useRef(0)
  const startPos = useRef(new THREE.Vector3())
  const startQuat = useRef(new THREE.Quaternion())
  const targetQuat = useRef(new THREE.Quaternion())
  const captured = useRef(false)
  const unlocked = useRef(false)

  useFrame((_, dtRaw) => {
    const open = useWorld.getState().projectsOpen
    const dt = Math.min(dtRaw, 0.05)

    if (open && !captured.current) {
      // Snapshot the live player pose: we frame FROM it and restore TO it.
      startPos.current.copy(camera.position)
      startQuat.current.copy(camera.quaternion)
      captured.current = true
      if (!unlocked.current) {
        exitLock() // free the cursor so the on-screen arrows are clickable
        unlocked.current = true
      }
    }

    const target = open && BOARD.ready ? 1 : 0
    const k = 1 - Math.exp(-7 * dt)
    p.current += (target - p.current) * k
    if (target === 1 && p.current > 0.999) p.current = 1
    if (target === 0 && p.current < 0.001) p.current = 0
    BOARD_FOCUS.p = p.current

    if (p.current > 0.001) {
      BOARD_FOCUS.active = true
      _m.lookAt(BOARD.camPos, BOARD.center, _up)
      targetQuat.current.setFromRotationMatrix(_m)
      const e = p.current * p.current * (3 - 2 * p.current) // smoothstep ease
      camera.position.lerpVectors(startPos.current, BOARD.camPos, e)
      camera.quaternion.slerpQuaternions(startQuat.current, targetQuat.current, e)
    } else if (BOARD_FOCUS.active) {
      // Settled back to free play — nail the camera to the snapshot so the player's
      // own yaw/pitch (untouched while frozen) line up with no snap, then release.
      camera.position.copy(startPos.current)
      camera.quaternion.copy(startQuat.current)
      BOARD_FOCUS.active = false
      captured.current = false
      if (unlocked.current) {
        requestLock() // re-grab the pointer so mouse-look resumes without a click
        unlocked.current = false
      }
    }
  })

  return null
}
