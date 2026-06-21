import { Bloom, BrightnessContrast, EffectComposer, HueSaturation, N8AO, SMAA, Vignette } from '@react-three/postprocessing'
import { LITE } from './config'
import { useWorld } from '../state/useWorld'

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
  if (LITE || quality === 'Low') return null

  if (quality === 'Medium') {
    return (
      <EffectComposer multisampling={0}>
        <HueSaturation saturation={0.28} />
        <BrightnessContrast brightness={-0.02} contrast={0.16} />
        <Vignette eskil={false} offset={0.3} darkness={0.45} />
        <SMAA />
      </EffectComposer>
    )
  }

  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={2.2} intensity={2.6} distanceFalloff={1.0} halfRes quality="medium" />
      <Bloom mipmapBlur intensity={0.42} luminanceThreshold={0.82} luminanceSmoothing={0.25} radius={0.6} />
      <HueSaturation saturation={0.28} />
      <BrightnessContrast brightness={-0.02} contrast={0.16} />
      <Vignette eskil={false} offset={0.3} darkness={0.45} />
      <SMAA />
    </EffectComposer>
  )
}
