import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useWorld } from '../../state/useWorld'
import { LITE } from '../core/config'
import { IS_TOUCH } from '../../input/device'

// Phones/tablets skip the interactive ripple physics entirely (a per-frame
// ping-pong GPU sim) — the stylized ocean waves stay, just no live ripples.
const SKIP_RIPPLES = LITE || IS_TOUCH
import { WATER_LEVEL } from '../terrain/layout'
import { RIPPLE, RIPPLE_BLANK, drainRipples } from './rippleField'
import { createRippleSimMaterial, MAX_SPLATS, SIM_RES } from './rippleSimMaterial'

// Drives the ping-pong ripple simulation each frame and publishes the result on
// the shared RIPPLE handle. Splats come from the hovering cursor (idle / when the
// pointer isn't locked) and from anything that calls addRipple() — the swimming
// player, jumping fish, driftwood. Skipped entirely in ?lite (the water just
// reads uRippleOn = 0).
export function RippleSim() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)

  const sim = useMemo(() => {
    if (SKIP_RIPPLES) return null
    const opts = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    }
    const a = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, opts)
    const b = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, opts)
    a.texture.colorSpace = THREE.NoColorSpace
    b.texture.colorSpace = THREE.NoColorSpace
    const mat = createRippleSimMaterial()
    const scene = new THREE.Scene()
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
    quad.frustumCulled = false
    scene.add(quad)
    return { a, b, mat, scene, cam, quad }
  }, [])

  const ray = useMemo(() => new THREE.Raycaster(), [])
  const plane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), -WATER_LEVEL), [])
  const hit = useMemo(() => new THREE.Vector3(), [])
  // Track the pointer via window events (computing NDC from the canvas rect) so
  // it works even while the intro DOM overlays sit on top of the canvas — r3f's
  // state.pointer only updates from events that reach the canvas itself.
  const ndc = useRef(new THREE.Vector2(-2, -2))
  const prevNdc = useRef(new THREE.Vector2(-2, -2))

  useEffect(() => {
    if (SKIP_RIPPLES) return
    const move = (e: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect()
      ndc.current.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [gl])

  useEffect(() => {
    return () => {
      RIPPLE.texture = RIPPLE_BLANK
      RIPPLE.enabled = false
      if (sim) {
        sim.a.dispose()
        sim.b.dispose()
        sim.mat.dispose()
        sim.quad.geometry.dispose()
      }
    }
  }, [sim])

  const read = useRef<THREE.WebGLRenderTarget | null>(null)
  const write = useRef<THREE.WebGLRenderTarget | null>(null)
  const inited = useRef(false)

  useFrame(() => {
    if (!sim) return
    if (!useWorld.getState().worldVisible) return

    if (!inited.current) {
      const cc = new THREE.Color()
      gl.getClearColor(cc)
      const ca = gl.getClearAlpha()
      gl.setClearColor(0x000000, 0)
      const prevRT = gl.getRenderTarget()
      gl.setRenderTarget(sim.a)
      gl.clear()
      gl.setRenderTarget(sim.b)
      gl.clear()
      gl.setRenderTarget(prevRT)
      gl.setClearColor(cc, ca)
      read.current = sim.a
      write.current = sim.b
      inited.current = true
    }

    // --- gather splats this frame ---
    const splats: THREE.Vector4[] = sim.mat.uniforms.uSplats.value
    const center = RIPPLE.center
    const size = RIPPLE.size
    let n = 0
    const pushSplat = (x: number, z: number, strength: number, radiusWorld: number) => {
      if (n >= MAX_SPLATS) return
      const ux = (x - center.x) / size + 0.5
      const uy = (z - center.y) / size + 0.5
      if (ux <= 0 || ux >= 1 || uy <= 0 || uy >= 1) return
      splats[n].set(ux, uy, strength, Math.max(radiusWorld / size, 0.004))
      n++
    }

    // cursor ripple — ONLY on the idle "click to start" screen, and only from
    // hovering (no click boost). Disabled once you're in the world, so a freed
    // cursor in the ESC menu never disturbs the water.
    if (!useWorld.getState().started) {
      const p = ndc.current
      if (p.x > -1.5) {
        ray.setFromCamera(p, camera)
        if (ray.ray.intersectPlane(plane, hit)) {
          const moved = Math.hypot(p.x - prevNdc.current.x, p.y - prevNdc.current.y)
          const str = 0.09 * (0.5 + Math.min(moved * 25, 1.3)) // hover-only
          pushSplat(hit.x, hit.z, str, 2.5)
        }
      }
      prevNdc.current.copy(p)
    }

    // external disturbances (swimming player, fish splashes, driftwood)
    for (const s of drainRipples()) pushSplat(s.x, s.z, s.strength, s.radius)

    sim.mat.uniforms.uSplatCount.value = n

    // --- step the sim into the write target ---
    sim.mat.uniforms.uPrev.value = read.current!.texture
    const prevRT = gl.getRenderTarget()
    const prevAuto = gl.autoClear
    gl.autoClear = false
    gl.setRenderTarget(write.current!)
    gl.render(sim.scene, sim.cam)
    gl.setRenderTarget(prevRT)
    gl.autoClear = prevAuto

    // swap + publish
    const tmp = read.current!
    read.current = write.current!
    write.current = tmp
    RIPPLE.texture = read.current!.texture
    RIPPLE.enabled = true
  })

  return null
}
