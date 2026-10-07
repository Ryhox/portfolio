import * as THREE from 'three';
import { clamp, easeInOutCubic, lerp, smootherstep, smoothstep } from '@/lib/math';
import { rig } from '@/lib/rig';
import { CURVE, bendPointer } from '../pipeline/shaders';

/**
 * Geometry of the Lumen 64's picture tube in world space, plus the camera choreography
 * that moves between "looking at the machine" and "inside the glass".
 */
export const tube = {
  ready: false,
  /** centre / right / up / out-of-glass normal of the visible phosphor rectangle */
  C: new THREE.Vector3(),
  R: new THREE.Vector3(1, 0, 0),
  U: new THREE.Vector3(0, 1, 0),
  N: new THREE.Vector3(0, 0, 1),
  hw: 1.2,
  hh: 0.75,
  /**
   * half extents of the view's own frame on the glass: the part of the picture with the viewport's
   * shape, which is all the view sees once it is inside
   */
  cw: 1.2,
  ch: 0.675,
  /**
   * The picture is always the machine's whole glass, a window onto the inner world: the view's
   * frame is the middle of it, and the rest of the glass shows what lies round that. So nothing
   * changes shape on the way in (or out). Only the part of the glass in sight is drawn, at the
   * view's full sharpness: `win` is that part of the picture, and `src` the part of the inner
   * world drawn for it (the glass bows the picture, so it is not the same part). Both in frames:
   * the middle and half extents, the view's own frame being ±1. See `sight`.
   */
  win: { x: 0, y: 0, hx: 1, hy: 1 },
  src: { x: 0, y: 0, hx: 1, hy: 1 },
  /** the glass's half extents in frames (1, 1 once the view is inside: there the frame is all there is) */
  gx: 1,
  gy: 1,
  /** the mesh the picture is shown on, and where it sits on the lid when it is the whole glass */
  screen: null as THREE.Mesh | null,
  rest: new THREE.Vector3(),
  /** a point near the middle of the machine, for framing */
  focus: new THREE.Vector3(),
  /** the middle of the closed case */
  base: new THREE.Vector3(),
  /** the trackball, for its own little light */
  ball: new THREE.Vector3(),
  /** the corners of the open case (trackball aside), for centring it in the hero framing */
  box: Array.from({ length: 8 }, () => new THREE.Vector3()),
};

export const BENCH_FOV = 30;

/** Fit a rectangle with the viewport's aspect inside the glass. */
export function fitContent(aspect: number) {
  if (aspect >= tube.hw / tube.hh) {
    tube.cw = tube.hw;
    tube.ch = tube.hw / aspect;
  } else {
    tube.ch = tube.hh;
    tube.cw = tube.hh * aspect;
  }
}

export type Part = typeof tube.win;

const VIEW = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
const _eye = new THREE.Vector3();
const _ray = new THREE.Vector3();
/** a little more than is in sight, so the edge of what is drawn is never the edge of what is seen */
const MARGIN = 0.03;

/**
 * What a camera at the bench sees of the machine's glass: that part of the picture is what gets
 * drawn (tube.win, tube.src), and the mesh it is shown on is laid there. Far off that is all of the
 * glass; as the view goes in it closes on the view's own frame, so the picture is as sharp as the
 * view by the time it fills it. `camera` null: the view is inside, and its frame is the picture.
 * `whole`: all of the glass whatever the camera sees (the lid is still swinging open).
 */
