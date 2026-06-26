import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { updateAmbience } from '../audio/useAmbience'
import { patchReveal } from './patchReveal'
import { FLY, useWorld } from '../state/useWorld'
import { INTRO_PARALLAX } from './introParallax'
import { IS_PHONE, IS_TOUCH } from '../input/device'
import { getHeight } from './terrain'
import { SPAWN_X, SPAWN_Z, SPAWN_LOOK, RING_X, RING_Z, RING_GROUND_Y } from './spawnConstants'
import { smoothstep } from './palette'
import { WIND } from './loadNature'
import { DayNight } from './DayNight'
import { LightShafts } from './LightShafts'
import { ArchLightShafts } from './ArchLightShafts'
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
import { MessageBoard } from './MessageBoard'
import { BoardCamera } from './BoardCamera'
import { Summit } from './SummitScene'
import { RowingBoat } from './RowingBoat'
import { BoatPrompt } from './BoatPrompt'
import { registerOccluder, unregisterOccluder } from './occluders'
import { ArchipelagoLand } from './archipelago/ArchipelagoLand'
import { HorizonGate } from './archipelago/HorizonGate'

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

// Patch one built-in material with the reveal ring effect; returns true if it was
// newly patched. ShaderMaterial/RawShaderMaterial are skipped — they don't use
// #include tokens and are patched manually.
function patchOne(m: THREE.Material | null | undefined): boolean {
  if (!m || (m as any).__revealPatched) return false
  if (m.type === 'ShaderMaterial' || m.type === 'RawShaderMaterial') return false
  patchReveal(m)
  return true
}

// Queue every not-yet-seen texture on a material for GPU upload. A texture is
// decoded + uploaded synchronously on its first DRAW, so a previously-culled
// textured prop freezes the frame the instant it swings into view — uploading
// ahead of time (a few per frame, below) moves that cost off the critical path.
// Built-in material texture slots (map, normalMap, …) are top-level properties.
function queueTextures(m: THREE.Material, seen: WeakSet<THREE.Texture>, queue: THREE.Texture[]) {
  for (const key in m) {
    const v = (m as any)[key]
    if (v && v.isTexture && !seen.has(v)) {
      seen.add(v)
      queue.push(v)
    }
  }
}

// How many queued textures to upload per frame during warm-up. Small, so the
// warm-up itself never hitches (texture uploads vary wildly in cost).
const TEX_PER_FRAME = 3

// Traverses the scene each sweep to do two jobs:
//
//  1. Auto-patch any unpatched built-in material with the reveal ring effect.
//
//  2. WARM UP shaders for freshly-arrived content. Three.js compiles a material's
//     GLSL lazily — the first frame it's actually rendered — and with frustum
//     culling that moment is "when you first turn to look at it" or "when a model
//     finishes streaming in". That synchronous compile is a main-thread stall: a
//     random stutter that gets worse the more models the scene has. So whenever
//     the mesh count grows we kick off gl.compileAsync (parallel shader compile,
//     off the main thread) to compile everything up front — during the idle/intro
//     screen for the home map, and behind the fade veil for the archipelago.
//     compiledCount tracks what the last compile covered, so once the scene
//     settles this stops firing.
//
// The full-scene traverse is the per-frame cost, so post-start we throttle: every
// 12th frame while content is still settling (the window where an unpatched
// material would pop through the ring, or a new model could hitch), backing off to
// every 60th once the scene is stable — nothing left to patch or warm. During the
// intro/reveal we sweep every frame so everything is patched and warmed before the
// reveal plays. REVEAL_DIST is maxed once started, so a late patch is invisible.
const PATCH_ACTIVE = 12
const PATCH_STABLE = 60
function RevealPatcher() {
  const { scene, gl, camera } = useThree()
  const frame = useRef(0)
  const interval = useRef(PATCH_ACTIVE)
  const compiledCount = useRef(-1)
  const compiling = useRef(false)
  const texQueue = useRef<THREE.Texture[]>([])
  const texSeen = useRef(new WeakSet<THREE.Texture>())
  useFrame(() => {
    // Drain a few queued texture uploads every frame (NOT gated by the sweep
    // throttle below) so a textured prop never decodes/uploads mid-draw.
    const q = texQueue.current
    for (let i = 0; i < TEX_PER_FRAME && q.length; i++) gl.initTexture(q.pop()!)

    if (useWorld.getState().started && ++frame.current % interval.current !== 0) return

    let meshCount = 0
    let patchedNew = false
    scene.traverse((obj) => {
      // Reveal-patching + the warm-up mesh count are mesh-only, but texture
      // pre-upload also covers Points/Sprites/Lines (the falling-leaf clouds are
      // THREE.Points): their textures otherwise upload on first draw and hitch.
      const o = obj as THREE.Mesh & { isPoints?: boolean; isSprite?: boolean; isLine?: boolean }
      const isMesh = obj instanceof THREE.Mesh
      if (!(isMesh || o.isPoints || o.isSprite || o.isLine)) return
      if (isMesh) meshCount++
      const mat = (obj as THREE.Mesh).material
      const mats = Array.isArray(mat) ? mat : [mat]
      for (const m of mats) {
        if (!m) continue
        if (isMesh && patchOne(m)) patchedNew = true
        queueTextures(m, texSeen.current, q)
      }
    })

    // New meshes since the last warm-up → compile their shaders before they're
    // ever drawn. Guarded so only one parallel compile is in flight at a time.
    if (meshCount !== compiledCount.current && !compiling.current) {
      compiling.current = true
      const covered = meshCount
      const done = () => {
        compiling.current = false
        compiledCount.current = covered
      }
      const r = gl as unknown as { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> }
      if (r.compileAsync) r.compileAsync(scene, camera).then(done, done)
      else {
        gl.compile(scene, camera)
        done()
      }
    }

    // Stay alert while anything is still streaming in / waiting to be warmed;
    // relax the sweep rate once the scene is fully patched and compiled.
    interval.current = patchedNew || meshCount !== compiledCount.current ? PATCH_ACTIVE : PATCH_STABLE
  })
  return null
}

