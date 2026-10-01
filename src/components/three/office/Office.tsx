'use client';

import { Environment, Lightformer, useTexture } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { smootherstep, smoothstep } from '@/lib/math';
import { MODELS, preloadModel, useModel } from '@/lib/models';
import { APPROACH, office } from '@/lib/office';
import { rig } from '@/lib/rig';
import { applyPose, makePose } from '../bench/tube';
import { mergeStatic } from './merge';
import { damaskWallpaper, persianRug } from './patterns';
import { buildSign } from './sign';
import { ROOM, WINDOW, buildRoom } from './room';

export const OFFICE_FOV = 36;
/**
 * A narrow screen gets a wider lens: the view is never less than this far across (degrees), so a
 * phone still sees a room's width, and the word across it, not a slice through a long lens.
 */
const MIN_ACROSS = 30;
const viewFov = (aspect: number) =>
  Math.max(OFFICE_FOV, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(MIN_ACROSS) / 2) / aspect)));
/** how far across the view is where the word was sized for it (the lens above, on a 1.75 screen), as a tangent */
const SIGN_ACROSS = Math.tan(THREE.MathUtils.degToRad(OFFICE_FOV) / 2) * 1.75;
/** the desk: its middle, and the height of its top */
const DESK = { x: 0.1, z: -1.2, top: 0.78 };
/** the old camera on the desk: how tall it stands (metres), and how far it is turned toward the door */
const CAMERA = { height: 0.3, yaw: 0.45 };
/** its lens glass in the model's own units: the middle of the shallow dome, and its radius */
const LENS = { x: -0.118, y: -0.288, z: 0.61, r: 0.13 };
/** where on the flight across the room the view passes through the word, and the word's cap height (metres) */
const CROSS = 0.5;
const SIGN_CAP = 0.215;
/** how far along the flight the camera drifts while the clock's hub opens onto the room */
const DRIFT = 0.05;
/** the sun, low in the evening, coming through the window straight across the desk and the camera */
const SUN_DIR = new THREE.Vector3(1, -0.34, -0.06).normalize();
export const SUN_COLOR = new THREE.Color('#ffbd7a');

const T = '/textures/office/';
const set = (id: string) => [`${T}${id}_diff.webp`, `${T}${id}_nor.webp`, `${T}${id}_arm.webp`];
const SURFACES = ['decrepit_wallpaper', 'dark_paneled_wood', 'herringbone_parquet', 'plastered_wall_02', 'dirty_carpet'];
const PIECES = [MODELS.desk, MODELS.officeWindow, MODELS.officeClock, MODELS.bookshelf, MODELS.books, MODELS.oilLamp, MODELS.magnifier, MODELS.chairA, MODELS.chairB, MODELS.brokenClock, MODELS.camera];

/** Start every download at once (the component would otherwise fetch them one after another). */
export function preloadOffice() {
  for (const url of PIECES) preloadModel(url);
  for (const id of SURFACES) useTexture.preload(set(id));
}

/**
 * Stand a model on the floor (its lowest point at y = 0, centred on x and z) at a given height or
 * scale, casting and taking shadows. Returns a wrapper to place.
 */
function stand(src: THREE.Object3D, opts: { height?: number; scale?: number; clone?: boolean } = {}) {
  const o = opts.clone ? src.clone(true) : src;
  o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o);
  const size = box.getSize(new THREE.Vector3());
  const k = opts.scale ?? (opts.height ? opts.height / size.y : 1);
  const inner = new THREE.Group();
  inner.add(o);
  const c = box.getCenter(new THREE.Vector3());
  o.position.set(-c.x, -box.min.y, -c.z);
  inner.scale.setScalar(k);
  const outer = new THREE.Group();
  outer.add(inner);
  o.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  outer.userData.size = size.multiplyScalar(k);
  return outer;
}

