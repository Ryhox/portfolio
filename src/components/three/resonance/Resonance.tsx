'use client';

import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { audio } from '@/audio/engine';
import { sfx } from '@/audio/sfx';
import { records } from '@/content/records';
import { crateFx } from '@/lib/crate';
import { clamp, damp, easeInOutCubic } from '@/lib/math';
import { MODELS, useModel } from '@/lib/models';
import { radio } from '@/lib/radio';
import { rig, roomBox } from '@/lib/rig';
import { useApp } from '@/lib/store';
import { setCursor } from '../works/util';
import { RadioDisplay, type Hit } from './display';
import { coverTexture, vinylLabel } from './sleeves';

/** The cabinet in its own units (with a little air around it). */
const MODEL_W = 1.94;
const MODEL_H = 1.0;
const MODEL_MID = 0.52;
/** the new screen, over the old segment display */
const SCREEN = { y: 0.76, z: 0.384, w: 0.345, h: 0.183 };
const DRAWER_OUT = 0.59;
const VINYL_R = 0.26;
const LABEL_R = 0.44; // of the disc: bigger than a real label, so the cover reads in flight
const KEY_PRESS = 0.52;
/** the mechanism's pace, in seconds: unhurried, so every step reads */
const DRAWER_S = 1.15; // to open, or to close
const FLY = 1.1; // sleeve to tray, or back
const SETTLE = 0.45; // a record lies in the open drawer a moment before it closes
const GAP = 0.22; // between one record coming out and the next going in
const RPM = (33.3 / 60) * Math.PI * 2;

type Key = 'rew' | 'play' | 'pause' | 'stop' | 'fwd' | 'eject';
type Phase = 'idle' | 'opening' | 'out' | 'gap' | 'in' | 'settle' | 'closing';

/** The two knobs either side of the screen, in the model's own frame: where their axes are, and how far out their caps stand. */
const KNOBS = [
  { name: 'VOLUME', x: -0.2645, y: 0.7124 },
  { name: 'PRE-AMP', x: 0.2645, y: 0.7124 },
] as const;
const KNOB_R = 0.047;
const KNOB_Z = 0.386;
/** a knob's sweep from nothing to full */
const KNOB_TURN = Math.PI * 1.5;

/**
 * The knobs are part of the cabinet's body in the model: their caps are cut out of it (every
 * triangle standing proud of the panel inside a knob's circle), so each can turn on its own axis.
 */
function cutKnobs(scene: THREE.Object3D) {
  const root = scene.getObjectByName('GLTF_SceneRootNode');
  const body = root?.getObjectByName('Object_130') as THREE.Mesh | undefined;
  if (!root || !body?.isMesh) return [];
  scene.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert().multiply(body.matrixWorld);
  const g = body.geometry;
  const pos = g.getAttribute('position');
  const index = g.index;
  const count = index ? index.count : pos.count;
  const at = (t: number) => (index ? index.getX(t) : t);
  const v = new THREE.Vector3();
  const which = (i: number) => {
    v.fromBufferAttribute(pos, i).applyMatrix4(toRoot);
    if (v.z < KNOB_Z) return -1;
    return KNOBS.findIndex((k) => Math.hypot(v.x - k.x, v.y - k.y) < KNOB_R);
  };
  const keep: number[] = [];
  const picked: number[][] = KNOBS.map(() => []);
  for (let t = 0; t < count; t += 3) {
    const a = at(t);
    const b = at(t + 1);
    const c = at(t + 2);
    const k = which(a);
    if (k >= 0 && which(b) === k && which(c) === k) picked[k].push(a, b, c);
    else keep.push(a, b, c);
  }
  if (picked.every((p) => !p.length)) return [];
  g.setIndex(keep);
  return KNOBS.map((k, i) => {
    const kg = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(g.attributes)) kg.setAttribute(name, attr);
    kg.setIndex(picked[i]);
    const mesh = new THREE.Mesh(kg, body.material);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(toRoot);
    mesh.castShadow = body.castShadow;
    const holder = new THREE.Group();
    holder.position.set(-k.x, -k.y, 0);
    holder.add(mesh);
    const pivot = new THREE.Group();
    pivot.position.set(k.x, k.y, 0);
    pivot.add(holder);
    root.add(pivot);
    return { name: k.name, pivot, mesh };
  });
}

