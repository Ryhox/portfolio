import * as THREE from 'three';

/**
 * The painting in the oval: an oil portrait lit like a gallery wall, with a varnish sheen that
 * follows the pointer. Hovering it brings up a watchmaker's loupe: inside the lens the paint gives
 * way to an engraving of the same picture, computed per pixel (Sobel edges and tone-driven hatching),
 * magnified, with a brass rim and a little colour fringing at the glass edge.
 */
const vert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const frag = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tPaint;
  uniform vec2 uCover;
  uniform vec2 uLoupe;     // lens centre in the oval's uv
  uniform float uOpen;     // 0..1 lens size
  uniform float uAspect;   // oval width / height
  uniform vec2 uTexel;
  uniform float uTime;
  uniform float uLight;

  uniform vec2 uShift;     // keeps the face in the frame

  vec2 paintUv(vec2 uv) { return (uv - 0.5) * uCover + 0.5 + uShift; }
  float lum(vec2 uv) { return dot(texture2D(tPaint, paintUv(uv)).rgb, vec3(0.299, 0.587, 0.114)); }

  float hatch(vec2 p, float angle, float freq, float width) {
    vec2 d = vec2(cos(angle), sin(angle));
    float v = abs(fract(dot(p, d) * freq) - 0.5) * 2.0;
    return 1.0 - smoothstep(width - 0.08, width + 0.08, v);
  }

  vec3 engraving(vec2 uv) {
    float l = lum(uv);
    vec2 t = uTexel;
    float gx = -lum(uv + vec2(-t.x, t.y)) - 2.0 * lum(uv + vec2(-t.x, 0.0)) - lum(uv + vec2(-t.x, -t.y))
             + lum(uv + vec2(t.x, t.y)) + 2.0 * lum(uv + vec2(t.x, 0.0)) + lum(uv + vec2(t.x, -t.y));
    float gy = -lum(uv + vec2(-t.x, -t.y)) - 2.0 * lum(uv + vec2(0.0, -t.y)) - lum(uv + vec2(t.x, -t.y))
             + lum(uv + vec2(-t.x, t.y)) + 2.0 * lum(uv + vec2(0.0, t.y)) + lum(uv + vec2(t.x, t.y));
    float edge = smoothstep(0.08, 0.35, length(vec2(gx, gy)));
    vec2 p = uv * vec2(uAspect, 1.0) * 1.0;
    float dark = 1.0 - l;
    float ink = 0.0;
    ink = max(ink, hatch(p, 0.785, 110.0, dark * 0.9) * step(0.25, dark));
    ink = max(ink, hatch(p, -0.785, 110.0, (dark - 0.35) * 1.1) * step(0.5, dark));
    ink = max(ink, hatch(p, 0.0, 150.0, (dark - 0.6) * 1.2) * step(0.72, dark));
    ink = max(ink, edge);
    vec3 paper = vec3(0.93, 0.87, 0.75);
    vec3 inkCol = vec3(0.17, 0.11, 0.07);
    return mix(paper, inkCol, clamp(ink, 0.0, 1.0));
  }

  void main() {
    vec2 uv = vUv;
    vec3 col = texture2D(tPaint, paintUv(uv)).rgb;
    // gallery light: brighter at the top, falling off to the oval's rim
    vec2 c = (uv - 0.5) * vec2(uAspect, 1.0);
    col *= 0.78 + 0.32 * smoothstep(-0.6, 0.6, uv.y - 0.1);
    col *= 1.0 - 0.9 * pow(length(c) * 1.1, 3.0);
    // varnish: a soft band of sheen that slides with the loupe
    float sheen = smoothstep(0.22, 0.0, abs(uv.x + uv.y * 0.6 - uLoupe.x - uLoupe.y * 0.6));
    col += vec3(1.0, 0.92, 0.78) * sheen * 0.05;

    // the loupe
    float R = 0.19 * uOpen;
    vec2 d = (uv - uLoupe) * vec2(uAspect, 1.0);
    float r = length(d);
    if (uOpen > 0.01) {
      // a soft shadow the lens casts on the canvas
      col *= 1.0 - 0.45 * smoothstep(R + 0.05, R, r) * step(R, r);
      if (r < R) {
        float k = r / R;
        // magnify, with a barrel profile towards the rim
        vec2 luv = uLoupe + (uv - uLoupe) * (0.55 + 0.25 * k * k);
        vec3 e = engraving(luv);
        // chromatic fringe at the glass edge
        float fr = smoothstep(0.75, 1.0, k);
        vec3 er = engraving(uLoupe + (uv - uLoupe) * (0.56 + 0.25 * k * k));
        vec3 eb = engraving(uLoupe + (uv - uLoupe) * (0.54 + 0.25 * k * k));
        e = mix(e, vec3(er.r, e.g, eb.b), fr);
        e *= 1.0 - 0.25 * k * k;
        col = e;
      }
      // the brass rim
      float rim = smoothstep(0.014, 0.0, abs(r - R - 0.008));
      float glint = 0.6 + 0.4 * sin(atan(d.y, d.x) * 2.0 + 0.8);
      col = mix(col, vec3(0.86, 0.6, 0.3) * (0.6 + 0.8 * glint), rim);
    }
    gl_FragColor = vec4(col * uLight, 1.0);
  }
`;

export function portraitMaterial(paint: THREE.Texture, photoAspect: number) {
  const img = paint.image as { width?: number; height?: number } | undefined;
  const ia = img?.width && img.height ? img.width / img.height : 0.75;
  // cover-fit the painting into the oval, a little closer than the full sitter, framed on the face
  const ZOOM = 0.86;
  const FACE = new THREE.Vector2(0.5, 0.705); // in the painting's uv (y up)
  const AT = new THREE.Vector2(0.5, 0.6); // where the face sits in the frame
  const cover = (ia > photoAspect ? new THREE.Vector2(photoAspect / ia, 1) : new THREE.Vector2(1, ia / photoAspect)).multiplyScalar(ZOOM);
  const shift = new THREE.Vector2(
    THREE.MathUtils.clamp(FACE.x - (0.5 + (AT.x - 0.5) * cover.x), -(0.5 - cover.x / 2), 0.5 - cover.x / 2),
    THREE.MathUtils.clamp(FACE.y - (0.5 + (AT.y - 0.5) * cover.y), -(0.5 - cover.y / 2), 0.5 - cover.y / 2),
  );
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    uniforms: {
      tPaint: { value: paint },
      uCover: { value: cover },
      uShift: { value: shift },
      uLoupe: { value: new THREE.Vector2(0.5, 0.55) },
      uOpen: { value: 0 },
      uAspect: { value: photoAspect },
      uTexel: { value: new THREE.Vector2(1 / 768, 1 / 1024) },
      uTime: { value: 0 },
      uLight: { value: 1 },
    },
    toneMapped: false,
  });
}