/** Dust in the sun: points that only show where the sun's shadow map says the light reaches. */
function makeDust(count: number) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(count * 3);
  const s = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // scattered through the part of the room the sun crosses
    p[i * 3] = THREE.MathUtils.lerp(-3, 1.6, Math.random());
    p[i * 3 + 1] = THREE.MathUtils.lerp(0.2, 2.8, Math.random());
    p[i * 3 + 2] = THREE.MathUtils.lerp(-2.4, 1.4, Math.random());
    s[i] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uShadow: { value: null },
      uShadowMat: { value: new THREE.Matrix4() },
      uColor: { value: SUN_COLOR.clone().multiplyScalar(2.2) },
      uPx: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime;
      uniform float uPx;
      uniform sampler2DShadow uShadow;
      uniform mat4 uShadowMat;
      varying float vLit;
      void main() {
        vec3 p = position;
        float t = uTime * (0.05 + seed * 0.06);
        p += vec3(sin(t + seed * 40.0) * 0.18, sin(t * 0.7 + seed * 17.0) * 0.12 - fract(uTime * 0.004 + seed) * 0.3, cos(t * 0.9 + seed * 9.0) * 0.18);
        vec4 sc = uShadowMat * vec4(p, 1.0);
        vLit = texture(uShadow, vec3(sc.xy, sc.z - 0.002)) * (0.35 + 0.65 * seed);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (1.2 + seed * 2.2) / -mv.z;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vLit;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vLit;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * a, 1.0);
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

/** The sky through the window: late sun low over a hazy town, hot at the horizon. */
function makeSky() {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      float hash(float x) { return fract(sin(x * 91.7) * 43758.5); }
      void main() {
        vec3 top = vec3(0.35, 0.3, 0.42);
        vec3 mid = vec3(1.5, 0.78, 0.36);
        vec3 low = vec3(3.2, 1.6, 0.66);
        float y = vUv.y;
        vec3 col = mix(low, mid, smoothstep(0.18, 0.5, y));
        col = mix(col, top, smoothstep(0.5, 1.0, y));
        // the sun itself, low and to the side
        float d = length((vUv - vec2(0.52, 0.34)) * vec2(1.6, 1.0));
        col += vec3(5.0, 3.0, 1.3) * smoothstep(0.16, 0.0, d);
        // rooftops against it
        float cell = floor(vUv.x * 14.0);
        float roof = 0.12 + hash(cell) * 0.16 + step(0.8, hash(cell + 7.0)) * 0.12;
        col = mix(col, vec3(0.18, 0.1, 0.07), step(y, roof) * 0.85);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(9, 6), m);
  sky.rotation.y = Math.PI / 2;
  sky.position.set(ROOM.x0 - 2.4, 1.8, WINDOW.z - 0.6);
  return sky;
}

type World = { group: THREE.Group; box: THREE.Box3; dust: THREE.Points; mixer: THREE.AnimationMixer; lens: typeof office.lens; sign: THREE.Group };
type Model = { scene: THREE.Object3D; animations: THREE.AnimationClip[] };
type Drawable = CanvasImageSource & { width: number; height: number };

/** A photo, decoded off the main thread before it is drawn (drawn undecoded, it is decoded there and then). */
const decoded = (img: unknown) => (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement ? img.decode().catch(() => {}) : Promise.resolve());

/**
 * The room arrives while the page is already up, and may be scrolling: it is built in small steps,
 * and between them the frame goes back to the browser whenever a few milliseconds of work have
 * gone, so building it never holds a frame up.
 */
function pacer(budget = 4) {
  let since = performance.now();
  return async () => {
    if (performance.now() - since < budget) return;
    await new Promise<void>((r) => setTimeout(r, 0));
    since = performance.now();
  };
}