function assemble(scene: THREE.Object3D) {
  const find = (re: RegExp) => {
    let hit: THREE.Object3D | undefined;
    scene.traverse((o) => {
      if (!hit && re.test(o.name)) hit = o;
    });
    if (!hit) throw new Error(`resonance: no ${re}`);
    return hit;
  };
  // the old segment display goes; the new screen takes its window
  scene.traverse((o) => {
    if (/^c\d_\d_\d+$/.test(o.name) || /_text_\d+$/.test(o.name) || /^eq_border/.test(o.name)) o.visible = false;
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const mat = m.material as THREE.MeshStandardMaterial;
      // the model is all metal, which reads black in a dark room: take the copper down to a
      // lacquered finish so its colour shows under the lamp, and keep a little shine
      if (mat.isMeshStandardMaterial && mat.name !== 'glass_mat') {
        mat.metalness = Math.min(mat.metalness, 0.55);
        mat.roughness = Math.min(Math.max(mat.roughness, 0.38), 0.62);
        mat.envMapIntensity = 1.7;
      }
    }
  });
  const vinyl = find(/^vinyl_\d+$/);
  vinyl.visible = false;
  const drive = find(/^Lumen_drive/);
  const keys: Record<Key, THREE.Object3D> = {
    rew: find(/^rew_btn/),
    play: find(/^play_btn/),
    pause: find(/^pause_btn/),
    stop: find(/^stop_btn/),
    fwd: find(/fwd_btn/),
    eject: find(/^eject_btn/),
  };
  const cones = [find(/^dif_l/), find(/^dif_r/)];
  const knobs = cutKnobs(scene);
  const rest = {
    drive: drive.position.z,
    eject: keys.eject.position.z,
    cones: cones.map((c) => c.position.z),
    tray: vinyl.position.clone(),
  };

  const display = new RadioDisplay();
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), new THREE.MeshBasicMaterial({ map: display.texture, toneMapped: false }));
  screen.position.set(0, SCREEN.y, SCREEN.z);
  screen.name = 'resonance-screen';
  vinyl.parent!.add(screen);

  const inner = new THREE.Group();
  inner.add(scene);
  scene.position.set(0, -MODEL_MID, 0);
  const outer = new THREE.Group();
  outer.add(inner);

  // one disc per record, cloned from the cabinet's own vinyl, its label the album. They wait
  // unseen: in their sleeves the records are type on the page, and only become 3D to travel
  const discMesh = vinyl.getObjectByProperty('isMesh', true) as THREE.Mesh;
  const discMat = (discMesh.material as THREE.MeshStandardMaterial).clone();
  discMat.side = THREE.DoubleSide;
  discMat.forceSinglePass = true;
  discMat.roughness = 0.3;
  discMat.metalness = 0.4;
  discMat.envMapIntensity = 2.8;
  discMat.emissive = new THREE.Color('#15100b');
  const labelGeo = new THREE.CircleGeometry(VINYL_R * LABEL_R, 56);
  // a faint sheen ring, so a black disc still has an edge against a black room
  const rimGeo = new THREE.RingGeometry(VINYL_R * 0.985, VINYL_R * 1.02, 72);
  const rimMat = new THREE.MeshBasicMaterial({ color: '#c99a58', transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  const discs = records.map((r, i) => {
    const g = new THREE.Group();
    const d = new THREE.Mesh(discMesh.geometry, discMat);
    d.position.copy(discMesh.position);
    d.quaternion.copy(discMesh.quaternion);
    d.scale.copy(discMesh.scale);
    g.add(d);
    const tex = vinylLabel(r, i);
    const label = new THREE.Mesh(labelGeo, new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.5, roughness: 0.5, metalness: 0 }));
    label.rotation.x = -Math.PI / 2;
    label.position.y = 0.0018;
    g.add(label);
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.001;
    g.add(rim);
    return { g, label, spin: 0, spinV: 0, spin0: 0 };
  });
  const rack = new THREE.Group();
  discs.forEach((d) => rack.add(d.g));

  return { scene, outer, rack, display, screen, drive, keys, cones, knobs, rest, parent: vinyl.parent!, discs };
}

type Cabinet = ReturnType<typeof assemble>;

/** An angle brought into (-π, π], so a disc turns the short way back to upright. */
const wrap = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