export function sight(camera: THREE.PerspectiveCamera | null, aspect: number, whole = false) {
  const { win, src, C, R, U, N } = tube;
  if (!camera) {
    tube.gx = tube.gy = 1;
    win.x = win.y = src.x = src.y = 0;
    win.hx = win.hy = src.hx = src.hy = 1;
    return;
  }
  const gx = (tube.gx = tube.hw / tube.cw);
  const gy = (tube.gy = tube.hh / tube.ch);
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  // the corners of the view, where they meet the glass's plane
  _eye.setFromMatrixPosition(camera.matrixWorld);
  const depth = (C.x - _eye.x) * N.x + (C.y - _eye.y) * N.y + (C.z - _eye.z) * N.z;
  let found = !whole && depth < -1e-4;
  for (let i = 0; found && i < 4; i++) {
    _ray.set(VIEW[i][0], VIEW[i][1], 0.5).unproject(camera).sub(_eye);
    const along = _ray.dot(N);
    // (a corner that looks past the plane: there is no saying how much of the glass is in sight)
    if (along > -1e-6) {
      found = false;
      break;
    }
    _ray.multiplyScalar(depth / along).add(_eye).sub(C);
    const x = _ray.dot(R) / tube.cw;
    const y = _ray.dot(U) / tube.ch;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (found) {
    const mx = (x1 - x0) * MARGIN;
    const my = (y1 - y0) * MARGIN;
    x0 = Math.max(-gx, x0 - mx);
    x1 = Math.min(gx, x1 + mx);
    y0 = Math.max(-gy, y0 - my);
    y1 = Math.min(gy, y1 + my);
  }
  // (none of it in sight, the view turned away to the radio: all of it, as it does not matter)
  if (!found || x1 - x0 < 1e-4 || y1 - y0 < 1e-4) {
    x0 = -gx;
    x1 = gx;
    y0 = -gy;
    y1 = gy;
  }
  win.x = (x0 + x1) / 2;
  win.y = (y0 + y1) / 2;
  win.hx = (x1 - x0) / 2;
  win.hy = (y1 - y0) / 2;

  // the glass bows the picture: what it shows at a point comes from a little nearer the middle, or
  // (far out) from further off. So the part of the world to draw is the picture's own part taken
  // through the same curve; the curve keeps things in their order from the middle outward, so the
  // part's corners, and the points of its edges nearest the middle, say how far it reaches
  const nx = clamp(0, x0, x1);
  const ny = clamp(0, y0, y1);
  let a0 = Infinity;
  let a1 = -Infinity;
  let b0 = Infinity;
  let b1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const x = i < 6 ? (i & 1 ? x1 : x0) : nx;
    const y = i < 4 ? (i & 2 ? y1 : y0) : i < 6 ? ny : i & 1 ? y1 : y0;
    const [bx, by] = bendPointer(x, y, CURVE, aspect);
    a0 = Math.min(a0, bx);
    a1 = Math.max(a1, bx);
    b0 = Math.min(b0, by);
    b1 = Math.max(b1, by);
  }
  src.x = (a0 + a1) / 2;
  src.y = (b0 + b1) / 2;
  src.hx = (a1 - a0) / 2;
  src.hy = (b1 - b0) / 2;

  const s = tube.screen;
  if (s) {
    s.position.set(tube.rest.x + win.x * tube.cw, tube.rest.y + win.y * tube.ch, tube.rest.z);
    s.scale.set(win.hx * tube.cw * 2, win.hy * tube.ch * 2, 1);
  }
}

/**
 * Have a camera draw only a part of what it sees, or more than it does (`part` in views: its
 * middle and half extents, the camera's own view being ±1). Undone by updateProjectionMatrix().
 */
export function crop(camera: THREE.PerspectiveCamera, part: Part) {
  const e = camera.projectionMatrix.elements;
  for (let c = 0; c < 16; c += 4) {
    e[c] = (e[c] - part.x * e[c + 3]) / part.hx;
    e[c + 1] = (e[c + 1] - part.y * e[c + 3]) / part.hy;
  }
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
}

/** Distance at which the content rectangle exactly fills the viewport vertically. */
export function insideDistance(fovDeg = BENCH_FOV) {
  return tube.ch / Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);
}

const _p0 = new THREE.Vector3();
const _p3 = new THREE.Vector3();
const _t0 = new THREE.Vector3();
const _look = new THREE.Vector3();
const _m = new THREE.Matrix4();

export type Pose = {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** fractional view offset, -0.5..0.5 of the viewport */
  offX: number;
  offY: number;
  fov: number;
};

export function makePose(): Pose {
  return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), offX: 0, offY: 0, fov: BENCH_FOV };
}

/**
 * Hero framing for a given aspect. The camera is placed in the world's own frame (not the machine's):
 * the machine is turned to face left, as on shader.se, and the camera looks at it from the front.
 */
