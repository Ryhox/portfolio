import * as THREE from 'three';
import { TAU } from '@/lib/math';

/**
 * The film inside the old camera: a strip wound in an endless spiral, punched with sprocket holes
 * top and bottom. Seen from the front, it comes up out of the dark at the bottom left, sweeps
 * across in front of the view (the frame at the gate in the middle, biggest), and goes away round
 * the back at the top right, where its next turn shows faintly behind. Everything on it is drawn
 * by one shader, so the frames can develop, decode into type and catch the lamp without any
 * extra geometry.
 */
export const RADIUS = 1;
/** frames to a turn of the spiral, and one frame's arc */
export const TURN = 10;
export const STEP = TAU / TURN;
/** how far the spiral rises in a turn (so a frame's top and bottom slope up to the right, its sides stay upright) */
export const LEAD = 1.26 * RADIUS;
/**
 * Round the back the strip runs further off than a circle would (the far turn is small and faint),
 * and climbs (or, before the gate, drops) more steeply, so the next turn shows over the front one
 * and the strip's start bends away down and behind it.
 */
const DEEP = 2.6;
const CLIMB = 0.55 * RADIUS;

/**
 * The strip is nearly flat across the gate (the frame there and half its neighbours face the view
 * almost square), and bends harder further out, so a half turn still takes five frames and the
 * spiral closes as before. How sharply it bends: a fraction of a circle's curvature at the gate,
 * rising to more than a circle's from RAMP0 to RAMP1 frames out.
 */
const FLAT = 0.3;
const BOOST = 1.2;
const RAMP0 = 0.5;
const RAMP1 = 1.7;
const SAMPLES = 32;

/** Which way the strip runs at u frames from the gate (0 = straight across): the angle round the spiral. */
export function heading(u: number) {
  const v = Math.abs(u);
  const x = Math.min(1, Math.max(0, (v - RAMP0) / (RAMP1 - RAMP0)));
  const ramp = v <= RAMP0 ? 0 : v >= RAMP1 ? (RAMP1 - RAMP0) * 0.5 + (v - RAMP1) : (RAMP1 - RAMP0) * (x ** 3 - x ** 4 / 2);
  return Math.sign(u) * STEP * (FLAT * v + (BOOST - FLAT) * ramp);
}

/**
 * Where the strip is at u frames from the gate (drum space: the gate at z = RADIUS): walked along
 * its length, so every frame is the same width however the strip bends; its height (the spiral's
 * climb), and the angle round the spiral there.
 */
