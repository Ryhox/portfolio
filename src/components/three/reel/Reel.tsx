'use client';

import { useTexture } from '@react-three/drei';
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { projects } from '@/content/projects';
import { clamp, damp, lerp, smoothstep } from '@/lib/math';
import { office } from '@/lib/office';
import { PLATES, reel, wind } from '@/lib/reel';
import { rig } from '@/lib/rig';
import { toScreen, toScreenFar } from '../pipeline/project';
import { CURVE, bendPointer } from '../pipeline/shaders';
import { setCursor } from '../works/util';
import { ASPECT, PICTURE, RADIUS, browserBar, frameGeometry, heading, stripAt, frameMaterial, glyphAtlas, sharedUniforms, titleCard } from './film';

/**
 * how far the view stands from the gate, in spiral radii: close, so the strip runs away steeply
 * past its flat middle and bends round inside the view at both sides
 */
const DIST = 1.2;
const HALF = stripAt(PICTURE.half).x;
/**
 * Where the strip starts: at the bend on the left, the point where it turns away from the view
 * (seen edge-on there, so it simply ends at the bend). To the right it goes on round the back.
 */
const CUT = (() => {
  let at = 0;
  let left = 0;
  for (let u = 0; u > -8; u -= 0.02) {
    const p = stripAt(u);
    const x = p.x / (DIST + RADIUS - p.z);
    if (x < left) {
      left = x;
      at = u;
    }
  }
  return at;
})();
/**
 * frames kept on the strip: back to where it starts at the left bend, and on a whole turn to the
 * right, so there it never stops in sight (it goes on round the back and up out of the view)
 */
const BEHIND = 5;
const POOL = 17;
const DEG = Math.PI / 180;

/**
 * The way out (lib/reel's `leave`): the view goes into the picture at the gate, which clears as it
 * comes, and on through the film, stopping THROUGH past it (in spiral radii). The last screen
 * stands behind the film, as far back as makes it FAR of its size from where the view starts.
 */
const THROUGH = 0.25;
const FAR = 0.5;
const BACK = (FAR * DIST + THROUGH) / (1 - FAR);
/** points to a side of the picture's outline (the opening the last screen is seen through) */
const SIDE = 8;

/** Whether an outline (x, y, x, y, … in px) is wider than the whole view: its four corners lie inside it. */
function covers(pts: number[], w: number, h: number) {
  for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]]) {
    let inside = false;
    for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
      if (pts[i + 1] > y !== pts[j + 1] > y && x < ((pts[j] - pts[i]) * (y - pts[i + 1])) / (pts[j + 1] - pts[i + 1]) + pts[i]) inside = !inside;
    }
    if (!inside) return false;
  }
  return true;
}

/**
 * How much of a frame shows: all of it, everywhere (the far side of the spiral is simply in shadow,
 * see the film's shader); only past a whole turn, well out of sight, is it let go.
 */
function visibility(a: number) {
  return 1 - smoothstep(380 * DEG, 420 * DEG, Math.abs(a));
}

type Film = { video: HTMLVideoElement; tex: THREE.VideoTexture; ready: boolean; rolling: boolean; offAt: number; seen: number };

/**
 * Behind the film: nothing but the dark inside of the camera, warming toward the bottom where the
 * lamp's light falls, and a little light behind the gate. Drawn behind everything, as the view's
 * background.
 */
