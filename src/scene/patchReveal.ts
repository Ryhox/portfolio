import type * as THREE from 'three'
import { REVEAL_DIST, REVEAL_CENTER, REVEAL_COLOR_U, REVEAL_INTENSITY, REVEAL_THICKNESS } from './revealUniforms'

const VERT_HEAD = /* glsl */`varying vec3 vRevealWP;\n`

const VERT_INJECT = /* glsl */`
{
  vec4 _rwp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    _rwp = instanceMatrix * _rwp;
  #endif
  vRevealWP = (modelMatrix * _rwp).xyz;
}
`

const FRAG_HEAD = /* glsl */`
varying vec3 vRevealWP;
uniform vec2  revealCenter;
uniform float revealDist;
uniform vec3  revealColor;
uniform float revealIntensity;
uniform float revealThickness;
`

// 1) Before tonemapping — discard outside ring, apply glow in linear HDR space.
//    _revealEdge declared at function scope so the fog replacement can read it.
//    REVEAL_GLOW_OFF define: clip-only mode (for meshes like LightShafts that
//    are additive overlays and should not have glow color baked into them).
const FRAG_PRE_TONE = /* glsl */`
float _revealEdge;
{
  float _c = max(0.0, revealDist);
  float _d = length(vRevealWP.xz - revealCenter);
  if (_d > _c) discard;
  #ifndef REVEAL_GLOW_OFF
    _revealEdge = step(_c - revealThickness, _d);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, revealColor * revealIntensity, _revealEdge);
  #else
    _revealEdge = 0.0;
  #endif
}
`

// 2) Fog replacement — identical to Three.js fog_fragment but skips the mix for
//    glow pixels so fog can never wash out the ring edge.
const FRAG_FOG_REPLACE = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  if (_revealEdge < 0.5) {
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  }
#endif
`

export function patchReveal(mat: THREE.Material): void {
  if ((mat as any).__revealPatched) return
  ;(mat as any).__revealPatched = true

  const prev = (mat as any).onBeforeCompile as ((s: any, r?: any) => void) | undefined
  ;(mat as any).onBeforeCompile = (shader: any, renderer?: any) => {
    if (prev) prev(shader, renderer)

    shader.uniforms.revealCenter    = REVEAL_CENTER
    shader.uniforms.revealDist      = REVEAL_DIST
    shader.uniforms.revealColor     = REVEAL_COLOR_U
    shader.uniforms.revealIntensity = REVEAL_INTENSITY
    shader.uniforms.revealThickness = REVEAL_THICKNESS

    if (!shader.vertexShader.includes('vRevealWP')) {
      shader.vertexShader = VERT_HEAD + shader.vertexShader
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>' + VERT_INJECT,
      )
    }

    if ((mat as any).__revealGlowOff) {
      shader.defines = shader.defines || {}
      shader.defines.REVEAL_GLOW_OFF = '1'
    }

    if (!shader.fragmentShader.includes('vRevealWP')) {
      shader.fragmentShader = FRAG_HEAD + shader.fragmentShader
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <tonemapping_fragment>',
        FRAG_PRE_TONE + '#include <tonemapping_fragment>',
      )
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <fog_fragment>',
        FRAG_FOG_REPLACE,
      )
    }
  }

  mat.needsUpdate = true
}