export function stripAt(u: number) {
  let sx = 0;
  let sz = 0;
  const du = u / SAMPLES;
  for (let i = 0; i < SAMPLES; i++) {
    const t = heading((i + 0.5) * du);
    sx += Math.cos(t) * du;
    sz += Math.sin(t) * du;
  }
  const a = heading(u);
  // how far round the back it is (a whole turn on, it is at the front again, a turn higher)
  const back = smooth(0.42 * Math.PI, Math.PI, Math.abs(Math.atan2(Math.sin(a), Math.cos(a))));
  return {
    x: ARC * sx,
    y: (a * LEAD) / TAU + Math.sign(a) * CLIMB * back,
    z: (RADIUS - ARC * sz) * (1 + DEEP * back),
    a,
  };
}
function smooth(e0: number, e1: number, v: number) {
  const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
/** across a frame: the black frame line at each side (fraction of its width) */
const EDGE = 0.028;
/** up a frame: the perforated margin, and the clear strip between it and the picture (fractions of its height) */
const MARG = 0.125;
const GAP = 0.016;
const HOLES = 6;
/** the picture's shape (a tall frame, like shader.se's); the band is as tall as that makes it */
export const ASPECT = 1.4;
const ARC = RADIUS * STEP;
const IMG_W = ARC * (1 - 2 * EDGE);
const IMG_H = IMG_W / ASPECT;
export const BAND = IMG_H / (1 - 2 * MARG - 2 * GAP);
/** the picture's half extents: its half width (in frames along the strip), its half height; and where the film's edge is */
export const PICTURE = { half: 0.5 - EDGE, h: IMG_H / 2, film: BAND / 2 };

/** The browser's bar over the top of a picture, as a fraction of its height. */
const BAR_H = 0.09;

/** Characters from empty to full, for the decode. */
export const GLYPHS = ' .:-=+*/<>{}[]()#%&@';

const vert = /* glsl */ `
  #define PI 3.141592653589793
  uniform float uU;
  uniform mat4 uDrum;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vP;
  varying float vU;
  // (the same as heading() in film.ts)
  float heading(float u) {
    float v = abs(u);
    float x = clamp((v - ${RAMP0.toFixed(4)}) / ${(RAMP1 - RAMP0).toFixed(4)}, 0.0, 1.0);
    float ramp = v <= ${RAMP0.toFixed(4)} ? 0.0 : v >= ${RAMP1.toFixed(4)} ? ${((RAMP1 - RAMP0) * 0.5).toFixed(4)} + (v - ${RAMP1.toFixed(4)}) : ${(RAMP1 - RAMP0).toFixed(4)} * (x * x * x - x * x * x * x * 0.5);
    return sign(u) * ${STEP.toFixed(6)} * (${FLAT.toFixed(4)} * v + ${(BOOST - FLAT).toFixed(4)} * ramp);
  }
  void main() {
    vUv = uv;
    // the strip, walked along for every vertex (see stripAt() in film.ts), so it runs on without
    // a step between frames, lies nearly flat across the gate and bends away round the back
    float u = uU + (uv.x - 0.5);
    vU = u;
    float sx = 0.0;
    float sz = 0.0;
    float du = u / ${SAMPLES.toFixed(1)};
    for (int i = 0; i < ${SAMPLES}; i++) {
      float t = heading((float(i) + 0.5) * du);
      sx += cos(t) * du;
      sz += sin(t) * du;
    }
    float a = heading(u);
    float back = smoothstep(0.42 * PI, PI, abs(atan(sin(a), cos(a))));
    float deep = 1.0 + ${DEEP.toFixed(4)} * back;
    vec3 p = vec3(
      ${ARC.toFixed(6)} * sx,
      position.y + a * ${(LEAD / TAU).toFixed(6)} + sign(a) * ${CLIMB.toFixed(4)} * back,
      (${RADIUS.toFixed(4)} - ${ARC.toFixed(6)} * sz) * deep
    );
    vec4 wp = uDrum * vec4(p, 1.0);
    vP = wp.xyz;
    vN = normalize(mat3(uDrum) * vec3(sin(a) * deep, 0.0, cos(a)));
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const frag = /* glsl */ `
  precision highp float;
  uniform sampler2D tMap;
  uniform sampler2D tGlyphs;
  uniform vec2 uSize;
  uniform vec4 uLayout;
  uniform float uTexAspect;
  uniform float uDecode;
  uniform vec2 uFocus;
  uniform float uGate;
  uniform float uCode;
  uniform float uLive;
  uniform float uNone;
  uniform float uTime;
  uniform float uSeed;
  uniform float uFade;
  uniform float uVis;
  uniform sampler2D tBar;
  uniform float uBar;
  uniform float uLoad;
  uniform float uClear;
  uniform float uCut;
  varying float vU;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vP;

  #define GLYPHS ${GLYPHS.length.toFixed(1)}

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  vec3 toLinear(vec3 c) {
    return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
  }
  vec3 picture(vec2 uv) {
    vec3 c = texture2D(tMap, uv).rgb;
    return mix(c, toLinear(c), uDecode);
  }
  // object-fit: cover, with the recording's own focus
  vec2 cover(vec2 iuv, float fa) {
    vec2 s = fa > uTexAspect ? vec2(1.0, uTexAspect / fa) : vec2(fa / uTexAspect, 1.0);
    return iuv * s + (1.0 - s) * uFocus;
  }

  void main() {
    // the strip starts at the bend on the left, where it turns away from the view
    if (vU < uCut) discard;
    float edge = uLayout.x;
    float marg = uLayout.y;
    float gap = uLayout.z;
    float holes = uLayout.w;
    vec2 P = vUv * uSize;
    float H = uSize.y;

    // the perforations are punched through: the drum and whatever is behind it show there
    float mv = marg * H;
    if (P.y < mv || P.y > H - mv) {
      float cw = uSize.x / holes;
      vec2 hc = vec2((floor(P.x / cw) + 0.5) * cw, P.y < mv ? mv * 0.5 : H - mv * 0.5);
      vec2 hh = vec2(cw * 0.25, mv * 0.3);
      float rr = min(hh.x, hh.y) * 0.5;
      vec2 d = abs(P - hc) - (hh - rr);
      if (length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - rr < 0.0) discard;
    }

    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vP);
    bool outside = gl_FrontFacing;
    if (!outside) N = -N;
    float facing = clamp(dot(N, V), 0.0, 1.0);

    // the celluloid: nearly black, a little amber where it is thin
    vec3 col = vec3(0.03, 0.02, 0.013);
    float ex = min(vUv.x, 1.0 - vUv.x);
    // the edge print: a tick at every frame line, and a short code beside it
    if (P.y < mv || P.y > H - mv) {
      float nearTop = step(H - mv, P.y);
      float y = nearTop > 0.5 ? (H - P.y) / mv : P.y / mv;
      float tick = step(ex, 0.012) * step(0.12, y) * step(y, 0.88);
      col += vec3(0.5, 0.26, 0.08) * tick * 0.6;
    }

    vec2 lo = vec2(edge, marg + gap);
    vec2 hi = vec2(1.0 - edge, 1.0 - marg - gap);
    vec2 iuv = (vUv - lo) / (hi - lo);
    bool inPic = all(greaterThanEqual(iuv, vec2(0.0))) && all(lessThanEqual(iuv, vec2(1.0)));
    // on the way out the picture at the gate clears, like film with nothing on it, until it is
    // an opening: what stands behind the film shows through it
    if (inPic && uClear >= 1.0) discard;
    if (inPic) {
      float fa = (uSize.x * (hi.x - lo.x)) / (uSize.y * (hi.y - lo.y));
      vec3 img = picture(cover(iuv, fa));
      float l = dot(img, vec3(0.2126, 0.7152, 0.0722));
      vec3 sepia = vec3(l) * vec3(1.2, 0.9, 0.6);
      // away from the gate the frames are only exposed, not yet developed
      img = mix(sepia * 0.7, img, uGate);
      img = mix(img, sepia * 0.5, uNone);
      // the lamp: the picture a little brighter while its live demo is pointed at
      img *= 1.0 + 0.15 * uLive;
      // projected film is darker toward its corners
      vec2 e = min(iuv, 1.0 - iuv) * vec2(fa, 1.0);
      img *= mix(0.7, 1.0, smoothstep(0.0, 0.22, min(e.x, e.y)));
      // now and then a scratch runs down it
      // (a hash that does not repeat across the columns, or one scratch would come with its twins)
      float tick = mod(floor(uTime * 9.0), 157.0) + fract(uSeed * 0.137) * 50.0;
      float sc = step(0.9994, fract(sin(dot(vec2(floor(iuv.x * 300.0), tick), vec2(12.9898, 78.233))) * 43758.5453));
      img += vec3(0.9, 0.8, 0.62) * sc * 0.035;

      // the source: the picture decodes into type, left to right, a band of noise riding the edge
      if (uCode > 0.001) {
        float cols = 58.0;
        vec2 grid = vec2(cols, floor(cols * 0.6 / fa + 0.5));
        vec2 cell = floor(iuv * grid);
        vec2 cuv = fract(iuv * grid);
        float front = uCode * (cols + 16.0) - 8.0;
        float dx = cell.x - front;
        if (dx < 2.5) {
          vec3 cc = picture(cover((cell + 0.5) / grid, fa));
          float lum = pow(clamp(dot(cc, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0), 1.0 / 2.2);
          bool noise = abs(dx) < 2.5;
          float gi = noise
            ? 1.0 + floor(hash(cell + floor(uTime * 30.0)) * (GLYPHS - 1.0))
            : floor(clamp(pow(max(0.0, lum - 0.08) / 0.92, 0.85), 0.0, 0.999) * GLYPHS);
          float g = texture2D(tGlyphs, vec2((gi + clamp(cuv.x, 0.02, 0.98)) / GLYPHS, cuv.y)).r;
          vec3 ink = vec3(0.022, 0.015, 0.01);
          vec3 type = noise ? vec3(1.6, 1.35, 1.0) : mix(vec3(0.95, 0.66, 0.32), cc * 1.25 + 0.1, 0.4);
          img = mix(ink, type, g);
        }
      }

      // a browser's bar, dropped over the top of the picture while a button is pointed at: it is
      // drawn on the film itself, so it sits on the picture's edge however the strip bends
      if (uBar > 0.001) {
        float bh = ${BAR_H.toFixed(4)};
        float foot = 1.0 - bh + (1.0 - uBar) * bh;
        float bv = (iuv.y - foot) / bh;
        if (bv >= 0.0) {
          img = texture2D(tBar, vec2(iuv.x, min(bv, 1.0))).rgb;
          // the page loading: a brass line run along its foot
          img = mix(img, vec3(0.93, 0.62, 0.26), step(bv, 0.045) * step(iuv.x, uLoad));
        } else {
          img *= 1.0 - 0.45 * uBar * smoothstep(0.035, 0.0, foot - iuv.y);
        }
      }
      col = img;
    }

    // lit from the front by the camera's lamp: the far side of the loop and its inside are in shadow
    float shade = outside ? mix(0.4, 1.0, facing) : 0.3 * mix(0.5, 1.0, facing);
    col *= shade;
    // the celluloid's gloss
    vec3 L = normalize(vec3(-0.35, 0.8, 0.5));
    float spec = pow(max(dot(N, normalize(L + V)), 0.0), 40.0);
    col += vec3(1.0, 0.82, 0.58) * spec * (inPic ? 0.06 : 0.3) * (outside ? 1.0 : 0.25);
    gl_FragColor = vec4(col * uFade, uVis * (inPic ? 1.0 - uClear : 1.0));
  }
`;

export type FrameUniforms = {
  tMap: { value: THREE.Texture | null };
  uTexAspect: { value: number };
  uDecode: { value: number };
  uFocus: { value: THREE.Vector2 };
  uGate: { value: number };
  uCode: { value: number };
  uLive: { value: number };
  uNone: { value: number };
  uSeed: { value: number };
  uVis: { value: number };
  uU: { value: number };
  uBar: { value: number };
  uLoad: { value: number };
  uClear: { value: number };
};

/** What every frame shares (one object each, so a change reaches all of them). */
export function sharedUniforms(glyphs: THREE.Texture, bar: THREE.Texture) {
  return {
    tGlyphs: { value: glyphs },
    tBar: { value: bar },
    uSize: { value: new THREE.Vector2(ARC, BAND) },
    uLayout: { value: new THREE.Vector4(EDGE, MARG, GAP, HOLES) },
    /** the drum's place in the world (the frames place themselves on it) */
    uDrum: { value: new THREE.Matrix4() },
    uTime: { value: 0 },
    uFade: { value: 1 },
    /** where the strip starts (frames from the gate; see the reel) */
    uCut: { value: -99 },
  };
}

export function frameMaterial(shared: ReturnType<typeof sharedUniforms>, seed: number) {
  const own: FrameUniforms = {
    tMap: { value: null },
    uTexAspect: { value: 16 / 9 },
    uDecode: { value: 0 },
    uFocus: { value: new THREE.Vector2(0.5, 0.5) },
    uGate: { value: 0 },
    uCode: { value: 0 },
    uLive: { value: 0 },
    uNone: { value: 0 },
    uSeed: { value: seed },
    uVis: { value: 1 },
    uU: { value: 0 },
    uBar: { value: 0 },
    uLoad: { value: 0 },
    uClear: { value: 0 },
  };
  const m = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: { ...shared, ...own },
    side: THREE.DoubleSide,
    // the ends fade into the dark: blended, but drawn in one pass (see lib/models) and still
    // writing depth, so the strip in front hides what is behind it
    transparent: true,
    forceSinglePass: true,
  });
  return { material: m, u: own };
}

/** One frame of the band, centred on the front of the drum (turn it into place). */
export function frameGeometry() {
  return new THREE.CylinderGeometry(RADIUS, RADIUS, BAND, 24, 1, true, -STEP / 2, STEP);
}

/** The font a CSS custom property names (next/font gives each family a generated name). */
function family(prop: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(prop).trim();
  return v || fallback;
}

/** The decode's type: every glyph in a row, white on black, in the site's mono face. */
export function glyphAtlas() {
  const cw = 40;
  const ch = 64;
  const c = document.createElement('canvas');
  c.width = cw * GLYPHS.length;
  c.height = ch;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  const draw = (font: string) => {
    const g = c.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#fff';
    g.font = `700 ${Math.round(ch * 0.62)}px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    Array.from(GLYPHS).forEach((s, i) => g.fillText(s, i * cw + cw / 2, ch * 0.54));
    t.needsUpdate = true;
  };
  const mono = family('--font-martian', 'ui-monospace, monospace');
  draw(mono);
  document.fonts?.load(`700 40px ${mono}`).then(() => draw(mono)).catch(() => {});
  return t;
}