function makeBackdrop() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uAspect: { value: 1 }, uShow: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy * 2.0, 0.99999, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec2 vUv;
      uniform float uAspect;
      uniform float uShow;
      void main() {
        // (linear light: these are the site's soot at the top and a lamp-lit umber at the foot)
        vec3 top = vec3(0.0026, 0.0019, 0.0014);
        vec3 low = vec3(0.034, 0.017, 0.0075);
        vec3 col = mix(low, top, smoothstep(0.0, 0.9, vUv.y));
        vec2 c = (vUv - vec2(0.5, 0.46)) * vec2(uAspect, 1.0);
        col += vec3(0.016, 0.009, 0.0045) * exp(-dot(c, c) * 2.2);
        gl_FragColor = vec4(col, uShow);
      }
    `,
    depthWrite: false,
    // (on the way out it gives way to the inner world, drawn under it)
    transparent: true,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

/** Dust in the lamp's light, drifting round the loop. */
function makeDust(count: number) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  const s = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = RADIUS * (0.4 + Math.random() * 1.4);
    p[i * 3] = Math.sin(a) * r;
    p[i * 3 + 1] = (Math.random() - 0.5) * 1.6;
    p[i * 3 + 2] = Math.cos(a) * r;
    s[i] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uFade: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime;
      uniform float uPx;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime * (0.04 + seed * 0.05);
        p += vec3(sin(t + seed * 30.0) * 0.2, sin(t * 0.8 + seed * 11.0) * 0.12, cos(t * 0.9 + seed * 7.0) * 0.2);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vA = (0.25 + 0.75 * seed) * (0.6 + 0.4 * sin(uTime * (0.6 + seed) + seed * 20.0));
        gl_Position = projectionMatrix * mv;
        // (a speck the view flies close by stays a speck)
        gl_PointSize = min(uPx * (0.8 + seed * 1.8) / -mv.z, uPx * 4.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      uniform float uFade;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0, 0.72, 0.42) * a * 0.35 * uFade, 1.0);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  return pts;
}


/**
 * Inside the old camera: the works on a loop of film. The scroll turns the loop a frame at a time
 * (lib/reel), the frame at the gate is developed and running, and the buttons under it change it:
 * "Source code" decodes it into type, "Live demo" throws the lamp on it, "No live demo" leaves it
 * undeveloped. Where the gate is on screen is handed to the page, so the buttons sit under it.
 */
export default function Reel() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const posters = useTexture(projects.map((p) => p.poster));

  const built = useMemo(() => {
    for (const t of posters) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
    }
    const glyphs = glyphAtlas();
    const card = titleCard({ title: 'And much more', foot: 'github.com/Ryhox' });
    const bar = browserBar();
    const shared = sharedUniforms(glyphs, bar.texture);
    shared.uCut.value = CUT;
    const geo = frameGeometry();
    // the pivot is the gate, so leaning the loop toward the pointer leaves the gate where it is
    // (put together in the JSX below, so the frames can take the pointer)
    const pivot = new THREE.Group();
    const loop = new THREE.Group();
    loop.position.z = -RADIUS;
    const drum = new THREE.Group();
    // a handful of frames, handed along the spiral as the film moves: the strip never ends
    const frames = Array.from({ length: POOL }, (_, j) => {
      const { material, u } = frameMaterial(shared, j * 7.31);
      const mesh = new THREE.Mesh(geo, material);
      // the shader places the frame on the spiral; the mesh's own place is only for the pointer
      mesh.frustumCulled = false;
      mesh.userData.plate = 0;
      mesh.userData.k = 0;
      return { mesh, u, plate: 0, k: 0 };
    });
    const backdrop = makeBackdrop();
    const dust = makeDust(70);
    return { pivot, loop, drum, frames, shared, glyphs, card, bar, backdrop, dust };
  }, [posters]);

  // the recordings: made when first needed, one running at a time
  const films = useMemo(() => new Map<number, Film>(), []);
  const fx = useMemo(() => ({ code: 0, live: 0, none: 0, plate: -1 }), []);
  // the browser's bar: the address it shows, since when, how far it has dropped, what was drawn
  const bar = useMemo(() => ({ want: '', text: '', since: 0, drop: 0, drawn: '' }), []);
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), s: [0, 0] as [number, number], m: new THREE.Matrix4() }), []);

  useEffect(() => {
    const onHidden = () => {
      if (!document.hidden) return;
      films.forEach((f) => {
        f.rolling = false;
        f.video.pause();
      });
    };
    document.addEventListener('visibilitychange', onHidden);
    reel.loaded = true;
    return () => {
      reel.loaded = false;
      document.removeEventListener('visibilitychange', onHidden);
      films.forEach((f) => {
        f.video.pause();
        f.video.removeAttribute('src');
        f.video.load();
        f.tex.dispose();
      });
      films.clear();
      built.glyphs.dispose();
      built.card.dispose();
      built.bar.texture.dispose();
    };
  }, [films, built]);

  const load = (i: number) => {
    if (i < 0 || i >= projects.length || films.has(i)) return;
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.disablePictureInPicture = true;
    video.src = projects[i].video;
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    const f: Film = { video, tex, ready: false, rolling: false, offAt: 0, seen: -1 };
    video.addEventListener('loadeddata', () => {
      f.ready = true;
      tex.needsUpdate = true;
    });
    films.set(i, f);
  };

  // the view: first, so the rest of the frame (and the page's buttons) see it where it is now
  useFrame(() => {
    if (rig.route !== 'home') return;
    const st = rig.stages.get('reel');
    const vw = rig.vw;
    const vh = rig.vh;
    const aspect = vw / vh;
    // the box the page keeps free for the loop, and how big the picture at the gate should be in it
    const box = st ? { x: st.x, y: st.y, w: st.w, h: st.h } : { x: 0, y: vh * 0.2, w: vw, h: vh * 0.6 };
    // the picture at the gate is a good part of the screen, and the spiral's two ends stay in view
    // (on a narrow screen the picture takes most of the width, and the ends run off it)
    const wide = smoothstep(0.75, 1.6, aspect);
    const want = Math.min(box.w * lerp(0.8, 0.33, wide), Math.min(vh * 0.42, box.h * 0.72) * ASPECT);
    const chord = 2 * HALF;
    const fov = 2 * Math.atan((chord * vh) / (2 * DIST * RADIUS * want));
    // the way out: straight at the picture at the gate, and through the film
    const out = reel.leave;
    const go = out * out * (3 - 2 * out);
    camera.fov = THREE.MathUtils.radToDeg(fov);
    camera.aspect = aspect;
    camera.near = 0.05;
    camera.far = 20;
    camera.position.set(0, 0, lerp(DIST, -THROUGH, go) * RADIUS);
    camera.rotation.set(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    // the gate in the middle of its box: shift the picture (not the view), through the glass's curve
    // (on the way out the view's own middle comes to the middle of the screen, where the last screen's is)
    const cx = (((box.x + box.w / 2) / vw) * 2 - 1) * (1 - go);
    const cy = (1 - ((box.y + box.h * 0.5) / vh) * 2) * (1 - go);
    const [sx, sy] = bendPointer(cx, cy, CURVE, aspect);
    const e = camera.projectionMatrix.elements;
    e[8] = -sx;
    e[9] = -sy;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

    // the spiral leans a little toward the pointer, round the gate (and squares up for the way out)
    const { pivot } = built;
    const lean = 1 - smoothstep(0, 0.25, out);
    pivot.rotation.set(damp(pivot.rotation.x, -rig.pointer.sy * 0.03 * lean, 3, rig.dt), damp(pivot.rotation.y, rig.pointer.sx * 0.06 * lean, 3, rig.dt), 0);
    pivot.updateMatrixWorld(true);
    built.shared.uDrum.value.copy(built.drum.matrixWorld);

    // the way out, for the page: the picture at the gate clears into an opening, and the last
    // screen stands behind the film, seen through it at the size its distance makes it
    const hole = reel.hole;
    const last = reel.last;
    hole.pts.length = 0;
    if (out > 0 && out < 1) {
      last.scale = (BACK - THROUGH) / (camera.position.z / RADIUS + BACK);
      last.x = (cx * vw) / 2;
      last.y = (-cy * vh) / 2;
      // (only once the film has come to rest on its last frame)
      last.show = smoothstep(0.32, 0.56, out) * (1 - smoothstep(0.05, 0.6, Math.abs(reel.pos - reel.display)));
      // the picture's outline, wherever the film has it, as the glass shows it
      const off = Math.round(reel.display) - reel.display;
      let seen = true;
      const point = (a: number, y: number) => {
        const p = stripAt(a + off);
        tmp.v.set(p.x, y + p.y, p.z - RADIUS).applyMatrix4(pivot.matrixWorld);
        if (seen && toScreenFar(tmp.v, camera, tmp.s)) hole.pts.push(tmp.s[0], tmp.s[1]);
        else seen = false;
      };
      const { half, h } = PICTURE;
      for (let i = 0; i < SIDE; i++) point(lerp(-half, half, i / SIDE), h);
      for (let i = 0; i < SIDE; i++) point(half, lerp(h, -h, i / SIDE));
      for (let i = 0; i < SIDE; i++) point(lerp(half, -half, i / SIDE), -h);
      for (let i = 0; i < SIDE; i++) point(-half, lerp(-h, h, i / SIDE));
      // wider than the whole view (or the view is at the film, or through it): no edge is left to see
      hole.open = !seen || covers(hole.pts, vw, vh);
      if (hole.open) hole.pts.length = 0;
    } else {
      last.scale = 1;
      last.x = last.y = 0;
      last.show = out >= 1 ? 1 : 0;
      hole.open = out >= 1;
    }

    // where the gate's picture is on screen, for the buttons under it (they are gone on the way out)
    const g = reel.gate;
    if (reel.leaving) {
      g.ok = false;
      return;
    }
    let l = Infinity;
    let r = -Infinity;
    let t = Infinity;
    let b = -Infinity;
    let ok = true;
    // (the gate's frame climbs across its width like the rest of the spiral)
    const corner = (a: number, y: number) => {
      const p = stripAt(a);
      tmp.v.set(p.x, y + p.y, p.z - RADIUS).applyMatrix4(pivot.matrixWorld);
      ok = toScreen(tmp.v, camera, tmp.s) && ok;
      return tmp.s;
    };
    for (const [a, y] of [
      [-PICTURE.half, PICTURE.h],
      [PICTURE.half, PICTURE.h],
      [-PICTURE.half, -PICTURE.h],
      [PICTURE.half, -PICTURE.h],
    ]) {
      const [x, yy] = corner(a, y);
      l = Math.min(l, x);
      r = Math.max(r, x);
      t = Math.min(t, yy);
      b = Math.max(b, yy);
    }
    const [, edge] = corner(PICTURE.half, -PICTURE.film);
    const put = (out: number[], a: number, y: number) => {
      const [x, yy] = corner(a, y);
      out[0] = x;
      out[1] = yy;
    };
    put(g.tl, -PICTURE.half, PICTURE.h);
    put(g.tr, PICTURE.half, PICTURE.h);
    put(g.bl, -PICTURE.half, -PICTURE.h);
    put(g.br, PICTURE.half, -PICTURE.h);
    g.left = l;
    g.right = r;
    g.top = t;
    g.bottom = b;
    g.film = Math.max(0, edge - b);
    g.ok = ok;
  }, -1);

  useFrame((_, dt) => {
    if (rig.route !== 'home') return;
    const on = reel.on;
    const time = rig.time;
    built.shared.uTime.value = time;
    const bm = built.backdrop.material as THREE.ShaderMaterial;
    bm.uniforms.uAspect.value = rig.vw / rig.vh;
    const dm = built.dust.material as THREE.ShaderMaterial;
    dm.uniforms.uTime.value = time;
    dm.uniforms.uPx.value = rig.vh * 0.01 * rig.dpr;
    // the way out: the dust settles before the picture has cleared, and once the view is through
    // the film the dark in here gives way to the inner world (drawn under it, see the director)
    const out = reel.leave;
    const open = out > 0 && reel.hole.open;
    dm.uniforms.uFade.value = 1 - smoothstep(0.3, 0.5, out);
    bm.uniforms.uShow.value = 1 - reel.world;
    // (while leaving the film is drawn from the gate outward, so nothing shows through the clearing
    // picture but what is really behind it, and the dust after the film)
    built.dust.renderOrder = out > 0 ? 100 : 0;

    // the recordings: the one at the gate starts loading while the camera is still crossing the office
    const plate = reel.plate;
    if (office.path > 0.35 || on) {
      load(Math.min(plate, projects.length - 1));
      load(plate + 1);
      if (plate > 0) load(plate - 1);
    }
    // the last plate (the title card) keeps the last recording turning behind it
    const running = Math.min(plate, projects.length - 1);
    films.forEach((f, i) => {
      if (i === running && on) f.offAt = time + 0.6;
      const play = on && f.ready && time < f.offAt;
      if (play && !f.rolling) {
        f.rolling = true;
        f.video.play()?.catch(() => (f.rolling = false));
      } else if (!play && f.rolling) {
        f.rolling = false;
        f.video.pause();
      }
      // a new picture from the recording only when it has moved on
      if (f.rolling && f.video.currentTime !== f.seen) {
        f.seen = f.video.currentTime;
        f.tex.needsUpdate = true;
      }
    });

    // the buttons' effect on the picture at the gate: rises quickly, falls quicker, and never
    // outlives the frame (the film moving on takes it away)
    const kind = reel.resting ? reel.fx : '';
    if (fx.plate !== plate) {
      fx.plate = plate;
      fx.code = fx.live = fx.none = 0;
    }
    const step = (v: number, rise: boolean, up: number, down: number) => clamp(v + (rise ? up : -down) * dt);
    fx.code = step(fx.code, kind === 'code', 1.6, 3.2);
    fx.live = damp(fx.live, kind === 'demo' ? 1 : 0, kind === 'demo' ? 6 : 9, dt);
    fx.none = damp(fx.none, kind === 'none' ? 1 : 0, 9, dt);
    // the bar drops, the address types itself in, and a line runs across as the page "loads"
    const want = kind === 'demo' || kind === 'code' ? reel.address : '';
    if (want !== bar.want) {
      bar.want = want;
      if (want) {
        bar.text = want;
        bar.since = time;
      }
    }
    bar.drop = damp(bar.drop, want ? 1 : 0, want ? 9 : 14, dt);
    const since = time - bar.since;
    if (bar.drop > 0.002) {
      const typed = Math.max(0, Math.min(bar.text.length, Math.floor((since - 0.3) / 0.028)));
      const caret = Math.floor(since * 2.2) % 2 === 0;
      const key = `${bar.text}|${typed}|${caret}`;
      if (key !== bar.drawn) {
        bar.drawn = key;
        built.bar.draw(bar.text, typed, caret);
      }
    }
    const l = clamp((since - 0.9) / 1.6);
    const loaded = want && since < 3 ? 1 - (1 - l) ** 3 : 0;

    // the film screws along the spiral: the frame at the wheel's position is always at the gate
    const w = reel.display;
    const base = Math.floor(w) - BEHIND;
    for (let j = 0; j < built.frames.length; j++) {
      const fr = built.frames[j];
      const k = base + j;
      const sAt = k - w;
      const a = heading(sAt);
      const vis = visibility(a);
      const gate = Math.abs(sAt) < 0.5;
      // (once the picture at the gate is wider than the view, the rest of the film is behind it)
      fr.mesh.visible = vis > 0.004 && sAt + 0.5 > CUT && (gate || !open);
      fr.mesh.renderOrder = out > 0 ? Math.abs(sAt) : 0;
      fr.mesh.rotation.y = a;
      fr.mesh.position.y = stripAt(sAt).y;
      fr.k = k;
      fr.plate = ((k % PLATES) + PLATES) % PLATES;
      fr.mesh.userData.plate = fr.plate;
      fr.mesh.userData.k = k;
      fr.u.uU.value = sAt;
      const u = fr.u;
      u.uVis.value = vis;
      u.uSeed.value = k * 7.31;
      // developed at the gate, only exposed elsewhere
      u.uGate.value = 1 - smoothstep(0.3, 1.2, Math.abs(sAt));
      // what it shows: the running recording if there is one, else its still (the last plate: the card)
      const f = films.get(fr.plate);
      const last = fr.plate >= projects.length;
      const tex = last ? built.card : f?.ready ? f.tex : posters[fr.plate];
      if (u.tMap.value !== tex) {
        u.tMap.value = tex;
        const img = tex.image as { videoWidth?: number; videoHeight?: number; width?: number; height?: number } | undefined;
        const tw = img?.videoWidth || img?.width || 16;
        const th = img?.videoHeight || img?.height || 9;
        u.uTexAspect.value = tw / th;
        u.uDecode.value = f?.ready && tex === f.tex ? 1 : 0;
        const focus = last ? undefined : projects[fr.plate].focus;
        const [fx0, fy0] = (focus ?? '50% 50%').split(' ').map((v) => parseFloat(v) / 100);
        u.uFocus.value.set(fx0, 1 - fy0);
      }
      u.uCode.value = gate ? fx.code : 0;
      u.uLive.value = gate ? fx.live : 0;
      u.uNone.value = gate ? fx.none : 0;
      u.uBar.value = gate ? bar.drop : 0;
      u.uLoad.value = gate ? loaded : 0;
      // its picture clears on the way out; an opening only once nothing else is left in view
      u.uClear.value = !gate || out <= 0 ? 0 : open && reel.last.show >= 1 ? 1 : Math.min(reel.last.show, 0.999);
    }
  });

  // the page's own links and buttons lie over the loop: what they take is theirs
  const onPage = (e: ThreeEvent<MouseEvent>) => !!(e.nativeEvent.target as HTMLElement | null)?.closest?.('a, button');
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (!reel.on || reel.leaving || onPage(e)) return;
    e.stopPropagation();
    const plate = (e.object.userData.plate as number) ?? 0;
    const delta = ((e.object.userData.k as number) ?? 0) - Math.round(reel.display);
    if (delta === 0) {
      // the picture at the gate opens its case file, like its title does
      if (reel.resting) document.querySelector<HTMLAnchorElement>(`[data-plate="${plate}"] h3 a`)?.click();
      return;
    }
    // any other frame is wound to the gate, the short way round
    wind(delta);
  };
  const over = (e: ThreeEvent<PointerEvent>) => {
    if (!reel.on || reel.leaving || onPage(e)) return;
    e.stopPropagation();
    setCursor('pointer');
  };
  const out = () => setCursor('');

  return (
    <>
      <primitive object={built.backdrop} />
      <primitive object={built.pivot}>
        <primitive object={built.loop}>
          <primitive object={built.drum}>
            {/* the frames take the pointer: the one at the gate opens its case file, any other is wound to */}
            {built.frames.map((fr, k) => (
              <primitive key={k} object={fr.mesh} onClick={click} onPointerOver={over} onPointerOut={out} />
            ))}
          </primitive>
          <primitive object={built.dust} />
        </primitive>
      </primitive>
    </>
  );
}
