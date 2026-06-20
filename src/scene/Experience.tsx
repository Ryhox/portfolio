import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useRef } from 'react'
import * as THREE from 'three'
import { updateAmbience } from '../audio/useAmbience'
import { patchReveal } from './patchReveal'
import { FLY, useWorld } from '../state/useWorld'
import { INTRO_PARALLAX } from './introParallax'
import { getHeight } from './terrain'
import { SPAWN_X, SPAWN_Z, RING_X, RING_Z, RING_GROUND_Y } from './spawnConstants'
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
import { RippleSim } from './RippleSim'
import { Underwater } from './Underwater'
import { OceanLife } from './OceanLife'
import { OceanHorizon } from './OceanHorizon'
import { Seabed } from './Seabed'
import { Campfire, HilltopBenches } from './Campfire'

// Advances time-of-day. Kept out of React render — just mutates the store.
function TimeDriver() {
  const camera = useThree((s) => s.camera)
  useFrame((_, dt) => {
    const { paused, dayLengthSec, t } = useWorld.getState()
    if (!paused) useWorld.setState({ t: (t + Math.min(dt, 0.1) / dayLengthSec) % 1 })
    const s = useWorld.getState()
    const r = Math.hypot(camera.position.x, camera.position.z)
    updateAmbience(s.t, s.muted, smoothstep(36, 62, r), WIND.strength.value)
  })
  return null
}

// Traverses the scene every frame and auto-patches any unpatched built-in material
// with the reveal ring effect. ShaderMaterial/RawShaderMaterial are skipped since
// they don't use #include tokens and need manual patching.
function RevealPatcher() {
  const { scene } = useThree()
  useFrame(() => {
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const m of mats) {
        if (!m || (m as any).__revealPatched) continue
        if (m.type === 'ShaderMaterial' || m.type === 'RawShaderMaterial') continue
        patchReveal(m)
      }
    })
  })
  return null
}

// Pre-computed spawn position.
const EYE = 1.7

const _spawnPos = new THREE.Vector3(SPAWN_X, Math.max(getHeight(SPAWN_X, SPAWN_Z), 0.15) + EYE, SPAWN_Z)

// Idle camera: up high and tilted down over the water, so the cozy golden-hour
// sea fills the frame before the reveal.
const _idleCamPos  = new THREE.Vector3(SPAWN_X, _spawnPos.y + 7, SPAWN_Z + 6)
const _idleCamLook = new THREE.Vector3(0, -2, 22)

// Fly-in target look (same direction — camera just moves forward into spawn)
const _lookSpawn = new THREE.Vector3(0, 3, 0)
const _lookTmp   = new THREE.Vector3()
// Last idle look target + a scratch vector, so the fly-in can glide the camera's
// orientation from wherever it was at click → spawn (instead of snapping).
const _lastLook  = new THREE.Vector3(0, -2, 22)
const _lookCur   = new THREE.Vector3()

const _parallax = { x: 0, y: 0 }

// Window-level pointer (NDC). The intro DOM overlays sit on top of the canvas and
// swallow its pointer events, so r3f's state.pointer goes stale on the idle
// screen — this listener keeps the camera parallax responding to the mouse.
const _winPtr = { x: 0, y: 0 }
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    _winPtr.x = (e.clientX / window.innerWidth) * 2 - 1
    _winPtr.y = -((e.clientY / window.innerHeight) * 2 - 1)
  })
}

function CinematicCamera() {
  const camera = useThree((s) => s.camera)
  const flyStartRef = useRef<THREE.Vector3 | null>(null)
  const flyLookRef  = useRef<THREE.Vector3 | null>(null)

  useFrame((state) => {
    if (useWorld.getState().started) return

    const p = FLY.progress

    // Fly-in: glide from wherever camera is (near spawn) into exact spawn
    if (p > 0) {
      // Capture BOTH the position and the look target at the instant of click, so
      // the whole transition is continuous from the idle/parallax pose.
      if (!flyStartRef.current) flyStartRef.current = camera.position.clone()
      if (!flyLookRef.current)  flyLookRef.current  = _lastLook.clone()
      _parallax.x *= 0.95
      _parallax.y *= 0.95
      INTRO_PARALLAX.x = _parallax.x / 3.5
      INTRO_PARALLAX.y = _parallax.y / 2.0
      camera.position.lerpVectors(flyStartRef.current, _spawnPos, p)
      _lookCur.lerpVectors(flyLookRef.current, _lookSpawn, p) // ease orientation, no snap
      camera.lookAt(_lookCur)
      return
    }

    flyStartRef.current = null
    flyLookRef.current = null

    // Idle (+ during reveal): gentle drift around spawn, looking toward island.
    // Layered parallax — the camera leans with the pointer while the look target
    // leans the other way, so the near water and the far horizon separate into
    // real depth as you move the mouse over the cozy golden-hour sea.
    const et = state.clock.elapsedTime
    _parallax.x += (_winPtr.x * 3.5 - _parallax.x) * 0.06
    _parallax.y += (_winPtr.y * 2.0 - _parallax.y) * 0.06
    // Share the normalized lean so the DOM intro title parallaxes with the camera
    INTRO_PARALLAX.x = _parallax.x / 3.5
    INTRO_PARALLAX.y = _parallax.y / 2.0

    camera.position.set(
      _idleCamPos.x + _parallax.x + Math.sin(et * 0.052) * 1.1,
      _idleCamPos.y + _parallax.y * 0.7 + Math.sin(et * 0.038 + 1.3) * 0.3,
      _idleCamPos.z +                     Math.cos(et * 0.044) * 0.9,
    )
    // look target leans the other way → strong parallax depth between the near
    // water and the far horizon as the mouse moves
    _lookTmp.set(_idleCamLook.x - _parallax.x * 0.7, _idleCamLook.y - _parallax.y * 0.4, _idleCamLook.z)
    camera.lookAt(_lookTmp)
  })
  return null
}

export function Experience() {
  const started = useWorld((s) => s.started)
  return (
    <>
      <RevealPatcher />
      <TimeDriver />
      <CinematicCamera />
      <Player />
      <DayNight />
      <LightShafts />
      <Island />
      <Seabed />
      <RippleSim />
      <Water />
      <Underwater />
      <OceanLife />
      <OceanHorizon />
      <Campfire />
      <HilltopBenches />
      <GlowProps />
      <Particles />
      <Suspense fallback={null}>
        <NatureField />
      </Suspense>
      <Postfx />
    </>
  )
}
