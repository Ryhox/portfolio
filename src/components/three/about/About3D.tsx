'use client';

import { useTexture } from '@react-three/drei';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { about, tradeAngle } from '@/lib/about';
import { damp, easeInOutCubic, spring } from '@/lib/math';
import { MODELS, useModel } from '@/lib/models';
import { office } from '@/lib/office';
import { rig, sectionVisible, stageBox } from '@/lib/rig';
import { buildFrameKit } from '../works/frameKit';
import { normalize } from '../works/util';
import { portraitMaterial } from './portrait';

/** Sizes of the two pieces at scale 1, filled in when they load. */
const sizes = { portrait: new THREE.Vector2(1.9, 2.3), clock: new THREE.Vector2(4.6, 4.6) };

/**
 * Layout of the pinned section: both pieces fill the same stage box (CSS decides where it is),
 * the portrait for the maker's half, the clock for the trades'.
 */
function layout() {
  const box = stageBox('about-art');
  const b = box ?? { x: 2.9, y: 0, w: 4, h: 5 };
  // the clock has a box of its own, in the middle of the frame between the title and the trade
  const cb = stageBox('about-clock') ?? b;
  const fit = (sz: THREE.Vector2, k: number, into = b) => Math.min(into.w / sz.x, into.h / sz.y) * k;
  const clockScale = fit(sizes.clock, 0.96, cb);
  const halfW = rig.vw * rig.unitsPerPx * 0.5;
  return {
    narrow: rig.vw / rig.vh < 1.05 || rig.vw < 560,
    cy: b.y,
    x: b.x,
    top: b.y + b.h / 2,
    portraitScale: fit(sizes.portrait, 0.96),
    clockScale,
    clockX: cb.x,
    clockY: cb.y,
    away: b.w * 0.5 + halfW + 2,
    /** far enough right that the whole clock waits out of sight */
    clockAway: halfW - cb.x + (sizes.clock.x * clockScale) / 2 + 1.5,
  };
}

function Portrait({ into }: { into: React.RefObject<THREE.Group | null> }) {
  const frameGltf = useModel(MODELS.frame);
  const paint = useTexture('/textures/portrait.webp');
  const kit = useMemo(() => {
    const k = buildFrameKit(frameGltf.scene, false);
    k.frame.computeBoundingBox();
    const bb = k.frame.boundingBox!;
    sizes.portrait.set(bb.max.x - bb.min.x, bb.max.y - bb.min.y);
    return k;
  }, [frameGltf]);
  const mat = useMemo(() => {
    paint.colorSpace = THREE.SRGBColorSpace;
    paint.anisotropy = 8;
    return portraitMaterial(paint, kit.photoAspect);
  }, [paint, kit]);
  const lens = useRef({ target: new THREE.Vector2(0.5, 0.6), hover: false });

  useFrame((_, dt) => {
    const u = mat.uniforms;
    u.uOpen.value = damp(u.uOpen.value, lens.current.hover ? 1 : 0, lens.current.hover ? 7 : 5, dt);
    u.uLoupe.value.x = damp(u.uLoupe.value.x, lens.current.target.x, 14, dt);
    u.uLoupe.value.y = damp(u.uLoupe.value.y, lens.current.target.y, 14, dt);
    u.uTime.value = rig.time;
  });

  const move = (e: ThreeEvent<PointerEvent>) => {
    if (e.uv) lens.current.target.copy(e.uv);
  };

  return (
    <group ref={into}>
      <mesh geometry={kit.frame} material={kit.material} />
      <mesh
        geometry={kit.photo}
        material={mat}
        onPointerMove={move}
        onPointerOver={(e) => {
          move(e);
          lens.current.hover = true;
          document.documentElement.style.cursor = 'zoom-in';
        }}
        onPointerOut={() => {
          lens.current.hover = false;
          document.documentElement.style.cursor = '';
        }}
      />
    </group>
  );
}

