import { Stars } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getSky } from './palette'
import { createSkyDomeMaterial } from './skyDomeMaterial'
import { RIM, WIND, windStrengthAt } from './loadNature'
import { useWorld } from '../state/useWorld'

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
  const moonMesh = useRef<THREE.Mesh>(null!)
  const sunMesh = useRef<THREE.Mesh>(null!)

  const domeMat = useMemo(() => createSkyDomeMaterial(), [])

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

  useFrame((state) => {
    const t = useWorld.getState().t
    const started = useWorld.getState().started
    const s = getSky(t)

    // Keep crisp, high-resolution shadows where the viewer is looking: the sun's
    // shadow camera follows the player (or the island centre during the intro
    // orbit) while the light direction stays fixed.
    const fx = started ? camera.position.x : 0
    const fz = started ? camera.position.z : 0
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

    fog.color.copy(s.fog)

    // Stylized sky-rim on solid props only (see loadNature.ts) — kept subtle.
    RIM.color.value.copy(s.hemiSky).lerp(s.sunColor, 0.3 + s.golden * 0.4)
    RIM.strength.value = (s.dayAmt * 0.5 + s.golden * 0.5) * 0.28

    domeRef.current.position.copy(camera.position)
    const du = domeMat.uniforms
    du.uTop.value.copy(s.skyTop)
    du.uBottom.value.copy(s.skyBottom)
    du.uGolden.value = s.golden
    du.uDayAmt.value = s.dayAmt
    du.uTime.value = state.clock.elapsedTime
    du.uSunDir.value.copy(s.sunDir)
    du.uSunColor.value.copy(s.sunColor)

    // Dynamic wind: the phase clock plus an overall strength that wanders
    // light→heavy over time. Strength feeds the (deliberately subtle) sway
    // amplitudes here, and — via WIND.strength — the wind volume and falling
    // leaves elsewhere, so the whole world gusts together.
    const et = state.clock.elapsedTime
    WIND.time.value = et
    const ws = windStrengthAt(et)
    WIND.strength.value = ws
    WIND.gAmp.value = 0.02 + ws * 0.13
    WIND.gSpeed.value = 0.9 + ws * 0.8
    WIND.gFlutter.value = 0.015 + ws * 0.05
    WIND.cAmp.value = 0.06 + ws * 0.34
    WIND.cSpeed.value = 0.6 + ws * 0.5
    WIND.cFlutter.value = 0.05 + ws * 0.13

    // Refresh the IBL environment when the sky has shifted enough.
    const e = env.current
    e.frame++
    if (e.rt === null || (e.frame % 10 === 0 && Math.abs(t - e.lastT) > 0.004)) {
      const next = pmrem.fromScene(envScene)
      if (e.rt) e.rt.dispose()
      e.rt = next
      scene.environment = next.texture
      e.lastT = t
    }
    // Soft IBL fill — kept modest so the pale sky doesn't milk the saturation
    // out of the grass; the sun + hemisphere do the heavy lifting.
    scene.environmentIntensity = 0.12 + s.dayAmt * 0.38

    // stars fade in at night
    const starMat = starsRef.current?.material as THREE.PointsMaterial | undefined
    if (starMat) {
      starMat.opacity = s.starsOpacity
      starsRef.current.visible = s.starsOpacity > 0.02
    }

    // sun & moon billboards
    sunMesh.current.position.copy(s.sunDir).multiplyScalar(420)
    sunMesh.current.visible = s.sunDir.y > -0.1
    ;(sunMesh.current.material as THREE.MeshBasicMaterial).color.copy(s.sunColor)

    moonMesh.current.position.copy(s.moonDir).multiplyScalar(420)
    moonMesh.current.visible = s.moonDir.y > -0.05
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

      {/* soft sun disc */}
      <mesh ref={sunMesh}>
        <sphereGeometry args={[18, 24, 24]} />
        <meshBasicMaterial color={0xfff4da} toneMapped={false} fog={false} />
      </mesh>
      {/* moon */}
      <mesh ref={moonMesh}>
        <sphereGeometry args={[12, 24, 24]} />
        <meshBasicMaterial color={0xeaf0ff} toneMapped={false} fog={false} />
      </mesh>
    </>
  )
}
