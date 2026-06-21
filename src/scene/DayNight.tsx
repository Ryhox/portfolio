import { Stars } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getSky } from './palette'
import { createSkyDomeMaterial } from './skyDomeMaterial'
import { RIM, WIND, windStrengthAt } from './loadNature'
import { useWorld } from '../state/useWorld'
import { WORLD_ALPHA } from './revealUniforms'
import { SWIM } from './swimState'

// Reused temp so the per-frame underwater fog blend allocates nothing.
const _fogTmp = new THREE.Color()
// Bright, happy tropical-water tint for the underwater murk + light (not gloomy gray).
const _AQUA = new THREE.Color(0x5fd4de)
// Warm golden-hour wash so the underwater murk picks up sunrise/sunset light
// instead of staying a clashing blue while everything above is orange.
const _GOLD = new THREE.Color(0xff8a44)

// All the sky & lighting. Reads time-of-day imperatively each frame and mutates
// lights / sky / fog / moon / environment directly (no React re-renders for the
// animation).
export function DayNight() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const sun = useRef<THREE.DirectionalLight>(null!)
  const moon = useRef<THREE.DirectionalLight>(null!)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const amb = useRef<THREE.AmbientLight>(null!)
  const domeRef = useRef<THREE.Mesh>(null!)
  const starsRef = useRef<THREE.Points>(null!)
  const moonMesh = useRef<THREE.Sprite>(null!)
  const sunMesh = useRef<THREE.Sprite>(null!)

  const domeMat = useMemo(() => createSkyDomeMaterial(), [])

  // Soft glowing sun disc (warm — recoloured each frame by the time-of-day sun
  // colour, so it goes yellow at noon → deep orange at golden hour).
  const sunTex = useMemo(() => {
    const S = 128
    const c = document.createElement('canvas')
    c.width = c.height = S
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(0, 'rgba(255,252,240,1)')
    g.addColorStop(0.22, 'rgba(255,240,180,1)')
    g.addColorStop(0.5, 'rgba(255,185,95,0.55)')
    g.addColorStop(1, 'rgba(255,150,60,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])

  // Pale moon disc with a few soft craters.
  const moonTex = useMemo(() => {
    const S = 128
    const c = document.createElement('canvas')
    c.width = c.height = S
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2)
    g.addColorStop(0, 'rgba(248,250,255,1)')
    g.addColorStop(0.6, 'rgba(228,234,252,1)')
    g.addColorStop(0.9, 'rgba(200,210,240,0.6)')
    g.addColorStop(1, 'rgba(200,210,240,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
    ctx.globalCompositeOperation = 'source-atop'
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2
      const r = Math.random() * S * 0.3
      const cx = S / 2 + Math.cos(a) * r
      const cy = S / 2 + Math.sin(a) * r
      const rad = 2 + Math.random() * 7
      const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad)
      cg.addColorStop(0, 'rgba(165,180,215,0.5)')
      cg.addColorStop(1, 'rgba(165,180,215,0)')
      ctx.fillStyle = cg
      ctx.beginPath()
      ctx.arc(cx, cy, rad, 0, Math.PI * 2)
      ctx.fill()
    }
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])

  // Procedural image-based lighting: a tiny scene holding a sky sphere (sharing
  // the dome material + uniforms) is captured into a PMREM environment map and
  // assigned to scene.environment, giving every PBR material soft, sky-coloured
  // bounce that follows the day/night cycle. Regenerated only when the time of
  // day shifts noticeably — never per frame.
  const pmrem = useMemo(() => new THREE.PMREMGenerator(gl), [gl])
  const envScene = useMemo(() => {
    const s = new THREE.Scene()
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), domeMat)
    sphere.frustumCulled = false
    s.add(sphere)
    return s
  }, [domeMat])
  const env = useRef({ rt: null as THREE.WebGLRenderTarget | null, lastT: -1, frame: 0 })

  // Atmospheric haze: starts just past the immediate foreground (so the grass
  // right in front stays crisp) and builds quickly through the mid-distance,
  // clearly melting the trees and the sea into the sky — the aerial perspective
  // from the previews, and the medium the sun shafts read against.
  const fog = useMemo(() => new THREE.Fog(0xe8ece2, 9, 120), [])
  useEffect(() => {
    scene.fog = fog
    return () => {
      if (scene.fog === fog) scene.fog = null
    }
  }, [scene, fog])

  // Share the sun billboard with the post-processing GodRays effect.
  useEffect(() => {
    useWorld.getState().setSunMesh(sunMesh.current)
    return () => useWorld.getState().setSunMesh(null)
  }, [])

  // Tear down the environment generator on unmount.
  useEffect(() => {
    const e = env.current
    return () => {
      if (e.rt) e.rt.dispose()
      pmrem.dispose()
      if (scene.environment) scene.environment = null
    }
  }, [pmrem, scene])

  useFrame((state, delta) => {
    const t = useWorld.getState().t
    const started = useWorld.getState().started
    const worldVisible = useWorld.getState().worldVisible
    const s = getSky(t)

    // Quick fade-in for sky/horizon/particles so they're "present" almost at once
    // (the water no longer fades — it's solid immediately — so keep everything else
    // close behind to avoid a horizon seam); reset on dev reload
    if (worldVisible) {
      WORLD_ALPHA.value = Math.min(WORLD_ALPHA.value + delta / 1.2, 1)
    } else {
      WORLD_ALPHA.value = 0
    }

    // Shadow camera always follows wherever the viewer is — no hard switch at game start.
    const fx = camera.position.x
    const fz = camera.position.z
    sun.current.position.copy(s.sunDir).multiplyScalar(160)
    sun.current.position.x += fx
    sun.current.position.z += fz
    sun.current.color.copy(s.sunColor)
    sun.current.intensity = s.sunIntensity
    sun.current.target.position.set(fx, 0, fz)
    sun.current.target.updateMatrixWorld()

    moon.current.position.copy(s.moonDir).multiplyScalar(140)
    moon.current.color.setHex(0x9fb0ff)
    moon.current.intensity = s.moonIntensity

    hemi.current.color.copy(s.hemiSky)
    hemi.current.groundColor.copy(s.hemiGround)
    hemi.current.intensity = s.hemiIntensity

    amb.current.color.copy(s.ambColor)
    amb.current.intensity = s.ambIntensity

    // Underwater: smoothly swap the airy haze for a dense blue-green murk as the
    // eye dips below the surface. Depth is now measured against the real wavy
    // surface (see Player.tsx), so this ramp lines up with what you actually see
    // crossing the waterline — a quick but smooth 0→1 over the first ~0.6m down.
    const uw = THREE.MathUtils.clamp(THREE.MathUtils.smoothstep(SWIM.depth, 0.0, 0.6), 0, 1)
    // By DAY a bright, happy turquoise; by NIGHT a deep, moody night-water (the
    // daytime aqua would look wrong in the dark), driven by sun elevation.
    _fogTmp.copy(s.waterDeep).lerp(_AQUA, 0.15 + s.dayAmt * 0.55)
    _fogTmp.lerp(_GOLD, s.golden * 0.4) // warm the murk at sunrise/sunset
    fog.color.copy(s.fog).lerp(_fogTmp, uw)
    fog.near = 9 * (1 - uw) + 1.0 * uw
    fog.far = 120 * (1 - uw) + (38 + s.dayAmt * 22) * uw // see further by day, murkier at night
    // The sky dome itself dissolves into this same murk (uUnder below), so we no
    // longer hard-hide it or swap scene.background — that hard switch was what
    // made the surface straddle pop (clear sky one frame, flat murk the next).
    if (scene.background) scene.background = null
    // Lift + cool the light underwater so the reef reads cheerful by day, while
    // night stays only gently lifted (still dark and cozy).
    if (uw > 0.001) {
      const lift = 0.3 + s.dayAmt * 0.9
      amb.current.intensity *= 1.0 + uw * lift
      amb.current.color.lerp(_AQUA, uw * 0.45 * s.dayAmt)
      hemi.current.intensity *= 1.0 + uw * lift * 0.7
      hemi.current.color.lerp(_AQUA, uw * 0.4 * s.dayAmt)
    }

    // Stylized sky-rim on solid props only (see loadNature.ts) — kept subtle.
    RIM.color.value.copy(s.hemiSky).lerp(s.sunColor, 0.3 + s.golden * 0.4)
    RIM.strength.value = (s.dayAmt * 0.5 + s.golden * 0.5) * 0.28

    domeRef.current.visible = worldVisible
    domeRef.current.position.copy(camera.position)
    const du = domeMat.uniforms
    du.uTop.value.copy(s.skyTop)
    du.uBottom.value.copy(s.skyBottom)
    du.uGolden.value = s.golden
    du.uDayAmt.value = s.dayAmt
    du.uTime.value = state.clock.elapsedTime
    du.uSunDir.value.copy(s.sunDir)
    du.uSunColor.value.copy(s.sunColor)
    du.uAlpha.value = WORLD_ALPHA.value
    du.uUnder.value = uw
    du.uUnderColor.value.copy(_fogTmp)

    // Dynamic wind: the phase clock plus an overall strength that wanders
    // light→heavy over time. Strength feeds the (deliberately subtle) sway
    // amplitudes here, and — via WIND.strength — the wind volume and falling
    // leaves elsewhere, so the whole world gusts together.
    const et = state.clock.elapsedTime
    WIND.time.value = et
    const ws = windStrengthAt(et)
    WIND.strength.value = ws
    WIND.gAmp.value = 0.02 + ws * 0.13
    WIND.gSpeed.value = 0.5 + ws * 0.35   // slower, gentler grass sway
    WIND.gFlutter.value = 0.012 + ws * 0.035
    WIND.cAmp.value = 0.06 + ws * 0.34
    WIND.cSpeed.value = 0.32 + ws * 0.28  // slower canopy sway
    WIND.cFlutter.value = 0.04 + ws * 0.08

    // Refresh the IBL environment when the sky has shifted enough.
    const e = env.current
    e.frame++
    if (e.rt === null || (e.frame % 10 === 0 && Math.abs(t - e.lastT) > 0.004)) {
      // Always capture PMREM with full sky opacity — keeps IBL consistent
      // regardless of the WORLD_ALPHA fade-in, preventing a lighting pop at game start.
      const savedAlpha = domeMat.uniforms.uAlpha.value
      domeMat.uniforms.uAlpha.value = 1.0
      const next = pmrem.fromScene(envScene)
      domeMat.uniforms.uAlpha.value = savedAlpha
      if (e.rt) e.rt.dispose()
      e.rt = next
      scene.environment = next.texture
      e.lastT = t
    }
    // Soft IBL fill — kept modest so the pale sky doesn't milk the saturation
    // out of the grass; the sun + hemisphere do the heavy lifting.
    scene.environmentIntensity = 0.12 + s.dayAmt * 0.38

    // stars — fade in with world, hidden during intro; fade out as you dive
    if (worldVisible) {
      const starMat = starsRef.current?.material as THREE.PointsMaterial | undefined
      if (starMat) {
        starMat.opacity = s.starsOpacity * WORLD_ALPHA.value * (1 - uw)
        starsRef.current.visible = uw < 0.99 && s.starsOpacity > 0.02 && WORLD_ALPHA.value > 0.01
      }
    } else if (starsRef.current) {
      starsRef.current.visible = false
    }

    // sun & moon billboards — fade in with world; fade out smoothly as you dive
    if (worldVisible && WORLD_ALPHA.value > 0.01) {
      sunMesh.current.position.copy(s.sunDir).multiplyScalar(420)
      sunMesh.current.visible = uw < 0.99 && s.sunDir.y > -0.1
      ;(sunMesh.current.material as THREE.SpriteMaterial).color.copy(s.sunColor)
      ;(sunMesh.current.material as THREE.SpriteMaterial).opacity = 1 - uw
      moonMesh.current.position.copy(s.moonDir).multiplyScalar(420)
      moonMesh.current.visible = uw < 0.99 && s.moonDir.y > -0.05
      ;(moonMesh.current.material as THREE.SpriteMaterial).opacity = 1 - uw
    } else {
      sunMesh.current.visible = false
      moonMesh.current.visible = false
    }
  })

  return (
    <>
      <mesh ref={domeRef} material={domeMat} renderOrder={-10} frustumCulled={false}>
        <sphereGeometry args={[1000, 32, 16]} />
      </mesh>
      <Stars ref={starsRef as any} radius={300} depth={80} count={2600} factor={5} saturation={0} fade speed={0.6} />

      <ambientLight ref={amb} />
      <hemisphereLight ref={hemi} />

      <directionalLight
        ref={sun}
        castShadow
        shadow-mapSize-width={3072}
        shadow-mapSize-height={3072}
        shadow-radius={4}
        shadow-camera-near={1}
        shadow-camera-far={360}
        shadow-camera-left={-66}
        shadow-camera-right={66}
        shadow-camera-top={66}
        shadow-camera-bottom={-66}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight ref={moon} />

      {/* soft glowing sun disc (textured sprite, warm-tinted per time of day) */}
      <sprite ref={sunMesh} scale={[92, 92, 1]}>
        <spriteMaterial map={sunTex} color={0xfff4da} transparent depthWrite={false} toneMapped={false} fog={false} />
      </sprite>
      {/* pale cratered moon */}
      <sprite ref={moonMesh} scale={[48, 48, 1]}>
        <spriteMaterial map={moonTex} color={0xeaf0ff} transparent depthWrite={false} toneMapped={false} fog={false} />
      </sprite>
    </>
  )
}
