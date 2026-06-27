import { useProgress } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useLoadStatus } from '../../ui/intro/loadStatus'
import { REVEAL_DIST } from '../terrain/revealUniforms'
import { SPAWN_X, SPAWN_Z } from './spawnConstants'
import { getHeight } from '../terrain/terrain'

// ---------------------------------------------------------------------------
// GPU WARM-UP — the cure for "the first time I look around it freezes".
//
// Three.js does almost everything lazily, the first time an object is actually
// DRAWN: compiles the material's shader program, uploads the geometry to a GPU
// buffer, uploads + decodes every texture, and compiles the depth-material the
// shadow pass uses. With frustum culling, "first drawn" = the instant a prop
// swings into view — so turning to look at the island pays all of it at once: a
// one-second stall. Preloading the file (useGLTF/OBJLoader) does NONE of that GPU
// work; only a render does. So once the scene is actually built we RENDER it
// ourselves — with frustum culling switched OFF so every mesh is drawn — into a
// tiny offscreen target, behind the loading screen where a stall is invisible.
//
// READINESS: we do NOT trust drei's useProgress to tell us when to start. Some of
// this project's assets load outside its LoadingManager, so it can sit at 0/0 and
// never fire — which used to make the warm-up run on an EMPTY scene and warm
// nothing. Instead we watch the scene graph: once it holds real meshes and has
// stopped growing, Experience has mounted everything and there's something to warm.
//
// Ordered state machine, one phase per frame, reported to the loading bar:
//   assets → compiling shaders → uploading textures → preparing scene → ready
// ---------------------------------------------------------------------------

type Phase = 'assets' | 'shaders' | 'textures' | 'preparing' | 'done'

type Warm = {
  phase: Phase
  frames: number
  lastCount: number
  stableFrames: number
  warmStart: number
  shaderFrames: number
  compiling: boolean
  texList: THREE.Texture[]
  texIdx: number
  pass: number
  cam: THREE.PerspectiveCamera | null
  rt: THREE.WebGLRenderTarget | null
  sun: THREE.DirectionalLight | null
}

// Hard cap on the GPU warm-up (NOT the wait-for-scene phase). If a driver quirk
// ever stalls a compile, we'd sooner reveal an under-warmed world than trap the
// player on the loading screen forever.
const WARM_TIMEOUT_MS = 12000
// Scene-readiness gate. Before Experience mounts, the scene is nearly empty; once
// it does, the mesh count jumps into the hundreds and then holds steady.
const MIN_MESHES = 24            // more than the bare intro → real content is in
const STABLE_FRAMES = 45         // mesh count unchanged this long → loading settled
const READY_TIMEOUT_FRAMES = 3600 // ~60s absolute safety so we never hang forever
const PREP_PASSES = 3            // full-scene warm renders (1 warms; the rest confirm)
const EYE = 1.7

const _dir = new THREE.Vector3()
const _saveSunPos = new THREE.Vector3()
const _saveSunTgt = new THREE.Vector3()

// DEV-only trace so the warm-up's timing/coverage is visible in the console.
const dlog = (...a: unknown[]) => { if (import.meta.env.DEV) console.info('[warmup]', ...a) }

// Caption for the asset phase, by file kind of the item drei is on (when it's
// tracking — otherwise we show a generic line, never "0/0").
function assetVerb(url: string): string {
  if (/\.(glb|gltf|obj|fbx)$/i.test(url)) return 'loading models'
  if (/\.(png|jpe?g|webp|ktx2?|basis|avif|gif)$/i.test(url)) return 'loading textures'
  if (/\.(mp3|ogg|wav|m4a|flac)$/i.test(url)) return 'loading audio'
  if (/\.(hdr|exr)$/i.test(url)) return 'loading skies'
  return 'gathering magic'
}

// Push status to the store, but only on a real change — so we don't re-render the
// loading overlay every single frame.
function push(phase: string, progress: number) {
  const ls = useLoadStatus.getState()
  if (ls.phase !== phase || Math.abs(ls.progress - progress) > 0.004) ls.set({ phase, progress })
}

function countMeshes(scene: THREE.Object3D): number {
  let n = 0
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n++
  })
  return n
}