/**
 * The browser's bar that drops over the picture while a button is pointed at: three brass studs
 * where the lamps would be, and the address field, its address typed in so far. Redrawn as it types.
 */
export function browserBar() {
  const W = 1872;
  const H = Math.round((W * BAR_H) / ASPECT);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  const mono = family('--font-martian', 'monospace');
  const draw = (text: string, typed: number, caret: boolean) => {
    const g = c.getContext('2d')!;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#231a12');
    bg.addColorStop(1, '#140e09');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(201, 154, 88, 0.75)';
    g.fillRect(0, H - 3, W, 3);
    const cy = H / 2;
    const r = H * 0.1;
    for (let i = 0; i < 3; i++) {
      const x = H * 0.42 + i * r * 2.9;
      const s = g.createRadialGradient(x - r * 0.3, cy - r * 0.35, r * 0.1, x, cy, r);
      s.addColorStop(0, '#f6dca6');
      s.addColorStop(0.5, '#c99a58');
      s.addColorStop(1, '#6e4a22');
      g.fillStyle = s;
      g.beginPath();
      g.arc(x, cy, r, 0, TAU);
      g.fill();
    }
    // the address field
    const fx = H * 0.42 + 2 * r * 2.9 + r * 2.6;
    const fh = H * 0.62;
    g.fillStyle = '#0b0806';
    g.strokeStyle = 'rgba(201, 154, 88, 0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.roundRect(fx, cy - fh / 2, W - fx - H * 0.4, fh, fh * 0.14);
    g.fill();
    g.stroke();
    // a padlock
    const lx = fx + fh * 0.45;
    g.strokeStyle = '#c99a58';
    g.fillStyle = '#c99a58';
    g.lineWidth = fh * 0.07;
    g.beginPath();
    g.arc(lx, cy - fh * 0.08, fh * 0.13, Math.PI, 0);
    g.stroke();
    g.fillRect(lx - fh * 0.18, cy - fh * 0.08, fh * 0.36, fh * 0.28);
    // what has been typed so far, and the caret after it
    g.fillStyle = '#ebe1cb';
    g.font = `500 ${Math.round(fh * 0.5)}px ${mono}`;
    g.textBaseline = 'middle';
    const shown = text.slice(0, typed);
    const tx = lx + fh * 0.42;
    g.fillText(shown, tx, cy + 1);
    if (caret) g.fillRect(tx + g.measureText(shown).width + 3, cy - fh * 0.28, 3, fh * 0.56);
    t.needsUpdate = true;
  };
  draw('', 0, false);
  return { texture: t, draw };
}