function heroFraming(aspect: number) {
  if (aspect < 0.8) {
    // portrait: the machine sits in the upper half, the copy below; the narrower the screen, the
    // further back the camera stands, so the whole case and its mouse always fit across
    // (the case is turned to the left, so the camera stands a little left of it to centre it)
    // (this is where the camera stands; the case itself is then fitted to its room, see fitAbove)
    const back = Math.pow(0.8 / Math.max(aspect, 0.34), 1.05);
    return { n: 11.6 * back, r: -0.55, u: 1.9 + (back - 1) * 1.2, tr: -0.35, tu: -0.2, offX: 0, offY: 0.14 };
  }
  if (aspect < 1.25) {
    return { n: 10.2, r: 0.45, u: 1.7, tr: 0.25, tu: -0.35, offX: -0.15, offY: 0.03 };
  }
  // close in on wide screens; on squarer ones the type takes more of the width, so step back
  const back = Math.pow(Math.max(1, 1.6 / aspect), 1.1);
  return { n: 9.3 * back, r: 0.4, u: 1.45 * back, tr: 0.3, tu: -0.12, offX: -0.29 - (back - 1) * 0.1, offY: -0.02 };
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

const _probe = new THREE.PerspectiveCamera(BENCH_FOV, 1, 0.05, 160);
const _pc = new THREE.Vector3();
const _ps = new THREE.Vector3();
const _fit = { offX: 0, offY: 0, fov: BENCH_FOV };

/**
 * Beside the words: the lens shift and zoom that fit the open case (feet to handle, the trackball
 * aside) into the room right of the landing's type, in the middle of it and of the height, seen
 * from `position` looking at `target`. It only ever zooms out, never in.
 */
function fitHero(position: THREE.Vector3, target: THREE.Vector3, aspect: number) {
  const b = caseBounds(position, target, aspect);
  // the room: from a little past the words (or, unmeasured, the widest they can be) to near the edge
  const W = rig.vw;
  const copy = rig.copyRight > 0 ? rig.copyRight : clamp(0.042 * W, 20, 72) + Math.min(640, 0.46 * W);
  const l = ((copy + 0.04 * W) / W) * 2 - 1;
  const r = 0.9;
  // at most three quarters of the height
  const s = Math.min(1, (r - l) / (b.xr - b.xl), 1.5 / (b.yt - b.yb));
  _fit.offX = ((s * (b.xl + b.xr)) / 2 - (l + r) / 2) / 2;
  _fit.offY = -(s * (b.yb + b.yt)) / 4;
  _fit.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(BENCH_FOV) / 2) / s));
  return _fit;
}

const _bounds = { xl: 0, xr: 0, yb: 0, yt: 0 };

/** Where the open case shows (feet to handle, the trackball aside), seen from `position` looking at `target`. */
function caseBounds(position: THREE.Vector3, target: THREE.Vector3, aspect: number) {
  _probe.fov = BENCH_FOV;
  _probe.aspect = aspect;
  _probe.position.copy(position);
  _probe.lookAt(target);
  _probe.updateProjectionMatrix();
  _probe.updateMatrixWorld();
  const b = _bounds;
  b.xl = b.yb = Infinity;
  b.xr = b.yt = -Infinity;
  for (const c of tube.box) {
    _pc.copy(c).project(_probe);
    b.xl = Math.min(b.xl, _pc.x);
    b.xr = Math.max(b.xr, _pc.x);
    b.yb = Math.min(b.yb, _pc.y);
    b.yt = Math.max(b.yt, _pc.y);
  }
  return b;
}

/**
 * Over the words (a phone, a tablet held upright): the open case is fitted into the room between
 * the site's bar and the landing's type, as big as fits there (nearly the full width, its
 * trackball left to run off the side), in the middle of it. Here the lens zooms in as well as out.
 */
function fitAbove(position: THREE.Vector3, target: THREE.Vector3, aspect: number) {
  const b = caseBounds(position, target, aspect);
  const H = rig.vh;
  // (unmeasured, the words start a little under two thirds of the way down)
  const words = rig.copyTop > 0 ? rig.copyTop : 0.64 * H;
  const top = 1 - (2 * 84) / H;
  const bottom = 1 - (2 * Math.max(84 + 0.2 * H, words - 0.035 * H)) / H;
  const s = clamp(Math.min(1.84 / (b.xr - b.xl), (top - bottom) / (b.yt - b.yb)), 0.5, 2.4);
  _fit.offX = (s * (b.xl + b.xr)) / 4;
  _fit.offY = -((s * (b.yb + b.yt)) / 2 - (top + bottom) / 2) / 2;
  _fit.fov = 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(BENCH_FOV) / 2) / s));
  return _fit;
}