// Collect every unique texture hanging off a built-in material (its slots — map,
// normalMap, … — are top-level properties) so we can upload them in slices.
// Covers Points/Sprites/Lines too, NOT just meshes: the falling-leaf clouds are
// THREE.Points and their leaf-atlas textures (a separate GPU copy from the
// foliage's) would otherwise decode + upload on their first draw — which happens
// as the reveal ring sweeps over them near the end of the fly-in, the exact
// "leaves change / half-second freeze at the end" the player saw.
function gatherTextures(scene: THREE.Object3D): THREE.Texture[] {
  const seen = new Set<THREE.Texture>()
  scene.traverse((o) => {
    const obj = o as THREE.Mesh & { isPoints?: boolean; isSprite?: boolean; isLine?: boolean }
    if (!(obj.isMesh || obj.isPoints || obj.isSprite || obj.isLine)) return
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
    for (const m of mats) {
      if (!m) continue
      for (const key in m) {
        const v = (m as unknown as Record<string, { isTexture?: boolean } | null>)[key]
        if (v && v.isTexture) seen.add(v as unknown as THREE.Texture)
      }
    }
  })
  return [...seen]
}

// The one shadow-casting directional light (the sun). DayNight keeps its shadow
// camera on the viewer — out over the water during the intro — so the island's
// casters are never in the shadow frustum at warm-up time. We borrow it and aim
// it at spawn so the shadow map draws them and compiles their depth shaders.
function findSun(scene: THREE.Object3D): THREE.DirectionalLight | null {
  let sun: THREE.DirectionalLight | null = null
  scene.traverse((o) => {
    const l = o as THREE.DirectionalLight
    if (l.isDirectionalLight && l.castShadow) sun = l
  })
  return sun
}

// Render the WHOLE scene once into the scratch target with frustum culling OFF,
// so every mesh — wherever it sits relative to the camera — is drawn and thus has
// its geometry uploaded, program compiled and textures bound. The sun's shadow is
// aimed at spawn for the pass so the island's casters compile their depth shaders.
// REVEAL_DIST is maxed so the reveal-ring shader doesn't `discard` before sampling.
function fullWarmRender(gl: THREE.WebGLRenderer, scene: THREE.Scene, w: Warm) {
  if (!w.cam || !w.rt) return
  const eyeY = Math.max(getHeight(SPAWN_X, SPAWN_Z), 0.15) + EYE
  w.cam.position.set(SPAWN_X, eyeY, SPAWN_Z)
  w.cam.quaternion.identity()
  w.cam.updateMatrixWorld(true)

  const unculled: THREE.Object3D[] = []
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && o.frustumCulled) {
      o.frustumCulled = false
      unculled.push(o)
    }
  })

  const sun = w.sun
  if (sun) {
    _saveSunPos.copy(sun.position)
    _saveSunTgt.copy(sun.target.position)
    _dir.copy(sun.position).sub(sun.target.position).normalize()
    sun.target.position.set(SPAWN_X, 0, SPAWN_Z)
    sun.position.copy(sun.target.position).addScaledVector(_dir, 160)
    sun.target.updateMatrixWorld(true)
    sun.updateMatrixWorld(true)
  }

  const savedDist = REVEAL_DIST.value
  REVEAL_DIST.value = 1e9
  const prevRT = gl.getRenderTarget()
  try {
    gl.setRenderTarget(w.rt)
    gl.render(scene, w.cam)
  } catch (e) {
    dlog('warm render failed', e)
  } finally {
    // Always restore — never leave culling disabled or the reveal maxed.
    gl.setRenderTarget(prevRT)
    REVEAL_DIST.value = savedDist
    if (sun) {
      sun.position.copy(_saveSunPos)
      sun.target.position.copy(_saveSunTgt)
      sun.target.updateMatrixWorld(true)
      sun.updateMatrixWorld(true)
    }
    for (const o of unculled) o.frustumCulled = true
  }
}

function disposeRig(w: Warm) {
  w.rt?.dispose()
  w.rt = null
  w.cam = null
}