/**
 * § 03 in 3D: the Resonance cabinet. Choose a record in the list beside it and the mechanism
 * plays out in order: the eject key goes down and the drawer comes out; the record in it (if
 * there is one) goes back to its sleeve; the new one leaves its sleeve, lands on the tray, and
 * the drawer closes on it. Only then is it heard. Every key on the cabinet does what it says,
 * and so does the screen.
 */
export default function Resonance() {
  const gltf = useModel(MODELS.resonance);
  const cab = useMemo<Cabinet>(() => {
    const cached = gltf.scene.userData.cabinet as Cabinet | undefined;
    if (cached) return cached;
    const c = assemble(gltf.scene);
    gltf.scene.userData.cabinet = c;
    return c;
  }, [gltf]);

  const st = useRef({
    phase: 'idle' as Phase,
    /** on the tray, and in the air */
    loaded: -1,
    flying: -1,
    /** flight: 0 = at the sleeve, 1 = on the tray */
    t: 0,
    /** the drawer, 0 = shut, 1 = out (linear; eased when applied) */
    drawer: 0,
    wait: 0,
    keys: { rew: 0, play: 0, pause: 0, stop: 0, fwd: 0, eject: 0 } as Record<Key, number>,
    screenHover: null as Hit | null,
    /** a knob's reading on the screen, until when */
    level: null as { name: string; value: number } | null,
    levelUntil: 0,
    covers: [] as (HTMLImageElement | null)[],
    on: 0,
    bands: new Float32Array(5),
  });
  const tmp = useMemo(
    () => ({
      a: new THREE.Vector3(),
      b: new THREE.Vector3(),
      s: new THREE.Vector3(),
      qb: new THREE.Quaternion(),
      qSpin: new THREE.Quaternion(),
      qStand: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)),
      yAxis: new THREE.Vector3(0, 1, 0),
    }),
    [],
  );

  // covers arrive from Apple once the visitor has allowed it: they become the labels
  useEffect(() => {
    const apply = () => {
      audio.tracks.forEach((t, i) => {
        if (!t.cover || st.current.covers[i]) return;
        st.current.covers[i] = coverTexture(t.cover, (tex) => {
          const lab = cab.discs[i].label.material as THREE.MeshStandardMaterial;
          lab.map?.dispose();
          lab.map = tex;
          lab.emissiveMap = tex;
          lab.emissiveIntensity = 0.35;
          lab.needsUpdate = true;
        });
      });
    };
    apply();
    return audio.subscribe(apply);
  }, [cab]);

  useEffect(
    () => () => {
      setCursor('');
      audio.mechanical = false;
      crateFx.disc.length = 0;
    },
    [],
  );
  const key = useRef<THREE.SpotLight>(null);
  const fill = useRef<THREE.PointLight>(null);
  const keyTarget = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, dt) => {
    const s = st.current;
    const app = useApp.getState();
    const want = app.transport === 'standby' ? -1 : app.record;
    // it stands in the radio's room: drawn only while the view is (swinging) over there
    const visible = radio.pan > 0.001;
    cab.outer.visible = cab.rack.visible = visible;
    audio.mechanical = visible && !rig.reducedMotion;

    // unseen (or with reduced motion) there is no mechanism to watch: the record is simply in
    if (!audio.mechanical) {
      s.phase = 'idle';
      s.loaded = want;
      s.flying = -1;
      s.drawer = 0;
      audio.drawer = want;
      audio.release();
      for (let i = 0; i < records.length; i++) crateFx.disc[i] = i === want ? 'away' : 'rest';
    }
    if (!visible) {
      if (key.current) key.current.intensity = 0;
      if (fill.current) fill.current.intensity = 0;
      return;
    }

    // ── layout: CSS places the cabinet's stage ──────────────
    const box = roomBox('cabinet');
    if (!box) return;
    const H = rig.vh * rig.unitsPerPx;
    // the cabinet fills its box; its front stands proud of the page, so allow for perspective
    let S = Math.min(box.w / MODEL_W, box.h / MODEL_H);
    for (let k = 0; k < 2; k++) {
      const grow = 12 / (12 - 0.4 * S);
      S = Math.min(box.w / (MODEL_W * grow), box.h / (MODEL_H * grow)) * 0.97;
    }
    cab.outer.position.set(box.x, box.y, 0);
    cab.outer.scale.setScalar(S);
    // a slow, heavy turn toward the pointer, like the other machines
    cab.outer.rotation.y = damp(cab.outer.rotation.y, -0.16 + rig.pointer.sx * 0.06, 2, dt);
    cab.outer.rotation.x = damp(cab.outer.rotation.x, 0.05 - rig.pointer.sy * 0.03, 2, dt);
    // the knobs stand where they were left (the model's own turn is where they start)
    audio.readLevels();
    for (const k of cab.knobs) k.pivot.rotation.z = -(knobValue(k.name) - (k.name === 'VOLUME' ? 0.8 : 0.3)) * KNOB_TURN;
    cab.outer.updateMatrixWorld(true);
    // light it where it stands (the lights stay in the scene at zero when unseen, so nothing recompiles)
    if (key.current && fill.current) {
      key.current.intensity = 2.6;
      key.current.position.set(box.x - box.w * 0.45, box.y + box.h * 1.1, 6);
      keyTarget.position.set(box.x - box.w * 0.3, box.y, 0);
      key.current.target = keyTarget;
      fill.current.intensity = 0.9;
      fill.current.position.set(box.x - box.w * 0.75, box.y + box.h * 0.1, 4);
    }

    // ── the mechanism: one step at a time, in order ─────────
    const takeOut = () => {
      s.flying = s.loaded;
      s.loaded = -1;
      audio.drawer = -1;
      s.t = 1;
      cab.discs[s.flying].spin0 = wrap(cab.discs[s.flying].spin);
      s.phase = 'out';
      sfx.whoosh();
    };
    const putIn = () => {
      s.flying = want;
      s.t = 0;
      cab.discs[want].spin = 0;
      cab.discs[want].spinV = 0;
      s.phase = 'in';
      sfx.whoosh();
    };
    if (audio.mechanical) {
      switch (s.phase) {
        case 'idle':
          if (want !== s.loaded) {
            s.phase = 'opening';
            s.keys.eject = 1;
            sfx.click();
            sfx.ratchet();
          }
          break;
        case 'opening':
          s.drawer = Math.min(1, s.drawer + dt / DRAWER_S);
          if (s.drawer >= 1) {
            if (s.loaded >= 0 && s.loaded !== want) takeOut();
            else if (want >= 0 && s.loaded !== want) putIn();
            else {
              s.phase = 'settle';
              s.wait = GAP;
            }
          }
          break;
        case 'out':
          s.t -= dt / FLY;
          if (s.t <= 0) {
            s.t = 0;
            s.flying = -1;
            s.phase = 'gap';
            s.wait = GAP;
          }
          break;
        case 'gap':
          s.wait -= dt;
          if (s.wait <= 0) {
            if (want >= 0) putIn();
            else s.phase = 'closing';
          }
          break;
        case 'in':
          s.t += dt / FLY;
          if (s.t >= 1) {
            s.t = 1;
            s.loaded = s.flying;
            s.flying = -1;
            s.phase = 'settle';
            s.wait = SETTLE;
            sfx.clink();
          }
          break;
        case 'settle':
          s.wait -= dt;
          if (s.wait <= 0) {
            if (s.loaded >= 0 && s.loaded !== want) takeOut();
            else if (want >= 0 && s.loaded !== want) putIn();
            else {
              s.phase = 'closing';
              sfx.ratchet();
            }
          }
          break;
        case 'closing':
          // a change of mind while it closes: it opens again
          if (want !== s.loaded) {
            s.phase = 'opening';
            break;
          }
          s.drawer = Math.max(0, s.drawer - dt / DRAWER_S);
          if (s.drawer <= 0) {
            s.phase = 'idle';
            audio.drawer = s.loaded;
            if (s.loaded >= 0) audio.release();
          }
          break;
      }
      // where each record is, for the list: the chosen one comes out of its sleeve at once
      for (let i = 0; i < records.length; i++)
        crateFx.disc[i] = i === s.loaded || i === s.flying ? 'away' : i === want && s.phase !== 'idle' ? 'pulled' : 'rest';
    }
    const drawer = easeInOutCubic(s.drawer) * DRAWER_OUT;
    cab.drive.position.z = cab.rest.drive + drawer;

    // ── keys ────────────────────────────────────────────────
    for (const k of Object.keys(s.keys) as Key[]) {
      s.keys[k] = Math.max(0, s.keys[k] - dt * 3.2);
      const p = Math.sin(Math.min(1, s.keys[k]) * Math.PI) * (s.keys[k] > 0 ? 1 : 0);
      if (k === 'eject') cab.keys.eject.position.z = cab.rest.eject + drawer - p * 0.012;
      else cab.keys[k].rotation.x = p * KEY_PRESS * 0.55 + (k === 'play' && app.transport === 'play' ? KEY_PRESS * 0.25 : 0) + (k === 'pause' && app.transport === 'pause' ? KEY_PRESS * 0.25 : 0);
    }

    // ── sound on the cones ──────────────────────────────────
    audio.bands(s.bands);
    cab.cones.forEach((c, i) => (c.position.z = cab.rest.cones[i] + s.bands[0] * 0.012 + s.bands[1] * 0.004 * Math.sin(rig.time * 40)));

    // ── the discs: on the tray, or in the air between the tray and a sleeve ──
    cab.parent.getWorldScale(tmp.s);
    const trayScale = tmp.s.x;
    cab.parent.getWorldQuaternion(tmp.qb);
    tmp.b.copy(cab.rest.tray);
    tmp.b.z += drawer;
    cab.parent.localToWorld(tmp.b);
    const spinning = app.transport === 'play' && audio.playing && s.phase === 'idle';
    cab.discs.forEach((d, i) => {
      const onTray = i === s.loaded;
      const inAir = i === s.flying;
      d.g.visible = onTray || inAir;
      if (!d.g.visible) return;
      if (onTray) {
        d.spinV = damp(d.spinV, spinning ? RPM : 0, 1.6, dt);
        d.spin += d.spinV * dt;
        d.g.position.copy(tmp.b);
        d.g.quaternion.copy(tmp.qb);
        d.g.scale.setScalar(trayScale);
      } else {
        // the sleeve end of the flight: exactly where the list draws the record, facing you
        const slot = roomBox(`vinyl-${i}`);
        if (!slot) return;
        const p = easeInOutCubic(clamp(s.t));
        tmp.a.set(slot.x, slot.y, 0);
        const sleeveScale = slot.w / 2 / VINYL_R;
        // an arc out of the list, toward the camera and over, turning flat onto the tray
        d.g.position.lerpVectors(tmp.a, tmp.b, p);
        const lift = Math.sin(p * Math.PI);
        d.g.position.y += lift * H * 0.06;
        d.g.position.z += lift * 1.6;
        d.g.quaternion.slerpQuaternions(tmp.qStand, tmp.qb, easeInOutCubic(clamp(p * 1.25 - 0.15)));
        d.g.scale.setScalar(THREE.MathUtils.lerp(sleeveScale, trayScale, p));
        // a turn in the air; on the way home it unwinds to upright, as the sleeve expects it
        d.spin = (s.phase === 'out' ? d.spin0 * p : 0) + lift * 1.1;
      }
      tmp.qSpin.setFromAxisAngle(tmp.yAxis, d.spin);
      d.g.quaternion.multiply(tmp.qSpin);
    });

    // ── the screen ──────────────────────────────────────────
    const inView = radio.pan > 0.6;
    s.on = inView ? 1 : 0;
    const t = audio.tracks[app.record];
    const moving = s.phase !== 'idle';
    const mode = !s.on
      ? 'off'
      : app.transport === 'standby' && !moving
        ? 'standby'
        : moving || (app.transport === 'play' && !audio.playing)
          ? 'reading'
          : app.transport === 'play'
            ? 'play'
            : app.transport === 'pause'
              ? 'pause'
              : 'stop';
    const dur = audio.duration || 30;
    cab.display.update({
      mode,
      title: t?.title ?? '',
      artist: t?.artist ?? '',
      album: t?.album ?? '',
      cover: s.covers[app.record] ?? null,
      progress: moving ? 0 : clamp(audio.position / dur),
      position: moving ? 0 : audio.position,
      duration: dur,
      bands: s.bands,
      hover: s.screenHover,
      level: s.level && rig.time < s.levelUntil ? s.level : null,
      time: rig.time,
    });
  });

  // ── pointer ─────────────────────────────────────────────
  const cursor = (c: string) => setCursor(c);

  const press = (k: Key) => {
    st.current.keys[k] = 1;
    sfx.click();
    const app = useApp.getState();
    if (k === 'rew') audio.prev();
    else if (k === 'fwd') audio.next();
    else if (k === 'pause') audio.pause();
    else if (k === 'stop') audio.stop();
    else if (k === 'eject') audio.eject();
    else if (k === 'play') audio.play(app.record);
  };

  const keyOf = (o: THREE.Object3D | null): Key | null => {
    for (let n = o; n && n !== cab.outer; n = n.parent) {
      const k = (Object.keys(cab.keys) as Key[]).find((key) => cab.keys[key] === n);
      if (k) return k;
    }
    return null;
  };

  // the cabinet only takes the pointer once the view has swung all the way across to it
  const here = () => radio.pan > 0.99;
  const onCabinetMove = (e: ThreeEvent<PointerEvent>) => {
    const s = st.current;
    if (!here()) return;
    if (e.object === cab.screen && e.uv) {
      s.screenHover = cab.display.hitAt(e.uv.x, e.uv.y);
      cursor(s.screenHover ? 'pointer' : '');
    } else {
      s.screenHover = null;
      cursor(keyOf(e.object) ? 'pointer' : knobAt(e.object) ? 'grab' : '');
    }
  };
  // ── the knobs: drag one (up or right turns it up), or turn the wheel over it
  const knobAt = (o: THREE.Object3D | null) => cab.knobs.find((k) => k.mesh === o) ?? null;
  const knobValue = (name: string) => (name === 'VOLUME' ? audio.volume : audio.preamp);
  const setKnob = (name: string, v: number) => {
    const before = knobValue(name);
    if (name === 'VOLUME') audio.setVolume(v);
    else audio.setPreamp(v);
    const now = knobValue(name);
    // a detent every twentieth of the way
    if (Math.floor(now * 20) !== Math.floor(before * 20)) sfx.tick();
    const s = st.current;
    s.level = { name, value: now };
    s.levelUntil = rig.time + 1.4;
  };
  const onCabinetDown = (e: ThreeEvent<PointerEvent>) => {
    if (!here()) return;
    const k = knobAt(e.object);
    if (!k) return;
    e.stopPropagation();
    audio.readLevels();
    const x0 = e.nativeEvent.clientX;
    const y0 = e.nativeEvent.clientY;
    const v0 = knobValue(k.name);
    cursor('grabbing');
    const move = (ev: PointerEvent) => setKnob(k.name, v0 + (ev.clientX - x0 - (ev.clientY - y0)) * 0.004);
    const up = () => {
      cursor('');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    setKnob(k.name, v0);
  };
  const onCabinetWheel = (e: ThreeEvent<WheelEvent>) => {
    if (!here()) return;
    const k = knobAt(e.object);
    if (!k) return;
    e.stopPropagation();
    audio.readLevels();
    setKnob(k.name, knobValue(k.name) - e.nativeEvent.deltaY * 0.0009);
  };

  const onCabinetOut = () => {
    st.current.screenHover = null;
    cursor('');
  };
  const onCabinetClick = (e: ThreeEvent<MouseEvent>) => {
    if (!here()) return;
    e.stopPropagation();
    if (e.object === cab.screen && e.uv) {
      const hit = cab.display.hitAt(e.uv.x, e.uv.y);
      if (hit === 'prev') press('rew');
      else if (hit === 'next') press('fwd');
      else if (hit === 'toggle') {
        sfx.click();
        audio.toggle();
      } else if (hit === 'seek') audio.seek(cab.display.seekAt(e.uv.x));
      return;
    }
    const k = keyOf(e.object);
    if (k) press(k);
  };

  return (
    <>
      <primitive object={cab.outer} onPointerMove={onCabinetMove} onPointerOut={onCabinetOut} onClick={onCabinetClick} onPointerDown={onCabinetDown} onWheel={onCabinetWheel} />
      <primitive object={cab.rack} />
      {/* its own light: a warm key from the upper left and a low fill over the way the records travel */}
      <spotLight ref={key} angle={0.6} penumbra={0.85} decay={0} distance={60} intensity={0} color="#ffd6a0" />
      <pointLight ref={fill} decay={0} distance={30} intensity={0} color="#ff9d5c" />
      <primitive object={keyTarget} />
    </>
  );
}
