import * as THREE from 'three'
import { ISLAND_RADIUS } from './layout'
import { WAVE_GLSL } from './oceanWave'
import { RIPPLE } from './rippleField'
import { SEA_ROCKS, SEA_ROCK_MAX } from './seaRocks'

// Stylized "toon-ish" ocean: rounded cozy swells (shared oceanWave field), soft
// cel-banded deep->shallow color, sky-tinted crests, a clean solid foam line that
// hugs the shore (only once you're in the world — hidden on the idle screen), and
// gentle cursor/swimmer ripples. No dashed sparkle / whitecap streaks. Day/night
// colors are pushed in each frame; depthWrite stays on so the surface never
// z-fights itself at grazing angles while you swim.

const SIM_RES = 256.0 // must match RippleSim's render-target resolution

const vertex = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uRipple;
  uniform vec2 uRippleCenter;
  uniform float uRippleSize;
  uniform float uRippleOn;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vRipUV;
  varying float vRip;
  varying float vWaveH;

  ${WAVE_GLSL}

  void main() {
    vec3 pos = position;            // geometry pre-rotated into the XZ plane
    float h = oceanWave(pos.xz, uTime);
    vWaveH = h;

    // live ripple field (cursor / swimmer / fish) adds a small local displacement
    vec2 ruv = (pos.xz - uRippleCenter) / uRippleSize + 0.5;
    vRipUV = ruv;
    float rip = 0.0;
    if (uRippleOn > 0.5 && ruv.x > 0.0 && ruv.x < 1.0 && ruv.y > 0.0 && ruv.y < 1.0) {
      rip = texture2D(uRipple, ruv).r;
    }
    vRip = rip;
    pos.y += h + rip * 0.35; // small wave bump — the FOAM (below) does the visible work

    vec3 n = oceanNormal(pos.xz, uTime, 0.5);
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
  uniform float uUnder;
  uniform float uShoreFoam;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uFoam;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform sampler2D uRipple;
  uniform float uRippleOn;
  uniform vec4 uRocks[${SEA_ROCK_MAX}];
  uniform int uRockCount;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vRipUV;
  varying float vRip;
  varying float vWaveH;

  // --- value-noise fbm + contour lines for the stylized caustic texture ---
  float hash21(vec2 p) { p = fract(p * vec2(123.34, 345.45)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
  float vnoise2(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm3(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * vnoise2(p); p *= 2.0; a *= 0.5; } return s; }
  float contourLine(vec2 uv, float count, float width) {
    float nn = fbm3(uv);
    float t = abs(fract(nn * count) - 0.5) * 2.0;
    return 1.0 - smoothstep(0.0, width, t);
  }

  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 N = normalize(vNormal);

    // small ripple normal-perturbation + a faint crest highlight on fast ripples
    float ripFoam = 0.0;
    vec2 ripWarp = vec2(0.0); // drags the caustic texture around so it reacts to the cursor
    if (uRippleOn > 0.5 && vRipUV.x > 0.001 && vRipUV.x < 0.999 && vRipUV.y > 0.001 && vRipUV.y < 0.999) {
      float texel = 1.0 / ${SIM_RES.toFixed(1)};
      float hC = texture2D(uRipple, vRipUV).r;
      float hL = texture2D(uRipple, vRipUV - vec2(texel, 0.0)).r;
      float hR = texture2D(uRipple, vRipUV + vec2(texel, 0.0)).r;
      float hD = texture2D(uRipple, vRipUV - vec2(0.0, texel)).r;
      float hU = texture2D(uRipple, vRipUV + vec2(0.0, texel)).r;
      vec3 rn = normalize(vec3(hL - hR, 0.5, hD - hU));
      N = normalize(N + vec3(rn.x, 0.0, rn.z) * 1.8);   // subtler ripple refraction
      ripWarp = vec2(hL - hR, hD - hU);
      // ONE clean foam ring per ripple crest: a thin band on the up-bulge only, so
      // there are no doubled slope lines and no separate trough line — just crisp,
      // cool expanding rings that follow the cursor.
      ripFoam = smoothstep(0.045, 0.11, hC) * (1.0 - smoothstep(0.11, 0.30, hC));
    }

    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
    float crest = smoothstep(0.04, 0.55, vWaveH); // high on the swell crests

    // --- cel-banded body color: deep -> shallow, crests lifted toward the sky ---
    float shade = clamp(fres * 1.1 + crest * 0.45, 0.0, 1.0);
    float band = mix(shade, floor(shade * 3.0 + 0.5) / 3.0, 0.5); // half toon, half smooth
    vec3 col = mix(uDeep, uShallow, band);
    col = mix(col, mix(uShallow, uSky, 0.6), crest * 0.35);        // sky-tinted crests
    col = mix(col, uSky, fres * 0.28);                            // soft sky rim

    // --- stylized caustic outline texture drifting on the surface (ref image) ---
    // The cursor / fish / swimmer ripples drag the texture (ripWarp), so the
    // lines visibly swirl and bend where you disturb the water.
    vec2 cuv = vWorld.xz * 0.06 + ripWarp * 3.2;
    float l1 = contourLine(cuv + vec2(uTime * 0.013, uTime * 0.007), 3.0, 0.18);
    float l2 = contourLine(cuv * 1.8 + vec2(-uTime * 0.009, uTime * 0.015) + 5.0, 4.0, 0.14);
    float lines = clamp(l1 * 0.65 + l2 * 0.5, 0.0, 1.0) * (1.0 - uUnder);
    // brighten the lines a touch on the ripple so the interaction reads clearly
    vec3 lineCol = mix(uFoam, vec3(0.92, 0.82, 0.55), 0.35);
    col = mix(col, lineCol, clamp(lines * 0.2 + ripFoam * 0.15, 0.0, 1.0));

    // --- foam: a clean, solid shore line (hidden on the idle screen) ---
    float ang = atan(vWorld.z, vWorld.x);
    float coast = sin(ang * 5.0) * 2.5 + sin(ang * 11.0) * 1.2;
    float r = length(vWorld.xz) + coast;
    float ring = smoothstep(uIslandR + 4.0, uIslandR + 0.5, r) *
                 smoothstep(uIslandR - 8.0, uIslandR - 2.0, r);
    float bands = smoothstep(0.45, 0.95, sin(r * 0.8 - uTime * 1.4) * 0.5 + 0.5);
    float foam = clamp(ring * (0.82 + 0.18 * bands), 0.0, 1.0) * uShoreFoam;

    // optional foam rings around sea-stacks (none unless SEA_ROCKS is populated)
    for (int i = 0; i < ${SEA_ROCK_MAX}; i++) {
      if (i >= uRockCount) break;
      vec2 rp = uRocks[i].xy;
      float rr = uRocks[i].z;
      float dr = length(vWorld.xz - rp);
      float rk = smoothstep(rr + 5.0, rr + 1.0, dr) * smoothstep(rr - 1.0, rr + 1.0, dr);
      foam = max(foam, clamp(rk * uShoreFoam, 0.0, 1.0));
    }

    // cursor / fish / swimmer foam (clean single ring — the bit the user liked)
    foam = clamp(foam + ripFoam, 0.0, 1.0);
    col = mix(col, uFoam, foam);

    // gentle, warm sun sheen (soft — no harsh hotspot)
    vec3 H = normalize(uSunDir + V);
    float glint = pow(max(dot(N, H), 0.0), 60.0);
    col += uSunColor * glint * 0.35;

    // underside look (smoothly blended via uUnder when the eye is below water)
    if (uUnder > 0.001) {
      float graze = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.0);
      vec3 underCol = mix(uShallow * 1.1, uSky, 0.4);
      col = mix(col, underCol, uUnder * 0.6);
      col += uFoam * graze * 0.2 * uUnder;
    }

    float alpha = clamp(uOpacity + foam * 0.4, 0.0, 1.0);
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

const rockData = Array.from({ length: SEA_ROCK_MAX }, (_, i) => {
  const rk = SEA_ROCKS[i]
  return rk ? new THREE.Vector4(rk.x, rk.z, rk.r, 0) : new THREE.Vector4(0, 0, 0, 0)
})

export function createWaterMaterial() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.9 },
      uIslandR: { value: ISLAND_RADIUS },
      uUnder: { value: 0 },
      uShoreFoam: { value: 0 }, // 0 on the idle screen, ramps to 1 once you're in the world
      uDeep: { value: new THREE.Color(0x1b6f86) },
      uShallow: { value: new THREE.Color(0x57c6c0) },
      uFoam: { value: new THREE.Color(0xeafcff) },
      uSky: { value: new THREE.Color(0xcdeaf7) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff4da) },
      uRipple: { value: RIPPLE.texture },
      uRippleCenter: { value: RIPPLE.center },
      uRippleSize: { value: RIPPLE.size },
      uRippleOn: { value: 0 },
      uRocks: { value: rockData },
      uRockCount: { value: SEA_ROCKS.length },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  })
  return mat
}
