import * as THREE from 'three'

// GPU height-field ripple simulation (ping-pong). Each step reads the previous
// state (r = height, g = velocity), applies a damped wave equation over the
// 4-neighbour Laplacian, injects "splats" (cursor / swimmer / fish), and writes
// the next state. The water material samples the result for displacement + foam.

export const SIM_RES = 256 // keep in sync with waterMaterial's SIM_RES
export const MAX_SPLATS = 16

const vert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const frag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPrev;
  uniform float uTexel;
  uniform float uSpeed;   // wave propagation (keep < 0.5 for stability)
  uniform float uDamp;    // velocity damping
  uniform float uDecay;   // slow settle back to flat
  uniform vec4 uSplats[${MAX_SPLATS}]; // xy = uv, z = strength, w = radius (uv)
  uniform int uSplatCount;

  void main() {
    vec4 c = texture2D(uPrev, vUv);
    float h = c.r;
    float v = c.g;

    float lap =
        texture2D(uPrev, vUv + vec2(-uTexel, 0.0)).r
      + texture2D(uPrev, vUv + vec2( uTexel, 0.0)).r
      + texture2D(uPrev, vUv + vec2(0.0, -uTexel)).r
      + texture2D(uPrev, vUv + vec2(0.0,  uTexel)).r
      - 4.0 * h;

    v += lap * uSpeed;
    v *= uDamp;
    h += v;
    h *= uDecay;

    for (int i = 0; i < ${MAX_SPLATS}; i++) {
      if (i >= uSplatCount) break;
      vec4 s = uSplats[i];
      vec2 d = vUv - s.xy;
      float d2 = dot(d, d);
      h += s.z * exp(-d2 / (2.0 * s.w * s.w));
    }

    // soft border so energy doesn't pile up / reflect hard at the edges
    float edge = smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x)
               * smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
    h *= edge;
    v *= edge;

    gl_FragColor = vec4(h, v, 0.0, 1.0);
  }
`

export function createRippleSimMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPrev: { value: null as THREE.Texture | null },
      uTexel: { value: 1 / SIM_RES },
      uSpeed: { value: 0.38 }, // faster, livelier wave propagation
      uDamp: { value: 0.992 }, // less damping → ripples travel further / you can push the water around
      uDecay: { value: 0.999 },
      uSplats: { value: Array.from({ length: MAX_SPLATS }, () => new THREE.Vector4()) },
      uSplatCount: { value: 0 },
    },
    vertexShader: vert,
    fragmentShader: frag,
    depthTest: false,
    depthWrite: false,
  })
}