/** The hero framing (position, look target, lens shift), with a little parallax and a slow breath. */
export function heroPose(aspect: number, px: number, py: number, time: number, live = 1) {
  const { C, focus } = tube;
  const f = heroFraming(aspect);
  _p0
    .copy(C)
    .addScaledVector(Z, f.n)
    .addScaledVector(X, f.r + px * 0.45 * live + Math.sin(time * 0.21) * 0.08 * live)
    .addScaledVector(Y, f.u + py * 0.28 * live + Math.sin(time * 0.33) * 0.05 * live);
  _t0.copy(focus).addScaledVector(X, f.tr).addScaledVector(Y, f.tu);
  // beside the words the case is fitted to the room they leave, measured from where the camera
  // rests (so the parallax still moves it); where the words sit under it, it keeps its framing
  if ((aspect > 21 / 20 || aspect < 0.8) && tube.ready && rig.vw > 100) {
    _ps.copy(C).addScaledVector(Z, f.n).addScaledVector(X, f.r).addScaledVector(Y, f.u);
    const fit = aspect < 0.8 ? fitAbove(_ps, _t0, aspect) : fitHero(_ps, _t0, aspect);
    return { position: _p0, target: _t0, offX: fit.offX, offY: fit.offY, fov: fit.fov };
  }
  return { position: _p0, target: _t0, offX: f.offX, offY: f.offY, fov: BENCH_FOV };
}

/**
 * t = 0: hero framing. t = 1: inside the glass, the content rectangle filling the viewport 1:1.
 * The camera goes straight for the monitor: the machine stays where it is in the frame while it
 * grows, turning square to the glass and only sliding to the centre on the last stretch.
 */
export function benchPose(t: number, aspect: number, px: number, py: number, time: number, out: Pose) {
  const { C, N } = tube;
  const d = insideDistance(BENCH_FOV);

  // hero: a little parallax and a slow breath, both vanishing as we dive
  const live = 1 - smoothstep(0, 0.3, t);
  const hero = heroPose(aspect, px, py, time, live);

  _p3.copy(C).addScaledVector(N, d);
  const e = smootherstep(t);
  out.position.copy(_p0).lerp(_p3, e);

  const lookT = easeInOutCubic(clamp(t * 1.35));
  _look.copy(_t0).lerp(C, lookT);
  _m.lookAt(out.position, _look, Y);
  out.quaternion.setFromRotationMatrix(_m);

  const offT = 1 - smoothstep(0.45, 1, t);
  out.offX = hero.offX * offT;
  out.offY = hero.offY * offT;
  out.fov = BENCH_FOV + (hero.fov - BENCH_FOV) * offT;
  return out;
}

/**
 * The camera the landing's words hang in front of: the hero framing with its parallax and breath,
 * but none of the dive, so while the camera rests they sit exactly where the page puts them, and
 * once it dives it flies past them.
 */
export function heroAnchor(t: number, aspect: number, px: number, py: number, time: number, out: Pose) {
  const hero = heroPose(aspect, px, py, time, 1 - smoothstep(0, 0.3, t));
  out.position.copy(hero.position);
  _m.lookAt(out.position, hero.target, Y);
  out.quaternion.setFromRotationMatrix(_m);
  out.offX = hero.offX;
  out.offY = hero.offY;
  out.fov = hero.fov;
  return out;
}

/** Apply a pose (including lens shift) to a camera. */
export function applyPose(camera: THREE.PerspectiveCamera, pose: Pose, w: number, h: number) {
  camera.position.copy(pose.position);
  camera.quaternion.copy(pose.quaternion);
  camera.fov = pose.fov;
  camera.aspect = w / h;
  if (Math.abs(pose.offX) > 1e-5 || Math.abs(pose.offY) > 1e-5) {
    camera.setViewOffset(w, h, pose.offX * w, pose.offY * h, w, h);
  } else if (camera.view) {
    camera.clearViewOffset();
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

export const bump = (v: number, a: number, b: number) => {
  const t = clamp((v - a) / (b - a));
  return Math.sin(t * Math.PI);
};

export { lerp };

const _op = new THREE.Vector3();
const _ot = new THREE.Vector3();

/**
 * The landing: the shut case sits centred in the frame; as the lid swings open the camera glides
 * into the hero framing. k = 1 is exactly benchPose(0).
 */
export function openingPose(k: number, aspect: number, px: number, py: number, time: number, out: Pose) {
  const h = heroPose(aspect, px, py, time, smoothstep(0.7, 1, k));
  const e = easeInOutCubic(clamp(k));
  const far = aspect < 1 ? 13 : 9.4;
  _op.copy(tube.base).addScaledVector(Z, far).addScaledVector(Y, far * 0.42).addScaledVector(X, 0.4);
  _ot.copy(tube.base);
  out.position.copy(_op).lerp(h.position, e);
  _ot.lerp(h.target, e);
  _m.lookAt(out.position, _ot, Y);
  out.quaternion.setFromRotationMatrix(_m);
  out.offX = h.offX * e;
  out.offY = h.offY * e;
  out.fov = BENCH_FOV + (h.fov - BENCH_FOV) * e;
  return out;
}
