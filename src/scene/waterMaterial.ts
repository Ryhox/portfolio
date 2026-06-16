import * as THREE from 'three'
import { ISLAND_RADIUS } from './layout'

// Stylized "toon-ish" ocean: gentle sine swells, a deep->shallow gradient by
// view angle, a soft sky-tinted fresnel rim, cartoon foam bands, a foam ring
// that hugs the shore, and a touch of sun glitter. Day/night colors are pushed
// in every frame as uniforms. Tonemapping + colorspace includes keep it
// consistent with the rest of the (ACES-tonemapped) scene.

const vertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;

  float wave(vec2 p) {
    return sin(p.x * 0.12 + uTime * 0.70) * 0.28
         + sin(p.y * 0.17 - uTime * 0.55) * 0.22
         + sin((p.x + p.y) * 0.07 + uTime * 0.45) * 0.32;
  }

  void main() {
    vec3 pos = position;           // geometry pre-rotated into the XZ plane
    float h = wave(pos.xz);
    pos.y += h;

    float e = 0.6;
    float hx = wave(pos.xz + vec2(e, 0.0));
    float hz = wave(pos.xz + vec2(0.0, e));
    vec3 n = normalize(vec3(h - hx, e, h - hz));

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorld = world.xyz;
    vNormal = n;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

const fragment = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uIslandR;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  varying vec3 vWorld;
  varying vec3 vNormal;

  // three.js auto-injects the tonemapping/colorspace *pars* for ShaderMaterial,
  // so we only call the apply chunks below — including the pars again would
  // redefine them.

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormal);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);

    vec3 col = mix(uDeep, uShallow, clamp(fres * 1.3, 0.0, 1.0));
    col = mix(col, uSky, fres * 0.35);

    // gentle moving sparkle
    float spk = sin(vWorld.x * 0.6 + uTime * 1.3) * sin(vWorld.z * 0.55 - uTime * 1.1);
    col += uShallow * smoothstep(0.7, 1.0, spk) * 0.12;

    // shore foam ring (approximate, wobbled coastline)
    float ang = atan(vWorld.z, vWorld.x);
    float coast = sin(ang * 5.0) * 2.5 + sin(ang * 11.0) * 1.2;
    float r = length(vWorld.xz) + coast;
    float ring = smoothstep(uIslandR + 4.0, uIslandR + 0.5, r) *
                 smoothstep(uIslandR - 8.0, uIslandR - 2.0, r);
    float bands = smoothstep(0.5, 0.9, sin(r * 0.8 - uTime * 1.6) * 0.5 + 0.5);
    float foam = clamp(ring * (0.45 + 0.55 * bands), 0.0, 1.0);
    col = mix(col, uFoam, foam);

    // sun glitter
    vec3 H = normalize(uSunDir + V);
    float glint = pow(max(dot(N, H), 0.0), 90.0);
    col += uSunColor * glint * 0.9;

    gl_FragColor = vec4(col, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.9 },
      uIslandR: { value: ISLAND_RADIUS },
      uDeep: { value: new THREE.Color(0x1b6f86) },
      uShallow: { value: new THREE.Color(0x57c6c0) },
      uFoam: { value: new THREE.Color(0xeafcff) },
      uSky: { value: new THREE.Color(0xcdeaf7) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff4da) },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
  })
}
