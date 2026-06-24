import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, SMAA, Vignette, wrapEffect } from '@react-three/postprocessing'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { LITE } from './config'
import { useWorld } from '../state/useWorld'
import { MotionBlurEffect } from './motionBlurEffect'

// Custom temporal motion-blur effect, exposed as a composer child.
const MotionBlur = wrapEffect(MotionBlurEffect)

// Drives the live strength uniform from the settings store. Lives OUTSIDE the
// composer (a plain logic node) so the effect instance is never reconstructed
// while dragging the slider — we just write its uniform each frame. The slider's
// 0..1 maps to 0..0.85 so even "max" keeps a little fresh image (never a freeze).
function MotionBlurDriver({ effectRef }: { effectRef: React.MutableRefObject<MotionBlurEffect | null> }) {
  useFrame(() => {
    const e = effectRef.current
    if (!e) return
    ;(e.uniforms.get('strength') as { value: number }).value =
      useWorld.getState().motionBlurAmount * 0.85
  })
  return null
}

// The cinematic stack, tuned by eye against the asset-pack previews:
//   N8AO        soft contact/crevice ambient occlusion that grounds everything
//   Bloom       dreamy glow off the bright sky, sun, lanterns and glow-mushrooms
//   Hue/Sat +   lush, slightly warm colour grade (runs after the renderer's AgX
//   Brightness  tonemapping so greens glow and oranges sing)
//   Vignette    frames the cozy scene
//   SMAA        clean edges on the busy foliage
// (Sun shafts are real geometry — see LightShafts.tsx — not a post pass, so they
// show reliably on every GPU.) Skipped in lite mode; the renderer still applies
// AgX tonemapping there.
//
// Graphics quality (cycled from the settings sheet) trims the stack:
//   Low     no post passes at all — just AgX tonemapping
//   Medium  colour grade + vignette + anti-aliasing (drops the costly N8AO/Bloom)
//   High    the full stack
export function Postfx() {
  const quality = useWorld((s) => s.quality)
  const motionBlur = useWorld((s) => s.motionBlur)
  // wrapEffect forwards the ref to the effect INSTANCE, but types it as the class;
  // cast through the instance type we actually get back.
  const mbRef = useRef<MotionBlurEffect | null>(null)
  const mbRefAttr = mbRef as unknown as React.Ref<typeof MotionBlurEffect>
  // An empty fragment (vs. `false`) keeps EffectComposer's Element-typed children
  // happy while still creating no 3D object when motion blur is off.
  const mbChild = (active: boolean) =>
    active ? <MotionBlur ref={mbRefAttr} /> : <></>

  // Motion blur needs a post-process composer, which Low quality doesn't run.
  const mbActive = motionBlur && quality !== 'Low' && !LITE

  if (LITE || quality === 'Low') return null

  if (quality === 'Medium') {
    return (
      <>
        <EffectComposer multisampling={0}>
          <HueSaturation saturation={0.28} />
          <BrightnessContrast brightness={-0.02} contrast={0.16} />
          <Vignette eskil={false} offset={0.3} darkness={0.45} />
          <SMAA />
          {/* motion blur smears the final composed frame → keep it last */}
          {mbChild(mbActive)}
        </EffectComposer>
        {mbActive && <MotionBlurDriver effectRef={mbRef} />}
      </>
    )
  }

  return (
    <>
      <EffectComposer multisampling={0}>
        <N8AO aoRadius={2.2} intensity={2.6} distanceFalloff={1.0} halfRes quality="medium" />
        <Bloom mipmapBlur intensity={0.42} luminanceThreshold={0.82} luminanceSmoothing={0.25} radius={0.6} />
        <HueSaturation saturation={0.28} />
        <BrightnessContrast brightness={-0.02} contrast={0.16} />
        <Vignette eskil={false} offset={0.3} darkness={0.45} />
        <SMAA />
        {/* motion blur smears the final composed frame → keep it last */}
        {mbChild(mbActive)}
      </EffectComposer>
      {mbActive && <MotionBlurDriver effectRef={mbRef} />}
    </>
  )
}