/** The steampunk wall clock: its minute hand points at the trade being shown. */
function TradesClock({ into }: { into: React.RefObject<THREE.Group | null> }) {
  const gltf = useModel(MODELS.clock);
  const parts = useMemo(() => {
    const cached = gltf.scene.userData.trades as ReturnType<typeof rigClock> | undefined;
    if (cached) return cached;
    const r = rigClock(gltf.scene);
    gltf.scene.userData.trades = r;
    return r;
  }, [gltf]);

  const hand = useRef({ a: 0, v: 0, h: 0, hv: 0 });

  useFrame((_, dt) => {
    const hnd = hand.current;
    const target = tradeAngle(about.active);
    const step = Math.min(dt, 1 / 30);
    // a heavy hand on a light spring: it overshoots a touch, like a real movement settling
    const [a, v] = spring(hnd.a, hnd.v, target, 70, 9, step);
    hnd.a = a;
    hnd.v = v;
    const [h, hv] = spring(hnd.h, hnd.hv, target - 0.9, 18, 6, step);
    hnd.h = h;
    hnd.hv = hv;
    // the train is geared to the minute hand: it turns when the hands turn, back when they go
    // back, and stands still when they do
    const gear = hnd.a * 1.6;
    if (parts.minute) parts.minute.rotation.z = -hnd.a;
    if (parts.hour) parts.hour.rotation.z = -(hnd.h - Math.PI / 2);
    if (parts.sun) parts.sun.rotation.z = gear * 2.2;
    if (parts.ring) parts.ring.rotation.z = -gear * 0.4;
    parts.pivots.forEach((p, i) => (p.rotation.z = -gear * 3.4 * (i % 2 ? 1 : -1)));
  });

  return (
    <group ref={into}>
      <primitive object={parts.root} />
    </group>
  );
}

/** Find the hands and the little planetary train in the clock model (once per model). */
function rigClock(scene: THREE.Object3D) {
  const root = normalize(scene, 4.6, 'x');
  let minute: THREE.Object3D | null = null;
  let hour: THREE.Object3D | null = null;
  let sun: THREE.Object3D | null = null;
  let ring: THREE.Object3D | null = null;
  const planets: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if (o.name === 'pPlane1') minute = o;
    else if (o.name === 'pPlane4') hour = o;
    else if (o.name === 'polySurface43') sun = o;
    else if (o.name === 'pCylinder77') ring = o;
    else if (/^polySurface(85|86|87|88|89)$/.test(o.name)) planets.push(o);
    const m = o as THREE.Mesh;
    if (m.isMesh) (m.material as THREE.MeshStandardMaterial).envMapIntensity = 1.3;
  });
  root.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(root);
  sizes.clock.set(bb.max.x - bb.min.x, bb.max.y - bb.min.y);
  // the hub the camera dives into at the end: the middle of the gear train, and the ring round it
  const hub = sun ? new THREE.Box3().setFromObject(sun).getCenter(new THREE.Vector3()) : new THREE.Vector3(0, 0, bb.max.z);
  const ringR = ring ? new THREE.Box3().setFromObject(ring).getSize(new THREE.Vector3()).x * 0.46 : 0.5;
  // the planets turn about their own centres, so each gets a pivot there
  const pivots = planets.map((p) => {
    const c = new THREE.Box3().setFromObject(p).getCenter(new THREE.Vector3());
    const parent = p.parent!;
    const pivot = new THREE.Group();
    parent.add(pivot);
    pivot.position.copy(parent.worldToLocal(c.clone()));
    pivot.updateMatrixWorld(true);
    pivot.attach(p);
    return pivot;
  });
  return {
    root,
    hub,
    ringR,
    minute: minute as THREE.Object3D | null,
    hour: hour as THREE.Object3D | null,
    sun: sun as THREE.Object3D | null,
    ring: ring as THREE.Object3D | null,
    pivots,
  };
}