/** Build the room: once per set of models (the models themselves are moved into it). */
async function buildOffice(textures: THREE.Texture[], models: Model[]): Promise<World> {
  const [paperD, paperN, paperA, panelD, panelN, panelA, floorD, floorN, floorA, ceilD, ceilN, carpetD, carpetN, carpetA] = textures;
  const [desk, win, clock, shelf, books, lamp, lens, chairA, chairB, broken, cam] = models;
  const rest = pacer();
  for (const t of [paperD, panelD, floorD, ceilD, carpetD]) t.colorSpace = THREE.SRGBColorSpace;
  for (const t of [paperN, paperA, panelN, panelA, floorN, floorA, ceilN, carpetN, carpetA]) t.colorSpace = THREE.NoColorSpace;
  // (the two photos the patterns are drawn over, decoded off the main thread first)
  await Promise.all([decoded(paperD.image), decoded(carpetD.image)]);
  const wallpaper = await damaskWallpaper(paperD.image as Drawable, rest);
  const rug = await persianRug(carpetD.image as Drawable, rest);
  const room = buildRoom({
    paper: { map: wallpaper, normal: paperN, arm: paperA },
    panel: { map: panelD, normal: panelN, arm: panelA },
    floor: { map: floorD, normal: floorN, arm: floorA },
    ceiling: { map: ceilD, normal: ceilN },
    rug: { map: rug, normal: carpetN, arm: carpetA },
  });
  const g = room.group;
  await rest();

  // the desk, its drawers toward the room; the camera lies on it
  const d = stand(desk.scene, { height: DESK.top });
  d.rotation.y = -Math.PI / 2;
  d.position.set(DESK.x, 0, DESK.z);
  g.add(d);
  await rest();

  // the window, in its opening; its glass takes no part in the shadows, its blinds do
  const w = stand(win.scene, { scale: 1.02 });
  w.rotation.y = Math.PI / 2;
  w.position.set(ROOM.x0 + 0.02, WINDOW.y0 - 0.02, WINDOW.z);
  w.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && /Glass/.test((m.material as THREE.Material).name)) {
      m.castShadow = false;
      (m.material as THREE.MeshStandardMaterial).opacity = 0.12;
    }
  });
  g.add(w);
  await rest();

  // the grandfather clock and the bookshelf against the back wall
  const c = stand(clock.scene, { height: 2.15 });
  c.position.set(2.05, 0, ROOM.z0 + 0.3);
  c.rotation.y = -0.12;
  g.add(c);
  const s = stand(shelf.scene, { height: 2.05 });
  s.position.set(-1.75, 0, ROOM.z0 + 0.24);
  // its paint is washed out: stain it to go with the desk
  s.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.color.set('#94684a');
      m.material = mat;
    }
  });
  g.add(s);
  await rest();
  // fill its shelves with the encyclopaedia, a row or two to a shelf, some leaning
  const sw = s.userData.size as THREE.Vector3;
  const levels = [0.07, 0.245, 0.42, 0.595, 0.77];
  for (let i = 0; i < levels.length; i++) {
    const f = levels[i];
    const rows = i === 2 ? 1 : 2;
    for (let r = 0; r < rows; r++) {
      const b = stand(books.scene, { clone: true, height: 0.24 + (i % 2) * 0.03 });
      const bw = (b.userData.size as THREE.Vector3).x;
      b.position.set(s.position.x - sw.x * 0.45 + bw / 2 + r * (bw + 0.03) + (i % 3) * 0.03, sw.y * f + 0.02, s.position.z + 0.02);
      if (r === 1 && i === 3) b.rotation.z = -0.12;
      if (b.position.x + bw / 2 < s.position.x + sw.x * 0.46) g.add(b);
      await rest();
    }
  }

  // the chair, pushed back and turned aside as if someone just got up (and out of the camera's
  // way as it goes for the lens); a carved one waits by the wall
  const a = stand(chairA.scene, { height: 1.05 });
  a.position.set(DESK.x + 0.95, 0, DESK.z + 1.05);
  a.rotation.y = Math.PI - 0.75;
  g.add(a);
  const bch = stand(chairB.scene, { height: 1.12 });
  bch.position.set(2.55, 0, 0.35);
  bch.rotation.y = -Math.PI / 2 - 0.35;
  g.add(bch);
  await rest();

  // on the desk: the oil lamp, the magnifying glass, a few volumes
  const l = stand(lamp.scene, { height: 0.56 });
  l.position.set(DESK.x - 0.62, DESK.top, DESK.z - 0.12);
  g.add(l);
  const m = stand(lens.scene, { height: 0.26 });
  m.rotation.set(-Math.PI / 2, 0, 0.6);
  m.position.set(DESK.x + 0.55, DESK.top + 0.02, DESK.z + 0.12);
  g.add(m);
  const deskBooks = stand(books.scene, { clone: true, height: 0.2 });
  deskBooks.scale.x *= 0.35;
  deskBooks.position.set(DESK.x + 0.6, DESK.top, DESK.z - 0.22);
  deskBooks.rotation.y = -0.25;
  g.add(deskBooks);
  await rest();

  // and the old camera, in the middle of the desk, its lens turned a little toward the door
  const cm = stand(cam.scene, { height: CAMERA.height });
  cm.rotation.y = CAMERA.yaw;
  cm.position.set(DESK.x - 0.05, DESK.top, DESK.z + 0.05);
  g.add(cm);
  g.updateMatrixWorld(true);
  const body = cm.userData.size as THREE.Vector3;
  const glass = {
    center: cam.scene.localToWorld(new THREE.Vector3(LENS.x, LENS.y, LENS.z)),
    normal: new THREE.Vector3(0, 0, 1).transformDirection(cam.scene.matrixWorld),
    radius: LENS.r * cam.scene.getWorldScale(new THREE.Vector3()).x,
    body: new THREE.Vector2(body.x, body.y),
    ready: true,
  };

  // over the desk, the broken clock from the way in: a copy of it, its wheels still turning
  const bc = broken.scene.clone(true);
  const p = stand(bc, { height: 0.95 });
  p.position.set(DESK.x - 0.05, 1.28, ROOM.z0 + 0.1);
  g.add(p);
  const mixer = new THREE.AnimationMixer(bc);
  broken.animations.forEach((a) => mixer.clipAction(a).play());

  await rest();
  const sky = makeSky();
  g.add(sky);
  const dust = makeDust(420);
  g.add(dust);
  // the word the view flies through on its way across (placed on the flight, see below)
  const sign = (await buildSign(rest)).group;
  g.add(sign);
  // nothing else in here moves: every mesh that shares a material becomes one (the hundreds of
  // books, the mouldings, the furniture's parts), leaving the clock's turning wheels and the word
  await mergeStatic(g, [p, sign, sky], rest);
  return { group: g, box: room.box, dust, mixer, lens: glass, sign };
}