export function Warmup() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  // drei's useProgress is read IMPERATIVELY (its .getState) for the caption only —
  // subscribing via the hook would re-render us when the LoadingManager notifies
  // mid-render of another component (Particles loads a texture during render),
  // which React warns about. We never use it for readiness (it can sit at 0/0).

  const w = useRef<Warm>({
    phase: 'assets',
    frames: 0,
    lastCount: -1,
    stableFrames: 0,
    warmStart: 0,
    shaderFrames: 0,
    compiling: false,
    texList: [],
    texIdx: 0,
    pass: 0,
    cam: null,
    rt: null,
    sun: null,
  })

  useEffect(() => () => disposeRig(w.current), [])

  useFrame(() => {
    const s = w.current

    // Safety net: never trap the player on the loading screen if a warm-up step
    // stalls (the scene-wait phase is exempt — it waits for content, as it must).
    if (s.phase !== 'assets' && s.phase !== 'done' && performance.now() - s.warmStart > WARM_TIMEOUT_MS) {
      disposeRig(s)
      dlog('TIMEOUT in', s.phase, '— forcing ready')
      s.phase = 'done'
      useLoadStatus.getState().set({ phase: 'ready', progress: 1, warmReady: true })
      return
    }

    // 1) ASSETS — wait until the scene graph is BUILT (real meshes, count steady).
    if (s.phase === 'assets') {
      s.frames++
      const count = countMeshes(scene)
      if (count !== s.lastCount) {
        s.lastCount = count
        s.stableFrames = 0
      } else {
        s.stableFrames++
      }

      // Caption + bar: show drei's real file counts when it's tracking, otherwise
      // a gentle time crawl so it never reads "0/0" or sits dead.
      const drei = useProgress.getState()
      const total = drei.total
      const dreiP = total > 0 ? drei.loaded / total : 0
      const crawl = 1 - Math.exp(-s.frames / 90)
      const cap = total > 0 ? `${assetVerb(drei.item || '')} ${drei.loaded}/${total}` : 'summoning the island'
      push(cap, 0.7 * Math.max(dreiP, crawl))
      if (s.frames % 60 === 0) dlog('waiting…', count, 'meshes, stable', s.stableFrames)

      if ((count >= MIN_MESHES && s.stableFrames >= STABLE_FRAMES) || s.frames > READY_TIMEOUT_FRAMES) {
        s.warmStart = performance.now()
        dlog('scene ready:', count, 'meshes after', s.frames, 'frames → warming')
        s.phase = 'shaders'
      }
      return
    }

    // 2) SHADERS — compile every material program in parallel (off the main thread
    //    where the GPU supports it; otherwise a one-time sync compile).
    if (s.phase === 'shaders') {
      push('compiling shaders', 0.74)
      s.shaderFrames++
      if (!s.compiling) {
        s.compiling = true
        const next = () => {
          s.texList = gatherTextures(scene)
          dlog('shaders compiled,', s.texList.length, 'textures to upload')
          s.phase = 'textures'
        }
        const r = gl as unknown as { compileAsync?: (sc: THREE.Object3D, c: THREE.Camera) => Promise<unknown> }
        if (r.compileAsync) r.compileAsync(scene, camera).then(next, next)
        else {
          gl.compile(scene, camera)
          next()
        }
      } else if (s.shaderFrames > 300) {
        s.texList = gatherTextures(scene)
        s.phase = 'textures'
      }
      return
    }

    // 3) TEXTURES — decode + upload to the GPU a handful per frame.
    if (s.phase === 'textures') {
      const list = s.texList
      for (let i = 0; i < 8 && s.texIdx < list.length; i++) {
        try { gl.initTexture(list[s.texIdx]) } catch (e) { dlog('initTexture failed', e) }
        s.texIdx++
      }
      push(`uploading textures ${s.texIdx}/${list.length}`, 0.8 + 0.1 * (s.texIdx / Math.max(1, list.length)))
      if (s.texIdx >= list.length) {
        s.cam = camera.clone() as THREE.PerspectiveCamera // inherits fov/aspect/near/far
        s.rt = new THREE.WebGLRenderTarget(64, 64, { depthBuffer: true })
        s.sun = findSun(scene)
        dlog('textures uploaded; sun', s.sun ? 'found' : 'MISSING', '→ warm renders')
        s.phase = 'preparing'
      }
      return
    }

    // 4) PREPARING — full-scene warm renders (culling off) realize geometry +
    //    shadow variants + everything else for every prop, up front.
    if (s.phase === 'preparing') {
      push('preparing scene', 0.9 + 0.1 * (s.pass / PREP_PASSES))
      fullWarmRender(gl, scene, s)
      s.pass++
      if (s.pass >= PREP_PASSES) {
        disposeRig(s)
        dlog('done in', Math.round(performance.now() - s.warmStart), 'ms')
        s.phase = 'done'
        useLoadStatus.getState().set({ phase: 'ready', progress: 1, warmReady: true })
      }
    }
  })

  return null
}
