import * as THREE from 'three'

// Custom gradient sky dome — full control over the cozy palette and, crucially,
// a clean dark night sky (no Preetham brown band). The dome follows the camera
// so it always surrounds the viewer. Its horizon color is fed the same value as
// the scene fog, so the fogged sea melts seamlessly into the sky. Soft wispy
// cirrus clouds drift across the upper sky by day to match the asset previews.

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position; // dome is centered on the camera; local pos == view dir
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform vec3 uGlow;
  uniform float uGolden;
  uniform float uDayAmt;
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uAlpha;
  uniform float uUnder;       // 0 above water -> 1 fully submerged
  uniform vec3 uUnderColor;   // murk tint to dissolve the sky into while diving
  varying vec3 vDir;

  // --- cheap value-noise fbm for the clouds ---
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 345.45));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      s += a * vnoise(p);
      p *= 2.0;
      a *= 0.5;
    }
    return s;
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;

    // vertical gradient horizon -> zenith
    float grad = smoothstep(-0.05, 0.55, h);
    vec3 col = mix(uBottom, uTop, grad);

    // warm band hugging the horizon at sunrise / sunset (zero at night)
    float band = smoothstep(0.28, -0.12, h);
    col = mix(col, uGlow, band * uGolden);

    // broad soft glow around the sun by day
    float sd = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSunColor * pow(sd, 6.0) * uDayAmt * 0.55;
    col += uGlow * pow(sd, 2.0) * uGolden * 0.4;

    // --- layered, voluminous clouds (day only) ---
    // Project the sky onto a plane; the natural horizon stretch makes the wisps
    // converge toward the horizon. Two layers (rounder low cumulus + thin high
    // cirrus) drifting at different rates, with a shaded underside and sun-lit
    // tops/rims so the puffs read as volume rather than flat fog.
    float skyBand = smoothstep(0.02, 0.30, h);
    vec2 base = dir.xz / max(h, 0.12);
    vec2 sunProj = normalize(uSunDir.xz + vec2(1e-3));

    // low cumulus — rounder, slower
    vec2 sp1 = base * vec2(0.5, 0.85) + uTime * vec2(0.008, 0.0028);
    float n1 = fbm(sp1 * 1.2 + 3.0);
    float cumulus = smoothstep(0.55, 0.92, n1);
    // sample a step toward the sun → lit top vs shadowed base (fake self-shadow)
    float n1s = fbm((sp1 + sunProj * 0.28) * 1.2 + 3.0);
    float lit = smoothstep(0.5, 0.95, n1s);

    // high cirrus — thin, faster streaks
    vec2 sp2 = base * vec2(0.32, 1.0) + uTime * vec2(0.02, 0.006);
    float n2 = fbm(sp2 * 2.2 + 11.0);
    float cirrus = smoothstep(0.6, 0.95, n2);

    float clouds = (cumulus * 0.9 + cirrus * 0.5) * skyBand * uDayAmt;

    vec3 cloudShadow = mix(uBottom * 1.05, vec3(1.0), 0.6); // sky-tinted underside
    vec3 cloudLit = mix(vec3(1.0), uSunColor, 0.25);
    vec3 cloudCol = mix(cloudShadow, cloudLit, clamp(lit + pow(sd, 2.0) * 0.5, 0.0, 1.0));
    cloudCol += uSunColor * pow(sd, 4.0) * 0.5; // bright sun-facing rim
    col = mix(col, cloudCol, clamp(clouds, 0.0, 1.0) * 0.8);

    // Diving: the dome itself dissolves into the underwater murk so the sky melts
    // away smoothly (no hard hide / background swap), matching the scene fog.
    col = mix(col, uUnderColor, uUnder);

    gl_FragColor = vec4(col, uAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function createSkyDomeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(0x4a98dd) },
      uBottom: { value: new THREE.Color(0xdcf0f8) },
      uGlow: { value: new THREE.Color(0xff8a44) },
      uGolden: { value: 0 },
      uDayAmt: { value: 1 },
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff4da) },
      uAlpha: { value: 0 },
      uUnder: { value: 0 },
      uUnderColor: { value: new THREE.Color(0x5fd4de) },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    transparent: true,
  })
}
