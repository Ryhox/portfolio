'use client';

import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MODELS, preloadModel, useModel } from '@/lib/models';
import { rig } from '@/lib/rig';
import { useApp } from '@/lib/store';
import { spring } from '@/lib/math';
import { sfx } from '@/audio/sfx';
import { KEY_ALIASES, KEY_ROWS, charForCode } from './keymap';
import type { LumenOS } from './LumenOS';
import { tube } from './tube';

preloadModel(MODELS.computer);

/** The machine faces left of camera, three-quarter on. */
const BASE_YAW = -0.32;

/** How far the lid folds down when the case is shut (radians about the hinge). */
const LID_CLOSED = Math.PI / 2 * 0.985;

type Cap = { node: THREE.Object3D; rest: THREE.Vector3; dir: THREE.Vector3; d: number; v: number; down: boolean };

const screenVert = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const screenFrag = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tCRT;
  uniform float uGain;
  uniform float uSheen;
  void main() {
    vec3 c = texture2D(tCRT, vUv).rgb * uGain;
    // a soft window reflection on the glass, gone by the time we are inside
    float s = smoothstep(0.55, 0.0, distance(vUv * vec2(1.6, 1.0), vec2(0.34, 0.86)));
    c += vec3(1.0, 0.86, 0.7) * s * s * uSheen;
    gl_FragColor = vec4(c, 1.0);
  }
