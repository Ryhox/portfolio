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

    // --- wispy cirrus clouds (day only) ---
    // Project the sky onto a plane; the natural horizon stretch makes the wisps
    // converge toward the horizon. Anisotropic scale + drift = thin streaks.
    vec2 sp = dir.xz / max(h, 0.12);
    sp *= vec2(0.34, 0.9);
    sp += uTime * vec2(0.012, 0.004);
    float n = fbm(sp * 1.6 + 7.0);
    float cover = smoothstep(0.52, 0.95, n);
    float skyBand = smoothstep(0.04, 0.28, h);
    float clouds = cover * skyBand * uDayAmt;
    vec3 cloudCol = mix(vec3(1.0), uSunColor, 0.18);
    // brighten the rim of clouds that face the sun a touch
    cloudCol += uSunColor * pow(sd, 4.0) * 0.4;
    col = mix(col, cloudCol, clamp(clouds, 0.0, 1.0) * 0.72);

    gl_FragColor = vec4(col, 1.0);
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
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
}