/** GitHub's mark, on a 24 unit square. */
const GITHUB =
  'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';

/**
 * The last plate, "And much more": a big GitHub mark in brass, the words under it, and the
 * address, in the site's own type.
 */
export function titleCard(lines: { title: string; foot: string }) {
  const W = 1280;
  const H = Math.round(W / ASPECT);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  const display = family('--font-shoulders', 'Impact, sans-serif');
  const mono = family('--font-martian', 'monospace');
  const draw = () => {
    const g = c.getContext('2d')!;
    const bg = g.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H / 2, W * 0.62);
    bg.addColorStop(0, '#2a1d12');
    bg.addColorStop(1, '#0c0805');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // the mark
    // (all of it in the upper part: the picture's buttons sit in its bottom-right corner)
    const size = H * 0.3;
    g.save();
    g.translate(W / 2 - size / 2, H * 0.08);
    g.scale(size / 24, size / 24);
    const brass = g.createLinearGradient(0, 0, 0, 24);
    brass.addColorStop(0, '#f6dca6');
    brass.addColorStop(0.5, '#c99a58');
    brass.addColorStop(1, '#8e6634');
    g.fillStyle = brass;
    g.fill(new Path2D(GITHUB));
    g.restore();
    g.fillStyle = '#ebe1cb';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = `800 ${Math.round(H * 0.18)}px ${display}`;
    g.fillText(lines.title.toUpperCase(), W / 2, H * 0.58);
    g.fillStyle = '#c99a58';
    g.font = `500 ${Math.round(H * 0.045)}px ${mono}`;
    g.fillText(lines.foot, W / 2, H * 0.68);
    t.needsUpdate = true;
  };
  draw();
  Promise.all([document.fonts?.load(`800 150px ${display}`), document.fonts?.load(`500 26px ${mono}`)])
    .then(draw)
    .catch(() => {});
  return t;
}
