/* GLSL for the render pipeline. Everything between passes is linear HDR; only the final pass tone-maps. */

export const fullscreenVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** 13-tap downsample (Jimenez, "Next Generation Post Processing in Call of Duty"). */
export const bloomDownFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uPrefilter;
  uniform float uThreshold;
  uniform float uKnee;

  vec3 prefilter(vec3 c) {
    float br = max(c.r, max(c.g, c.b));
    float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-4);
    float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
    return c * contrib;
  }

  void main() {
    vec2 t = uTexel;
    vec3 a = texture2D(tSrc, vUv + t * vec2(-2.0,  2.0)).rgb;
    vec3 b = texture2D(tSrc, vUv + t * vec2( 0.0,  2.0)).rgb;
    vec3 c = texture2D(tSrc, vUv + t * vec2( 2.0,  2.0)).rgb;
    vec3 d = texture2D(tSrc, vUv + t * vec2(-2.0,  0.0)).rgb;
    vec3 e = texture2D(tSrc, vUv).rgb;
    vec3 f = texture2D(tSrc, vUv + t * vec2( 2.0,  0.0)).rgb;
    vec3 g = texture2D(tSrc, vUv + t * vec2(-2.0, -2.0)).rgb;
    vec3 h = texture2D(tSrc, vUv + t * vec2( 0.0, -2.0)).rgb;
    vec3 i = texture2D(tSrc, vUv + t * vec2( 2.0, -2.0)).rgb;
    vec3 j = texture2D(tSrc, vUv + t * vec2(-1.0,  1.0)).rgb;
    vec3 k = texture2D(tSrc, vUv + t * vec2( 1.0,  1.0)).rgb;
    vec3 l = texture2D(tSrc, vUv + t * vec2(-1.0, -1.0)).rgb;
    vec3 m = texture2D(tSrc, vUv + t * vec2( 1.0, -1.0)).rgb;
    vec3 col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
    if (uPrefilter > 0.5) col = prefilter(min(col, vec3(32.0)));
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** 9-tap tent upsample, blended additively onto the next mip. */
export const bloomUpFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform vec2 uTexel;
  uniform float uRadius;
  uniform float uWeight;

  void main() {
    vec2 d = uTexel * uRadius;
    vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
    s += texture2D(tSrc, vUv + vec2(-d.x, 0.0)).rgb * 2.0;
    s += texture2D(tSrc, vUv + vec2( d.x, 0.0)).rgb * 2.0;
    s += texture2D(tSrc, vUv + vec2(0.0, -d.y)).rgb * 2.0;
    s += texture2D(tSrc, vUv + vec2(0.0,  d.y)).rgb * 2.0;
    s += texture2D(tSrc, vUv + vec2(-d.x, -d.y)).rgb;
    s += texture2D(tSrc, vUv + vec2( d.x, -d.y)).rgb;
    s += texture2D(tSrc, vUv + vec2(-d.x,  d.y)).rgb;
    s += texture2D(tSrc, vUv + vec2( d.x,  d.y)).rgb;
    gl_FragColor = vec4(s / 16.0 * uWeight, 1.0);
  }
`;

/**
 * The tube. Takes the inner world, the terminal canvas and bloom, and produces the image a
 * warm cathode-ray tube would show: barrel curvature, convergence error at the edges,
 * a rounded phosphor field that falls off into the bezel, scanlines and a tuning glitch.
 * Output stays linear HDR so it can be displayed directly or mapped onto the 3D screen.
 */
export const crtFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform sampler2D tScene;
  uniform sampler2D tOffice;
  uniform sampler2D tBeam;
  uniform float uBeam;
  uniform float uOffice;
  uniform vec3 uPortal;
  uniform sampler2D tBloom;
  uniform sampler2D tOS;
  uniform float uOS;
  uniform float uHasScene;
  uniform float uBloom;
  uniform float uTune;
  uniform float uFlash;
  uniform float uPower;
  uniform float uTime;
  uniform float uCurve;
  uniform float uCA;
  uniform float uScan;
  uniform float uRadius;
  uniform float uDpr;
  uniform float uFlicker;
  uniform float uDim;
  uniform float uBezel;
  uniform vec2 uRes;
  // the shape the picture is shown at: the glass's on the machine, the viewport's inside it
  uniform float uAspect;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  // barrel curvature, normalised so the four corners stay on the viewport's corners: the picture
  // bows like thick glass, and nothing from outside it is ever shown at the edges
  vec2 bend(vec2 c, float k) {
    float a = uAspect;
    float a2 = a * a;
    float r2 = (c.x * c.x * a2 + c.y * c.y) / (a2 + 1.0);
    return c * (1.0 + k * r2) / (1.0 + k);
  }

  float roundedMask(vec2 uv, out float sd) {
    vec2 css = vec2(uAspect, 1.0) * (uRes.y / uDpr);
    vec2 px = (uv - 0.5) * css;
    vec2 halfSize = 0.5 * css;
    vec2 d = abs(px) - (halfSize - uRadius);
    sd = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - uRadius;
    return 1.0 - smoothstep(-1.2, 0.6, sd);
  }

  void main() {
    vec2 c = vUv * 2.0 - 1.0;

    // tuning: rows tear sideways and the frame rolls while the channel changes
    float tune = uTune;
    if (tune > 0.001) {
      float row = floor(vUv.y * 110.0);
      float n = hash(vec2(row, floor(uTime * 30.0)));
      c.x += (n - 0.5) * 0.12 * tune * step(0.55, n);
      c.x += sin(vUv.y * 40.0 + uTime * 60.0) * 0.004 * tune;
      c.y += fract(uTime * 1.7) * 0.18 * tune * tune;
    }

    vec2 q = bend(c, uCurve);
    float r2 = dot(c, c) * 0.5;

    // convergence error grows towards the rim
    vec2 qr = q * (1.0 + uCA * r2);
    vec2 qb = q * (1.0 - uCA * r2);
    vec2 uv = q * 0.5 + 0.5;
    vec2 uvr = qr * 0.5 + 0.5;
    vec2 uvb = qb * 0.5 + 0.5;

    vec3 world = vec3(0.0);
    if (uHasScene > 0.5) {
      world.r = texture2D(tScene, uvr).r;
      world.g = texture2D(tScene, uv).g;
      world.b = texture2D(tScene, uvb).b;
      // the office, seen through the clock's hub: a round opening that grows until it is the view
      if (uOffice > 0.0) {
        vec3 office;
        office.r = texture2D(tOffice, uvr).r;
        office.g = texture2D(tOffice, uv).g;
        office.b = texture2D(tOffice, uvb).b;
        vec2 bt = 2.0 / uRes;
        vec3 beam = texture2D(tBeam, uv).rgb * 0.36
          + (texture2D(tBeam, uv + vec2(bt.x, 0.0)).rgb + texture2D(tBeam, uv - vec2(bt.x, 0.0)).rgb
          + texture2D(tBeam, uv + vec2(0.0, bt.y)).rgb + texture2D(tBeam, uv - vec2(0.0, bt.y)).rgb) * 0.16;
        office += beam * uBeam;
        float d = length((uv - uPortal.xy) * vec2(uRes.x / uRes.y, 1.0));
        float r = uPortal.z;
        float soft = max(0.002, r * 0.035);
        float inside = 1.0 - smoothstep(r - soft, r, d);
        // warm light spilling round the rim while it opens
        float rim = exp(-pow((d - r) / soft, 2.0)) * (1.0 - smoothstep(0.8, 1.2, r));
        world = mix(world, office, inside * uOffice) + vec3(1.0, 0.62, 0.3) * rim * 0.9 * uOffice;
      }
      world += texture2D(tBloom, uv).rgb * uBloom;
    }

    vec3 os;
    os.r = texture2D(tOS, uvr).r;
    os.g = texture2D(tOS, uv).g;
    os.b = texture2D(tOS, uvb).b;
    os *= 1.55;

    vec3 col = mix(world, os, uOS);

    // static while tuning
    float grain = hash(gl_FragCoord.xy + fract(uTime * 7.13) * 911.0);
    col = mix(col, vec3(grain) * vec3(1.0, 0.82, 0.62) * 0.9, clamp(tune * 0.7, 0.0, 1.0));

    // phosphor field: rounded, darkening into the bezel (the glass never tears, only the image);
    // only on the machine's own screen, seen from outside: inside, the picture runs to the edges
    float sd;
    float mask = mix(1.0, roundedMask(bend(vUv * 2.0 - 1.0, uCurve) * 0.5 + 0.5, sd), uBezel);
    float rim = smoothstep(-46.0, 0.0, sd) * uBezel;
    col *= 1.0 - rim * rim * 0.72;
    col *= 1.0 - 0.28 * pow(r2, 1.6) * uBezel;

    // scanlines on a 3 CSS px pitch, anchored to the viewport so the DOM glass can match them
    float y = gl_FragCoord.y / uDpr;
    float scan = 0.5 + 0.5 * cos(6.2831853 * y / 3.0);
    col *= mix(1.0, 0.8 + 0.2 * scan, uScan);

    col *= 1.0 + uFlicker * (0.012 * sin(uTime * 113.0) + 0.008 * sin(uTime * 7.3));
    col *= uDim;

    col = mix(col, vec3(4.2, 3.4, 2.4), uFlash);

    // powering up: the beam draws a bright line across the middle, then opens the picture
    if (uPower < 0.999) {
      vec2 cc = vUv * 2.0 - 1.0;
      float line = smoothstep(0.0, 0.4, uPower);
      float open = smoothstep(0.35, 1.0, uPower);
      float h = max(open, 0.006);
      float inside = step(abs(cc.y), h) * step(abs(cc.x), line);
      float beam = (1.0 - smoothstep(0.0, 0.02, abs(cc.y) - h * 0.5)) * step(abs(cc.x), line) * (1.0 - open);
      col = col * inside * (1.0 + (1.0 - open) * 2.0) + vec3(3.4, 2.6, 1.8) * beam * step(0.001, uPower);
    }

    gl_FragColor = vec4(col * mask, 1.0);
  }
`;

/** Present: optional bloom, vignette, exposure, tone mapping, sRGB, grain. */
export const finalFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tSrc;
  uniform sampler2D tBloom;
  uniform float uBloom;
  uniform float uVignette;
  uniform float uExposure;
  uniform float uGrain;
  uniform float uTone;
  uniform float uTime;
  uniform vec2 uRes;
  uniform sampler2D tRadio;
  uniform float uPan;
  uniform float uCurve;

  float hash(vec2 p) {
    p = fract(p * vec2(443.897, 441.423));
    p += dot(p, p.yx + 19.19);
    return fract((p.x + p.y) * p.x);
  }
  // the same lens as the tube's (see crtFrag), for the radio's room
  vec2 bend(vec2 c, float k) {
    float a = uRes.x / uRes.y;
    float a2 = a * a;
    float r2 = (c.x * c.x * a2 + c.y * c.y) / (a2 + 1.0);
    return c * (1.0 + k * r2) / (1.0 + k);
  }

  void main() {
    // the view swinging across to the radio: the page's picture goes off to the left as the
    // radio comes in from the right. The world itself turns (each camera is swung round where it
    // stands, see the director), so the radio stands in front of whatever the page was showing:
    // it is laid over it here (through the same lens), and the world behind it dims a little
    vec3 col = texture2D(tSrc, vUv).rgb;
    col += texture2D(tBloom, vUv).rgb * uBloom;
    vec2 c = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    col *= 1.0 - uVignette * smoothstep(0.25, 1.05, length(c));
    float tone = uTone;
    if (uPan > 0.0) {
      col *= 1.0 - 0.42 * uPan;
      vec4 r = texture2D(tRadio, bend(vUv * 2.0 - 1.0, uCurve) * 0.5 + 0.5);
      col = col * (1.0 - r.a) + r.rgb;
      tone = mix(uTone, 1.0, r.a);
    }
    col *= uExposure;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    // recordings are shown as they were made: no film curve on them
    gl_FragColor.rgb = mix(clamp(col, 0.0, 1.0), gl_FragColor.rgb, tone);
    #include <colorspace_fragment>
    float g = hash(gl_FragCoord.xy + fract(uTime) * 1000.0) - 0.5;
    gl_FragColor.rgb += g * uGrain;
  }
`;

/** How strongly the tube bows the picture: a clear fish-eye, like looking through thick glass. */
export const CURVE = 0.13;

/** The same curvature as the tube, for turning pointer coordinates into raycasts. */
export function bendPointer(x: number, y: number, k: number, aspect: number): [number, number] {
  const a2 = aspect * aspect;
  const r2 = (x * x * a2 + y * y) / (a2 + 1);
  const g = (1 + k * r2) / (1 + k);
  return [x * g, y * g];
}

/**
 * Light through the office window: a short march from the eye to whatever the pixel sees (the
 * depth of the office render), asking the sun's own shadow map at each step whether the sun
 * reaches that point. The window, its broken blinds and everything in the room cut the beams
 * exactly as they cut the light on the floor. Dust drifts through them; they are brightest
 * looking into the sun.
 */
export const beamFrag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDepth;
  uniform sampler2DShadow tShadow;
  uniform mat4 uProjInv;
  uniform mat4 uCamWorld;
  uniform mat4 uShadowMat;
  uniform vec3 uCamPos;
  uniform vec3 uSunDir;
  uniform vec3 uColor;
  uniform vec3 uBoxMin;
  uniform vec3 uBoxMax;
  uniform float uTime;
  uniform float uDensity;
  uniform int uSteps;

  float hash(vec2 p) {
    p = fract(p * vec2(233.34, 851.73));
    p += dot(p, p + 23.45);
    return fract(p.x * p.y);
  }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = dot(i, vec3(1.0, 57.0, 113.0));
    vec4 a = fract(sin(vec4(n, n + 1.0, n + 57.0, n + 58.0)) * 43758.5453);
    vec4 b = fract(sin(vec4(n + 113.0, n + 114.0, n + 170.0, n + 171.0)) * 43758.5453);
    vec4 m = mix(a, b, f.z);
    vec2 k = mix(m.xy, m.zw, f.y);
    return mix(k.x, k.y, f.x);
  }

  void main() {
    float z = texture2D(tDepth, vUv).r;
    vec4 v = uProjInv * vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
    v /= v.w;
    vec3 hit = (uCamWorld * v).xyz;
    vec3 ro = uCamPos;
    vec3 rd = hit - ro;
    float len = length(rd);
    rd /= len;
    // only inside the room
    vec3 inv = 1.0 / rd;
    vec3 t0 = (uBoxMin - ro) * inv;
    vec3 t1 = (uBoxMax - ro) * inv;
    vec3 tn = min(t0, t1);
    vec3 tf = max(t0, t1);
    float a = max(max(tn.x, tn.y), max(tn.z, 0.0));
    float b = min(min(tf.x, tf.y), min(tf.z, len));
    if (b <= a) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    float step = (b - a) / float(uSteps);
    // an ordered dither, turning a little each frame: even banding instead of sparkle
    vec2 bp = mod(floor(gl_FragCoord.xy), 4.0);
    float bayer = mod(bp.x * 4.0 + bp.y * 11.0 + floor(mod(uTime * 60.0, 16.0)) * 5.0, 16.0) / 16.0;
    float j = bayer;
    float acc = 0.0;
    for (int i = 0; i < 24; i++) {
      if (i >= uSteps) break;
      vec3 p = ro + rd * (a + (float(i) + j) * step);
      vec4 sc = uShadowMat * vec4(p, 1.0);
      float lit = texture(tShadow, vec3(sc.xy, sc.z - 0.0015));
      float dust = 0.45 + 0.9 * noise(p * 2.2 + vec3(uTime * 0.04, -uTime * 0.02, uTime * 0.03));
      acc += lit * dust;
    }
    // brightest looking into the light, like dust in a real beam
    float mu = max(dot(rd, -uSunDir), 0.0);
    float phase = 0.35 + 1.6 * pow(mu, 6.0) + 0.5 * pow(mu, 1.5);
    gl_FragColor = vec4(uColor * acc * step * uDensity * phase, 1.0);
  }
`;