/**
 * § 01 in 3D. The maker's half: the portrait, with its loupe.
 * The trades' half: the portrait slides away and the wall clock takes its place; the scroll, or a
 * click on a trade, swings the hands round the dial.
 */
export default function About3D() {
  const root = useRef<THREE.Group>(null);
  const portrait = useRef<THREE.Group | null>(null);
  const clock = useRef<THREE.Group | null>(null);
  const spot = useRef<THREE.SpotLight>(null);
  const spotTarget = useMemo(() => new THREE.Object3D(), []);
  const pos = useRef({ portrait: 0, clock: 1 });
  const clockGltf = useModel(MODELS.clock);

  useFrame((_, dt) => {
    const g = root.current;
    if (!g) return;
    g.visible = rig.route === 'home' && sectionVisible('maker', 0.5);
    if (spot.current) spot.current.intensity = g.visible ? 90 : 0;
    if (!g.visible) return;
    const L = layout();
    const e = easeInOutCubic(about.phase);
    // 0 = in the box, ±1 = slid out of it
    pos.current.portrait = damp(pos.current.portrait, -e, 8, dt);
    pos.current.clock = damp(pos.current.clock, 1 - e, 8, dt);
    const px = L.x + pos.current.portrait * L.away;
    const cx = L.clockX + pos.current.clock * L.clockAway;
    if (portrait.current) {
      portrait.current.visible = pos.current.portrait > -0.98;
      portrait.current.scale.setScalar(L.portraitScale);
      portrait.current.position.set(px, L.cy, 0);
      // it hangs; it leans a little towards the pointer
      portrait.current.rotation.y = damp(portrait.current.rotation.y, rig.pointer.sx * 0.12 - 0.08, 3, dt);
      portrait.current.rotation.x = damp(portrait.current.rotation.x, -rig.pointer.sy * 0.06, 3, dt);
      portrait.current.rotation.z = Math.sin(rig.time * 0.5) * 0.008;
    }
    if (clock.current) {
      clock.current.visible = pos.current.clock < 0.98;
      clock.current.scale.setScalar(L.clockScale);
      clock.current.position.set(cx, L.clockY, -0.2);
      // it leans toward the pointer, except while the camera dives into it: then it faces square
      const hold = 1 - office.zoom;
      clock.current.rotation.y = damp(clock.current.rotation.y, (rig.pointer.sx * 0.1 - 0.12) * hold, 3, dt);
      clock.current.rotation.x = damp(clock.current.rotation.x, -rig.pointer.sy * 0.05 * hold, 3, dt);
      // tell the dive where the hub is
      const trades = clockGltf.scene.userData.trades as ReturnType<typeof rigClock> | undefined;
      if (trades) {
        clock.current.updateMatrixWorld(true);
        office.hub.copy(trades.hub).applyMatrix4(clock.current.matrixWorld);
        office.hubR = trades.ringR * L.clockScale;
        office.hubReady = clock.current.visible;
      }
    }
    const sp = spot.current;
    if (sp) {
      const onClock = about.phase > 0.5;
      spotTarget.position.set(onClock ? cx : px, onClock ? L.clockY : L.cy, 0);
      // from the front and a little above: a lamp on the far wall, not a skylight, so the crown stays dark bronze
      sp.position.set(spotTarget.position.x - 2.4, L.cy + 3.2, 10);
      sp.target = spotTarget;
    }
    // ahead of the inner world's camera, which dives for the hub this frame, not where it was last
  }, -1);


  return (
    <>
      <group ref={root}>
        <Portrait into={portrait} />
        <TradesClock into={clock} />
      </group>
      {/* outside the group that hides: a light that comes and goes changes every lit shader in the
          world, so it only ever dims to nothing */}
      <spotLight ref={spot} angle={0.35} penumbra={0.9} decay={2} distance={30} intensity={0} color="#ffd9aa" />
      <primitive object={spotTarget} />
    </>
  );
}
