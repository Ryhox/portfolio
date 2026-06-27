import { Effect } from 'postprocessing'
import * as THREE from 'three'

// Minecraft-"Motion Blur"-mod style temporal blur. There's no velocity buffer in
// this stack, so we do what that mod does: keep a feedback accumulation buffer and
// each frame blend the freshly rendered image into it —
//     accum = mix(currentFrame, accum, strength)
// then display `accum`. Because the accumulator feeds back into itself, motion
// leaves an exponential trailing smear (long at high strength, short at low), and
// the instant the image holds still the accumulator converges exactly to the
// current frame (fixed point) — so there's NO darkening or ghost when stationary.
//
// All blending happens in the composer's own working colour space (we copy it off
// `inputBuffer` so the feedback never round-trips through an sRGB/linear
// conversion — that mismatch was what dimmed the earlier version every frame).

const blendVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`

const blendFragment = /* glsl */ `
uniform sampler2D tCurrent;
uniform sampler2D tHistory;
uniform float uStrength;
varying vec2 vUv;
// Reject non-finite samples and tame extreme HDR before they enter the feedback
// loop. At High quality the Bloom pass writes HDR into this (untonemapped) buffer
// and can emit ±Inf / NaN; left unchecked the accumulator stores them and the
// LinearFilter sampling SPREADS them frame after frame into a rainbow blow-up
// (the reported artifact — High-only, since Medium has no Bloom). (c == c) is
// false only for NaN; clamp folds ±Inf and runaway values into a sane range.
vec4 sanitize(vec4 c) {
  c = (c == c) ? c : vec4(0.0);
  return clamp(c, 0.0, 16.0);
}
void main() {
  vec4 cur  = sanitize(texture2D(tCurrent, vUv));
  vec4 hist = sanitize(texture2D(tHistory, vUv));
  gl_FragColor = mix(cur, hist, uStrength);
}
`

// The Effect itself just displays the accumulator that update() produced.
const displayFragment = /* glsl */ `
uniform sampler2D tAccum;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = texture2D(tAccum, uv);
}
`

const RT_OPTS = {
  depthBuffer: false,
  stencilBuffer: false,
  type: THREE.HalfFloatType,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
}

export class MotionBlurEffect extends Effect {
  private accumRead: THREE.WebGLRenderTarget | null = null
  private accumWrite: THREE.WebGLRenderTarget | null = null
  private primed = false

  // Private fullscreen blend pass (its own tiny scene/quad/camera).
  private fsScene = new THREE.Scene()
  private fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  private blendMat = new THREE.ShaderMaterial({
    uniforms: {
      tCurrent: { value: null },
      tHistory: { value: null },
      uStrength: { value: 0.5 },
    },
    vertexShader: blendVertex,
    fragmentShader: blendFragment,
    depthWrite: false,
    depthTest: false,
  })

  // wrapEffect constructs this with an options object; we take none (strength is
  // driven live from the store via the `strength` uniform), so just ignore it.
  constructor(_options: Record<string, unknown> = {}) {
    super('MotionBlurEffect', displayFragment, {
      uniforms: new Map<string, THREE.Uniform>([
        ['tAccum', new THREE.Uniform(null)],
        ['strength', new THREE.Uniform(0.5)],
      ]),
    })
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blendMat)
    quad.frustumCulled = false
    this.fsScene.add(quad)
  }

  update(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget) {
    const read = this.accumRead
    const write = this.accumWrite
    if (!read || !write) return

    // Keep the accumulator in the composer's working colour space so the feedback
    // is a lossless round-trip (no per-frame darkening).
    const cs = inputBuffer.texture.colorSpace
    if (read.texture.colorSpace !== cs) {
      read.texture.colorSpace = cs
      write.texture.colorSpace = cs
      this.primed = false
    }

    // Until we've produced one valid frame, the history buffer is uninitialized
    // (a fresh HalfFloat target can hold NaN/garbage). Sampling it and blending
    // would poison the feedback loop forever — a rainbow blow-up. So on the very
    // first frame, blend the current image against ITSELF (history = current):
    // mix(cur, cur, s) == cur, a clean seed that never touches the garbage buffer.
    const strength = (this.uniforms.get('strength') as THREE.Uniform).value as number
    this.blendMat.uniforms.uStrength.value = this.primed ? strength : 0
    this.blendMat.uniforms.tCurrent.value = inputBuffer.texture
    this.blendMat.uniforms.tHistory.value = this.primed ? read.texture : inputBuffer.texture

    const prevTarget = renderer.getRenderTarget()
    renderer.setRenderTarget(write)
    renderer.render(this.fsScene, this.fsCam)
    renderer.setRenderTarget(prevTarget)

    ;(this.uniforms.get('tAccum') as THREE.Uniform).value = write.texture
    this.accumRead = write
    this.accumWrite = read
    this.primed = true
  }

  setSize(width: number, height: number) {
    if (!this.accumRead || !this.accumWrite) {
      this.accumRead = new THREE.WebGLRenderTarget(width, height, RT_OPTS)
      this.accumWrite = new THREE.WebGLRenderTarget(width, height, RT_OPTS)
      this.accumRead.texture.name = 'MotionBlur.accum.a'
      this.accumWrite.texture.name = 'MotionBlur.accum.b'
    } else {
      this.accumRead.setSize(width, height)
      this.accumWrite.setSize(width, height)
    }
    this.primed = false // history is stale at the new size — reseed next frame
  }

  dispose() {
    this.accumRead?.dispose()
    this.accumWrite?.dispose()
    this.blendMat.dispose()
    ;(this.fsScene.children[0] as THREE.Mesh)?.geometry?.dispose()
    super.dispose()
  }
}