// Live render-resolution control tied to the graphics quality setting. Lower
// quality renders at a lower pixel ratio (cheaper, softer); High uses the device
// ratio capped at 2 — matching the Canvas default.
function QualityDPR() {
  const setDpr  = useThree((s) => s.setDpr)
  const quality = useWorld((s) => s.quality)
  useEffect(() => {
    const cap = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 2
    let dpr = quality === 'Low' ? 1 : quality === 'Medium' ? 1.5 : cap
    if (IS_PHONE) dpr = Math.min(dpr, 1.25) // phones: keep the fill rate sane
    setDpr(dpr)
  }, [quality, setDpr])
  return null
}

// Registers its child group as a boat-marker occluder for the lifetime it's
// mounted, so BoatPrompt can raycast just these solid props (not the scene).
function Occluders({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    const g = ref.current
    if (!g) return
    registerOccluder(g)
    return () => unregisterOccluder(g)
  }, [])
  return <group ref={ref}>{children}</group>
}

// Pre-computed spawn position.
const EYE = 1.7

const _spawnPos = new THREE.Vector3(SPAWN_X, Math.max(getHeight(SPAWN_X, SPAWN_Z), 0.15) + EYE, SPAWN_Z)

// Idle camera: up high and tilted down over the water, so the cozy golden-hour
// sea fills the frame before the reveal.
const _idleCamPos  = new THREE.Vector3(SPAWN_X, _spawnPos.y + 7, SPAWN_Z + 6)
const _idleCamLook = new THREE.Vector3(0, -2, 22)

// Fly-in target look — the EXACT point Player will look at the instant control takes
// over (shared SPAWN_LOOK), so the hand-off is seamless: no sudden re-aim.
const _lookSpawn = new THREE.Vector3(SPAWN_LOOK.x, SPAWN_LOOK.y, SPAWN_LOOK.z)
const _lookTmp   = new THREE.Vector3()
// Last idle look target + a scratch vector, so the fly-in can glide the camera's
// orientation from wherever it ACTUALLY was at click → spawn (instead of snapping).
// Updated every idle frame to the real (parallax-offset) look so the glide starts
// from the live pose, not a stale default.
const _lastLook  = new THREE.Vector3(0, -2, 22)
const _lookCur   = new THREE.Vector3()

const _parallax = { x: 0, y: 0 }

// Window-level pointer (NDC). The intro DOM overlays sit on top of the canvas and
// swallow its pointer events, so r3f's state.pointer goes stale on the idle
// screen — this listener keeps the camera parallax responding to the mouse.
const _winPtr = { x: 0, y: 0 }
// Touch devices have no hovering pointer — a finger drag would otherwise swing the
// idle camera around. Skip the lean entirely there (the gentle auto-drift stays).
if (typeof window !== 'undefined' && !IS_TOUCH) {
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
      // Glide orientation with an extra ease-in-out (smoothstep of the already-eased
      // progress) so the camera rotates gently at BOTH ends — no whip at the start,
      // no snap as it settles into the spawn look.
      const lookT = p * p * (3 - 2 * p)
      _lookCur.lerpVectors(flyLookRef.current, _lookSpawn, lookT)
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
    _lastLook.copy(_lookTmp) // remember the LIVE look so a click→fly-in starts from here
  })
  return null
}

export function Experience() {
  const started = useWorld((s) => s.started)
  const mapId = useWorld((s) => s.mapId)
  return (
    <>
      <RevealPatcher />
      <QualityDPR />
      <TimeDriver />
      <CinematicCamera />
      <Player />
      <DayNight />
      {/* Sun shafts + drifting fireflies belong to the home island only — they'd
          otherwise hang over the archipelago's spawn (its origin sits where the
          home isle's effects live). */}
      {mapId === 'home' && <LightShafts />}
      {mapId === 'archipelago' && <ArchLightShafts />}
      {mapId === 'home' ? (
        <>
          <Island />
          <Campfire />
          <HilltopBenches />
          <GlowProps />
          <HorizonGate />
          <Suspense fallback={null}>
            <Summit />
          </Suspense>
          <Suspense fallback={null}>
            <MessageBoard />
          </Suspense>
          <BoardCamera />
          <Suspense fallback={null}>
            <Occluders>
              <NatureField />
            </Occluders>
          </Suspense>
        </>
      ) : (
        <ArchipelagoLand />
      )}
      <Seabed />
      <RippleSim />
      <Water />
      <Underwater />
      <OceanLife />
      <OceanHorizon />
      <RowingBoat />
      <BoatPrompt />
      {mapId === 'home' && <Particles />}
      <Postfx />
    </>
  )
}
