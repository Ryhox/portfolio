import { useFrame, useThree } from '@react-three/fiber'
import { Suspense } from 'react'
import { updateAmbience } from '../audio/useAmbience'
import { useWorld } from '../state/useWorld'
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
import { Campfire } from './Campfire'

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

// Slow showcase orbit shown behind the start screen. Releases control to the
// first-person player once the visitor enters.
function CinematicCamera() {
  const camera = useThree((s) => s.camera)
  useFrame((state) => {
    if (useWorld.getState().started) return
    const e = state.clock.elapsedTime
    // dev override lets the screenshot harness do close passes
    const o = (window as unknown as { __orbit?: { r: number; h: number; cy: number } }).__orbit
    const r = o?.r ?? 100
    const h = o?.h ?? 44
    const cy = o?.cy ?? 8
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