`;

type Machine = ReturnType<typeof assemble>;

/** Build once per loaded model: re-running would re-parent parts and duplicate the screen. */
function buildMachine(scene: THREE.Group, animations: THREE.AnimationClip[], crt: THREE.Texture): Machine {
  const cached = scene.userData.machine as Machine | undefined;
  if (cached) {
    cached.screenMat.uniforms.tCRT.value = crt;
    return cached;
  }
  const m = assemble(scene, animations, crt);
  scene.userData.machine = m;
  return m;
}

function assemble(scene: THREE.Group, animations: THREE.AnimationClip[], crt: THREE.Texture) {
  scene.updateMatrixWorld(true);

  // ── seat the machine: centred on the case, resting on y = 0
  const box = new THREE.Box3().setFromObject(scene);
  const offset = new THREE.Vector3(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);

  // ── the case alone, lid open (as modelled), without the trackball and its cable off to the
  //    right: this is what the hero framing centres
  const caseBox = new THREE.Box3();
  const part = new THREE.Box3();
  const mid = new THREE.Vector3();
  scene.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    part.setFromObject(o);
    if (part.getCenter(mid).x < 1.6) caseBox.union(part);
  });
  caseBox.translate(offset);

  // ── the picture tube: hide the baked screen, measure it, replace it with ours
  let screenBox: THREE.Box3 | null = null;
  const glassOverScreen: THREE.Mesh[] = [];
  const emissive = new Set<THREE.MeshStandardMaterial>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.name === 'image') {
      m.visible = false;
      if (!screenBox) screenBox = new THREE.Box3().setFromObject(m);
    }
  });
  const sb = screenBox ?? new THREE.Box3(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 1, 0));
  const localCenter = sb.getCenter(new THREE.Vector3()).add(offset);
  const size = sb.getSize(new THREE.Vector3());
  // the tube's phosphor sits a touch inside the bezel
  const hw = (size.x / 2) * 0.965;
  const hh = (size.y / 2) * 0.955;

  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.name === 'glass') {
      const b = new THREE.Box3().setFromObject(m);
      const c = b.getCenter(new THREE.Vector3());
      if (c.z >= sb.min.z - 0.01 && Math.abs(c.x - (sb.min.x + sb.max.x) / 2) < size.x * 0.3 && Math.abs(c.y - (sb.min.y + sb.max.y) / 2) < size.y * 0.3) {
        glassOverScreen.push(m);
        m.material = mat.clone();
        (m.material as THREE.Material).transparent = true;
      }
    }
    if (mat.isMeshStandardMaterial) {
      mat.envMapIntensity = 1;
      // the machine's own filaments (keyboard strips, trackball, spark tube) keep their original burn
      if (mat.name === 'mat_emis' && !emissive.has(mat)) {
        mat.userData.baseEmissive = mat.emissiveIntensity;
        emissive.add(mat);
      }
    }
    m.castShadow = false;
    m.receiveShadow = false;
  });

  // ── the lid: every part above the hinge swings on one axis, so the case can open on arrival
  const hinge = new THREE.Vector3(sb.getCenter(new THREE.Vector3()).x, sb.min.y - 0.23, sb.min.z + 0.04);
  scene.traverse((o) => {
    if (/^top_case_conector_cylinder/.test(o.name)) new THREE.Box3().setFromObject(o).getCenter(hinge);
  });
  const lid = new THREE.Group();
  lid.name = 'lid';
  lid.position.copy(hinge);
  scene.add(lid);
  lid.updateMatrixWorld(true);
  const lidParts: THREE.Object3D[] = [];
  const hingeParts: THREE.Object3D[] = [];
  const probe = new THREE.Vector3();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    new THREE.Box3().setFromObject(m).getCenter(probe);
    if (probe.y > hinge.y + 0.17) lidParts.push(m);
    else if (/^gears\d{3}/.test(m.parent?.name ?? '')) hingeParts.push(m);
  });
  lidParts.forEach((m) => lid.attach(m));
  const hingeGears = new THREE.Group();
  hingeGears.position.copy(hinge);
  scene.add(hingeGears);
  hingeGears.updateMatrixWorld(true);
  hingeParts.forEach((m) => hingeGears.attach(m));
  const screenLocal = lid.worldToLocal(sb.getCenter(new THREE.Vector3()));

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(hw * 2, hh * 2),
    new THREE.MeshStandardMaterial({ color: '#030201', roughness: 0.12, metalness: 0.0 }),
  );
  glass.position.copy(screenLocal).add(new THREE.Vector3(0, 0, 0.002));
  lid.add(glass);

  const screenMat = new THREE.ShaderMaterial({
    vertexShader: screenVert,
    fragmentShader: screenFrag,
    uniforms: { tCRT: { value: crt }, uGain: { value: 1 }, uSheen: { value: 0.05 } },
    toneMapped: false,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), screenMat);
  screen.position.copy(screenLocal).add(new THREE.Vector3(0, 0, 0.004));
  screen.renderOrder = 2;
  lid.add(screen);

  // ── keycaps: sorted into rows by depth, columns by x, then given a QWERTY layout
  const capsRaw: { node: THREE.Object3D; x: number; z: number }[] = [];
  scene.traverse((o) => {
    if (/^keykup/.test(o.name) && !(o as THREE.Mesh).isMesh) {
      const p = new THREE.Box3().setFromObject(o).getCenter(new THREE.Vector3());
      capsRaw.push({ node: o, x: p.x, z: p.z });
    }
  });
  capsRaw.sort((a, b) => a.z - b.z);
  const rows: (typeof capsRaw)[] = [];
  for (const c of capsRaw) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[row.length - 1].z - c.z) < 0.06) row.push(c);
    else rows.push([c]);
  }
  const caps = new Map<string, Cap>();
  const capByNode = new Map<THREE.Object3D, string>();
  const worldDown = new THREE.Vector3(0, -1, 0);
  rows.forEach((row, ri) => {
    row.sort((a, b) => a.x - b.x);
    const layout = KEY_ROWS[Math.min(ri, KEY_ROWS.length - 1)];
    row.forEach((c, ci) => {
      const code = layout[ci];
      if (!code) return;
      const parent = c.node.parent!;
      const wp = c.node.getWorldPosition(new THREE.Vector3());
      // one world unit of downward travel, expressed in the cap's parent space (which may be scaled)
      const a = parent.worldToLocal(wp.clone());
      const b = parent.worldToLocal(wp.clone().add(worldDown));
      caps.set(code, { node: c.node, rest: c.node.position.clone(), dir: b.sub(a), d: 0, v: 0, down: false });
      capByNode.set(c.node, code);
    });
  });

  // ── trackball
  let ball: THREE.Object3D | null = null;
  scene.traverse((o) => {
    if (!ball && /^ball/.test(o.name)) ball = o;
  });

  // ── the machine's own clockwork, minus the baked screen animation
  const mixer = new THREE.AnimationMixer(scene);
  for (const clip of animations) {
    const c = clip.clone();
    c.tracks = c.tracks.filter((t) => !/image_monitor/.test(t.name));
    mixer.clipAction(c).play();
  }

  return {
    offset,
    localCenter,
    hw,
    hh,
    glass,
    screen,
    screenMat,
    caps,
    capByNode,
    ball: ball as THREE.Object3D | null,
    mixer,
    glassOverScreen,
    emissive: [...emissive],
    lid,
    hingeGears,
    caseBox,
  };
}

export default function Computer({ os, crt }: { os: LumenOS; crt: THREE.Texture }) {
  const gltf = useModel(MODELS.computer);
  const group = useRef<THREE.Group>(null);
  const m = useMemo(() => buildMachine(gltf.scene, gltf.animations, crt), [gltf, crt]);
  const lastTyped = useRef(-10);
  const ballSpin = useRef({ vx: 0, vy: 0, dragging: false, lx: 0, ly: 0 });
  const yaw = useRef({ x: 0, v: 0 });

  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __computer: unknown }).__computer = { gltf, m };
  }, [gltf, m]);

  // ── keyboard → keycaps + terminal
  useEffect(() => {
    const press = (code: string, down: boolean) => {
      const cap = m.caps.get(code) ?? m.caps.get(KEY_ALIASES[code] ?? '');
      if (cap) cap.down = down;
    };
    const canType = (e: KeyboardEvent) => {
      if (e.metaKey || e.altKey) return false;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(t.tagName))) return false;
      const st = useApp.getState();
      return rig.route === 'home' && st.stage === 'ready' && !st.menuOpen && rig.dive < 0.2 && rig.exit === 0;
    };
    // keys the page (or the browser) also uses: the terminal only takes them while it is in use
    const SHARED = new Set([' ', 'Enter', 'Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End']);
    const OWN = new Set(['Backspace', 'Delete']);
    const onDown = (e: KeyboardEvent) => {
      if (!canType(e)) return;
      press(e.code, true);
      const inUse = os.busy || os.input.length > 0 || rig.time - lastTyped.current < 8;
      if ((SHARED.has(e.key) || e.ctrlKey) && !inUse) return;
      if (e.key.length !== 1 && !SHARED.has(e.key) && !OWN.has(e.key)) return;
      // copying a selection from the page stays copying
      if (e.ctrlKey && e.key.toLowerCase() === 'c' && window.getSelection()?.toString()) return;
      if (!os.key({ key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey })) return;
      e.preventDefault();
      lastTyped.current = rig.time;
      if (!e.repeat) sfx.key(e.key === 'Enter');
    };
    const onUp = (e: KeyboardEvent) => {
      press(e.code, false);
      os.keyup({ key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey });
    };
    const onBlur = () => m.caps.forEach((c) => (c.down = false));
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [m, os]);

  const capFromEvent = (e: ThreeEvent<PointerEvent>) => {
    let o: THREE.Object3D | null = e.object;
    while (o) {
      const code = m.capByNode.get(o);
      if (code) return code;
      o = o.parent;
    }
    return null;
  };

  const interactive = () => rig.dive < 0.15 && useApp.getState().stage === 'ready';

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive()) return;
    const code = capFromEvent(e);
    if (code) {
      e.stopPropagation();
      const cap = m.caps.get(code)!;
      cap.down = true;
      // a cap pressed with the mouse (or a finger) types as its key would
      const ch = charForCode(code);
      const key = code === 'Enter' || code === 'Backspace' || code === 'Tab' ? code : ch ? ch.toLowerCase() : null;
      if (key) os.key({ key, ctrl: false, shift: false });
      lastTyped.current = rig.time;
      sfx.key(code === 'Enter');
      const up = () => {
        if (key) os.keyup({ key, ctrl: false, shift: false });
        cap.down = false;
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointerup', up);
      return;
    }
    let o: THREE.Object3D | null = e.object;
    while (o && o !== m.ball) o = o.parent;
    if (o && m.ball) {
      e.stopPropagation();
      const b = ballSpin.current;
      b.dragging = true;
      b.lx = e.clientX;
      b.ly = e.clientY;
      document.documentElement.style.cursor = 'grabbing';
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - b.lx;
        const dy = ev.clientY - b.ly;
        b.lx = ev.clientX;
        b.ly = ev.clientY;
        b.vx = dx * 0.6;
        b.vy = dy * 0.6;
        yaw.current.v += dx * 0.004;
      };
      const up = () => {
        b.dragging = false;
        document.documentElement.style.cursor = '';
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    }
  };

  const onPointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (!interactive()) return;
    const code = capFromEvent(e);
    let o: THREE.Object3D | null = e.object;
    while (o && o !== m.ball) o = o.parent;
    if (code || o) document.documentElement.style.cursor = o ? 'grab' : 'pointer';
  };
  const onPointerOut = () => {
    if (!ballSpin.current.dragging) document.documentElement.style.cursor = '';
  };

  const _wp = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const dive = Math.max(rig.dive, 1 - rig.intro, rig.exit > 0 ? 1 - rig.exit : 0);

    m.mixer.update(dt);

    // keycaps: stiff little springs with a hint of overshoot
    m.caps.forEach((c) => {
      const [d, v] = spring(c.d, c.v, c.down ? 1 : 0, 2200, 48, Math.min(dt, 1 / 30));
      c.d = d;
      c.v = v;
      c.node.position.copy(c.rest).addScaledVector(c.dir, d * 0.011);
    });

    // trackball inertia; spinning it turns the whole machine a little on its base
    const b = ballSpin.current;
    if (m.ball) {
      m.ball.rotateOnWorldAxis(THREE.Object3D.DEFAULT_UP, b.vx * 0.01);
      m.ball.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), b.vy * 0.01);
      if (!b.dragging) {
        b.vx *= Math.exp(-2.5 * dt);
        b.vy *= Math.exp(-2.5 * dt);
      }
    }
    const y = yaw.current;
    const [yx, yv] = spring(y.x, y.v, 0, 6, 3.2, dt);
    y.x = Math.max(-0.5, Math.min(0.5, yx)) * (1 - dive);
    y.v = yv;
    // turned to face left, like the machine on shader.se; the trackball can swing it a little further
    g.rotation.y = BASE_YAW + y.x;

    // filaments breathe, and brighten for a moment with every keystroke
    const typing = Math.max(0, 1 - (rig.time - lastTyped.current) * 2.5);
    for (const e of m.emissive) {
      const base = (e.userData.baseEmissive as number) ?? 1;
      // the filaments wake with the tube: dark while the case is shut
      e.emissiveIntensity = base * 0.8 * (0.9 + 0.1 * Math.sin(rig.time * 1.3) + typing * 0.35) * (0.08 + 0.92 * rig.power);
    }

    if (m.ball) m.ball.getWorldPosition(tube.ball);

    // the lid swings on its hinge; the hinge's own gears turn with it
    m.lid.rotation.x = LID_CLOSED * (1 - rig.lidOpen);
    m.hingeGears.rotation.x = -(1 - rig.lidOpen) * 2.6;

    // the glass over the tube clears as we approach it
    for (const gm of m.glassOverScreen) {
      const mat = gm.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.5 * (1 - Math.min(1, dive * 3));
      gm.visible = mat.opacity > 0.01;
    }

    // publish the tube's world frame
    g.updateMatrixWorld();
    tube.C.copy(m.localCenter).applyMatrix4(g.matrixWorld);
    tube.R.set(1, 0, 0).transformDirection(g.matrixWorld);
    tube.U.set(0, 1, 0).transformDirection(g.matrixWorld);
    tube.N.set(0, 0, 1).transformDirection(g.matrixWorld);
    tube.hw = m.hw;
    tube.hh = m.hh;
    tube.focus.copy(_wp.set(0, m.localCenter.y * 0.62, 0).applyMatrix4(g.matrixWorld));
    // the middle of the case itself (the trackball sits off to one side, so not the model's centre)
    tube.base.copy(_wp.set(m.localCenter.x, m.localCenter.y * 0.18, m.localCenter.z + 1.05).applyMatrix4(g.matrixWorld));
    // the open case's corners, for the hero framing to centre
    for (let i = 0; i < 8; i++) {
      const b = m.caseBox;
      tube.box[i].set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(g.matrixWorld);
    }
    tube.ready = true;

    m.screen.scale.set((tube.cw + (tube.hw - tube.cw) * tube.fill) * 2, (tube.ch + (tube.hh - tube.ch) * tube.fill) * 2, 1);
    m.screenMat.uniforms.uSheen.value = 0.06 * (1 - dive);
  });

  return (
    <group ref={group} onPointerDown={onPointerDown} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
      <primitive object={gltf.scene} position={m.offset} />
    </group>
  );
}