/**
 * The office behind the clock: a detective's room in the late afternoon. The sun comes in low
 * through the broken blinds, laying stripes over the rug and the desk and hanging in the dusty air;
 * an old camera lies on the desk. The view enters through the clock's hub, crosses the room, lines
 * up with the camera's lens and goes into it, until the glass is all there is and the films take over.
 */
export default function Office() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  const [paperD, paperN, paperA] = useTexture(set('decrepit_wallpaper'));
  const [panelD, panelN, panelA] = useTexture(set('dark_paneled_wood'));
  const [floorD, floorN, floorA] = useTexture(set('herringbone_parquet'));
  const [ceilD, ceilN] = useTexture(set('plastered_wall_02'));
  const [carpetD, carpetN, carpetA] = useTexture(set('dirty_carpet'));

  const desk = useModel(MODELS.desk);
  const win = useModel(MODELS.officeWindow);
  const clock = useModel(MODELS.officeClock);
  const shelf = useModel(MODELS.bookshelf);
  const books = useModel(MODELS.books);
  const lamp = useModel(MODELS.oilLamp);
  const lens = useModel(MODELS.magnifier);
  const chairA = useModel(MODELS.chairA);
  const chairB = useModel(MODELS.chairB);
  const broken = useModel(MODELS.brokenClock);
  const cam = useModel(MODELS.camera);

  // the room is built once per set of models, and in small steps between frames (see buildOffice):
  // until it is there, there is simply no office yet
  const [world, setWorld] = useState<World | null>(() => (desk.scene.userData.office as World | undefined) ?? null);
  useEffect(() => {
    if (world) return;
    let live = true;
    const data = desk.scene.userData as { office?: World; officeJob?: Promise<World> };
    data.officeJob ??= buildOffice(
      [paperD, paperN, paperA, panelD, panelN, panelA, floorD, floorN, floorA, ceilD, ceilN, carpetD, carpetN, carpetA],
      [desk, win, clock, shelf, books, lamp, lens, chairA, chairB, broken, cam],
    ).then((w) => (data.office = w));
    data.officeJob.then((w) => live && setWorld(w));
    return () => {
      live = false;
    };
  }, [world, paperD, paperN, paperA, panelD, panelN, panelA, floorD, floorN, floorA, ceilD, ceilN, carpetD, carpetN, carpetA, desk, win, clock, shelf, books, lamp, lens, chairA, chairB, broken, cam]);

  // the sun, and a few small lights of the room's own
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight(SUN_COLOR, 5);
    const target = new THREE.Vector3(0.1, 0.95, -1.15);
    l.position.copy(target).addScaledVector(SUN_DIR, -9);
    l.target.position.copy(target);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const c = l.shadow.camera;
    c.left = -5.2;
    c.right = 5.2;
    c.top = 4.2;
    c.bottom = -4.2;
    c.near = 1;
    c.far = 20;
    l.shadow.bias = -0.0004;
    l.shadow.normalBias = 0.02;
    return l;
  }, []);
  const lampLight = useRef<THREE.PointLight>(null);

  useEffect(() => {
    if (!world) return;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFShadowMap;
    // nothing in the room moves: the shadow map is drawn when asked, not every frame
    gl.shadowMap.autoUpdate = false;
    office.sun = sun;
    office.room.copy(world.box);
    const l = office.lens;
    l.center.copy(world.lens.center);
    l.normal.copy(world.lens.normal);
    l.radius = world.lens.radius;
    l.body.copy(world.lens.body);
    l.ready = true;
    office.shadowDirty = true;
    office.loaded = true;
    scene.fog = new THREE.FogExp2('#0f0a07', 0.028);
    scene.background = new THREE.Color('#050302');
    scene.environmentIntensity = 0.7;
    return () => {
      office.sun = null;
      office.loaded = false;
      scene.fog = null;
    };
  }, [gl, sun, world, scene]);

  const pose = useMemo(() => makePose(), []);
  const path = useMemo(
    () => ({
      pos: new THREE.CatmullRomCurve3([new THREE.Vector3(2.35, 1.72, 3.05), new THREE.Vector3(1.55, 1.52, 1.8), new THREE.Vector3(0.75, 1.4, 0.95), new THREE.Vector3()], false, 'centripetal'),
      look: new THREE.CatmullRomCurve3([new THREE.Vector3(-0.9, 1.05, -1.3), new THREE.Vector3(-0.45, 1.1, -1.25), new THREE.Vector3(0.1, 1.2, -1.3), new THREE.Vector3()], false, 'centripetal'),
      p: new THREE.Vector3(),
      t: new THREE.Vector3(),
      m: new THREE.Matrix4(),
      front: new THREE.Vector3(),
      fill: new THREE.Vector3(),
      sp: new THREE.Vector3(),
      st: new THREE.Vector3(),
      signKey: '',
    }),
    [],
  );

  // the view: first of everything, so the rest of the frame sees it where it is now
  useFrame(() => {
    // development: a fixed look round the room (window.__officeLook = { p: [x, y, z], t: [x, y, z] })
    const dbg = process.env.NODE_ENV !== 'production' ? (window as unknown as { __officeLook?: { p: number[]; t: number[] } }).__officeLook : undefined;
    if (dbg) {
      pose.position.fromArray(dbg.p);
      path.m.lookAt(pose.position, path.t.fromArray(dbg.t), THREE.Object3D.DEFAULT_UP);
      pose.quaternion.setFromRotationMatrix(path.m);
      pose.offX = pose.offY = 0;
      pose.fov = OFFICE_FOV;
      applyPose(camera, pose, rig.vw, rig.vh);
      return;
    }
    if (!world || rig.route !== 'home' || office.mix <= 0 || !office.lens.ready) return;
    const g = office.lens;
    const aspect = rig.vw / rig.vh;
    const fov = viewFov(aspect);
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(fov) / 2);
    // square in front of the lens with the whole camera in view (on a narrow screen, its width
    // decides); then into the glass, until its black is more than the view
    const front = Math.max(g.body.y / (0.62 * 2 * tanHalf), g.body.x / (0.8 * 2 * tanHalf * aspect));
    path.front.copy(g.center).addScaledVector(g.normal, front);
    path.fill.copy(g.center).addScaledVector(g.normal, g.radius / (1.25 * tanHalf));
    const P = path.pos.points;
    const L = path.look.points;
    P[3].copy(path.front);
    L[3].copy(g.center);
    // the word hangs across the flight, square to the way the view looks there, with the gap
    // between two of its letters exactly on the path; it is as wide as the view is (a narrow
    // screen gets a smaller word), so it reads whole as the hub opens onto it
    path.pos.getPoint(CROSS, path.sp);
    path.look.getPoint(CROSS, path.st);
    const yaw = Math.atan2(path.sp.x - path.st.x, path.sp.z - path.st.z);
    const size = SIGN_CAP * Math.min(1, (tanHalf * aspect) / SIGN_ACROSS);
    const key = `${path.sp.x.toFixed(4)},${path.sp.z.toFixed(4)},${size.toFixed(4)}`;
    if (key !== path.signKey) {
      path.signKey = key;
      const s = world.sign;
      s.position.copy(path.sp);
      s.rotation.set(0, yaw, 0);
      s.scale.setScalar(size);
      s.updateMatrixWorld(true);
      office.shadowDirty = true;
    }
    if (office.path <= APPROACH) {
      const u = smootherstep(office.path / APPROACH);
      // before the flight (while the hub opens) the camera drifts in a little, as if stepping
      // through; the flight carries on from there (never back to the start of the path)
      const t = DRIFT * office.zoom + (1 - DRIFT) * u;
      path.pos.getPoint(t, path.p);
      path.look.getPoint(t, path.t);
      // a slow, hand-held breath while it travels, held still through the word, gone by the time it arrives
      const live = (1 - smoothstep(0.7, 1, u)) * smoothstep(0.02, 0.1, Math.abs(t - CROSS));
      path.p.x += Math.sin(rig.time * 0.41) * 0.012 * live;
      path.p.y += Math.sin(rig.time * 0.57) * 0.008 * live;
    } else {
      const v = (office.path - APPROACH) / (1 - APPROACH);
      path.p.lerpVectors(path.front, path.fill, v * v * (3 - 2 * v));
      path.t.copy(g.center);
    }
    pose.position.copy(path.p);
    path.m.lookAt(path.p, path.t, THREE.Object3D.DEFAULT_UP);
    pose.quaternion.setFromRotationMatrix(path.m);
    pose.offX = pose.offY = 0;
    pose.fov = fov;
    applyPose(camera, pose, rig.vw, rig.vh);
  }, -1);

  // the room's own life: the lamp's flame, the clock's wheels, the dust
  useFrame((_, dt) => {
    if (!world || office.mix <= 0) return;
    world.mixer.update(dt * 0.55);
    const f = 1 + Math.sin(rig.time * 9.3) * 0.04 + Math.sin(rig.time * 23.1) * 0.03;
    if (lampLight.current) lampLight.current.intensity = 1.6 * f;
    const u = world.dust.material as THREE.ShaderMaterial;
    u.uniforms.uTime.value = rig.time;
    u.uniforms.uShadow.value = sun.shadow.map?.depthTexture ?? null;
    u.uniforms.uShadowMat.value.copy(sun.shadow.matrix);
    u.uniforms.uPx.value = rig.vh * 0.012 * rig.dpr;
    world.dust.visible = !!sun.shadow.map;
  });

  return (
    <>
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={4} color="#ffbd7a" position={[-6, 2, -1]} rotation-y={Math.PI / 2} scale={[3, 2, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#b08a68" position={[0, 5, 0]} rotation-x={Math.PI / 2} scale={[8, 8, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#8a7a70" position={[6, 1, 2]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#8a6a50" position={[0, 1.5, 6]} rotation-y={Math.PI} scale={[8, 3, 1]} />
      </Environment>
      {world && <primitive object={world.group} />}
      <primitive object={sun} />
      <primitive object={sun.target} />
      {/* the room lit by the afternoon it lets in: a warm fill from above, and the glow the sun
          throws back off the floor where it lands */}
      <hemisphereLight args={['#c9b194', '#5a3e2a', 1.7]} />
      <pointLight position={[0.3, 2.7, 0.2]} color="#ffd6ac" intensity={9} decay={2} distance={0} />
      <pointLight position={[-0.4, 1.0, -0.5]} color="#ffb070" intensity={2.6} decay={2} distance={0} />
      <pointLight position={[1.8, 1.7, 2.4]} color="#e0cbb4" intensity={2.6} decay={2} distance={0} />
      <pointLight position={[-1.6, 2.2, -2.2]} color="#ffc590" intensity={2} decay={2} distance={0} />
      <pointLight ref={lampLight} position={[DESK.x - 0.62, DESK.top + 0.42, DESK.z - 0.12]} color="#ff9a48" intensity={0.55} decay={2} distance={0} />
    </>
  );
}

