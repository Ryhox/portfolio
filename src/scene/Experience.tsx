import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import * as THREE from 'three'
import { updateAmbience } from '../audio/useAmbience'
import { FLY, useWorld } from '../state/useWorld'
import { getHeight } from './terrain'
import { smoothstep } from './palette'
import { WIND } from './loadNature'
import { DayNight } from './DayNight'
import { LightShafts } from './LightShafts'
import { GlowProps } from './GlowProps'
import { Island } from './Island'
import { Particles } from './Particles'
import { Player } from './Player'
import { Postfx } from './Postfx'
import { NatureField } from './Scatter'
import { Water } from './Water'
import { Campfire, HilltopBenches } from './Campfire'

// Advances time-of-day. Kept out of React render — just mutates the store.
function TimeDriver() {
  const camera = useThree((s) => s.camera)
  useFrame((_, dt) => {
    const { paused, dayLengthSec, t } = useWorld.getState()
    if (!paused) useWorld.setState({ t: (t + Math.min(dt, 0.1) / dayLengthSec) % 1 })
    // crossfade ambience to match the time of day; waves swell up only near the shore
    const s = useWorld.getState()
    const r = Math.hypot(camera.position.x, camera.position.z)
    updateAmbience(s.t, s.muted, smoothstep(36, 62, r), WIND.strength.value)
  })
  return null
}

// Pre-computed spawn position — same formula as Player.tsx so camera lands exactly.
const EYE = 1.7
const SPAWN_X = 2
const SPAWN_Z = 54
const _spawnPos  = new THREE.Vector3(SPAWN_X, Math.max(getHeight(SPAWN_X, SPAWN_Z), 0.15) + EYE, SPAWN_Z)
const _lookOrbit = new THREE.Vector3(0, 8, 0)
const _lookSpawn = new THREE.Vector3(0, 3, 0)
const _lookTmp   = new THREE.Vector3()

// Showcase orbit before the player enters; fly-in once FLY.progress > 0.
function CinematicCamera() {
  const camera = useThree((s) => s.camera)
  const orbitStartRef = useRef<THREE.Vector3 | null>(null)

  useFrame((state) => {
    if (useWorld.getState().started) return

    const p = FLY.progress

    if (p > 0) {
      if (!orbitStartRef.current) {
        const sp = FLY.startPos
        orbitStartRef.current = sp
          ? new THREE.Vector3(sp.x, sp.y, sp.z)
          : camera.position.clone()
      }
      camera.position.lerpVectors(orbitStartRef.current, _spawnPos, p)
      _lookTmp.lerpVectors(_lookOrbit, _lookSpawn, p)
      camera.lookAt(_lookTmp)
      return
    }

    // Reset so we capture a fresh start position on the next fly-in (dev reloads).
    orbitStartRef.current = null

    const e = state.clock.elapsedTime
    const o = (window as unknown as { __orbit?: { r: number; h: number; cy: number } }).__orbit
    const r  = o?.r  ?? 100
    const h  = o?.h  ?? 44
    const cy = o?.cy ??   8
    camera.position.set(Math.cos(e * 0.05) * r, h + Math.sin(e * 0.035) * 5, Math.sin(e * 0.05) * r)
    camera.lookAt(0, cy, 0)
  })
  return null
}

export function Experience() {
  return (
    <>
      <TimeDriver />
      <CinematicCamera />
      <Player />
      <DayNight />
      <LightShafts />
      <Island />
      <Water />
      <Campfire />
      <HilltopBenches />
      <GlowProps />
      <Particles />
      {/* Props stream in without blocking the terrain/sky from showing. */}
      <Suspense fallback={null}>
        <NatureField />
      </Suspense>
      <Postfx />
    </>
  )
}
