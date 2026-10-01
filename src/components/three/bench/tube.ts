import * as THREE from 'three';
import { clamp, easeInOutCubic, lerp, smootherstep, smoothstep } from '@/lib/math';
import { rig } from '@/lib/rig';

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
  /** half extents of the viewport-aspect image drawn inside the glass */
  cw: 1.2,
  ch: 0.675,
  /**
   * 1 = the picture fills the machine's whole glass (the terminal, at the bench); 0 = it has the
   * viewport's shape (the works, seen through the glass and then from inside it)
   */
  fill: 1,
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
