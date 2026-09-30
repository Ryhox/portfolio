import * as THREE from 'three';

/**
 * The office, in metres. +Z points from the desk toward the way in; the window is in the left
 * wall and the afternoon sun comes through it, low, across the desk.
 */
export const ROOM = { x0: -3.2, x1: 3.2, z0: -3.0, z1: 3.6, h: 3.1 };
/** the opening in the left wall, centred at z, from sill to head */
export const WINDOW = { z: -0.95, y0: 1.08, y1: 2.72, w: 1.36 };
export const WAINSCOT = 1.0;

export type Surface = { map: THREE.Texture; normal?: THREE.Texture; arm?: THREE.Texture };

const dup = (t: THREE.Texture | undefined, repeat: [number, number]) => {
  if (!t) return undefined;
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(repeat[0], repeat[1]);
  c.anisotropy = 8;
  c.needsUpdate = true;
  return c;
};

/** A PBR material from a texture set, each map repeated per metre of surface (UVs are in metres). */
function material(s: Surface, metresPerTile: number, opts: THREE.MeshStandardMaterialParameters = {}) {
  const r: [number, number] = [1 / metresPerTile, 1 / metresPerTile];
  const arm = dup(s.arm, r);
  const normal = dup(s.normal, r);
  return new THREE.MeshStandardMaterial({
    map: dup(s.map, r),
    ...(normal ? { normalMap: normal } : {}),
    ...(arm ? { aoMap: arm, roughnessMap: arm, metalnessMap: arm, metalness: 1 } : { metalness: 0 }),
    roughness: 1,
    ...opts,
  });
}

/** A flat band of wall from x 0..len and y y0..y1 (UVs in metres), with rectangular holes. */
function band(len: number, y0: number, y1: number, holes: [number, number, number, number][] = []) {
  const s = new THREE.Shape();
  s.moveTo(0, y0);
  s.lineTo(len, y0);
  s.lineTo(len, y1);
  s.lineTo(0, y1);
  s.lineTo(0, y0);
  for (const [hx0, hy0, hx1, hy1] of holes) {
    const h = new THREE.Path();
    h.moveTo(hx0, hy0);
    h.lineTo(hx0, hy1);
    h.lineTo(hx1, hy1);
    h.lineTo(hx1, hy0);
    h.lineTo(hx0, hy0);
    s.holes.push(h);
  }
  const g = new THREE.ShapeGeometry(s);
  return g;
}

/** The four walls: where each starts, which way it runs, how long it is. */
function walls() {
  const { x0, x1, z0, z1 } = ROOM;
  return [
    { name: 'back', origin: new THREE.Vector3(x0, 0, z0), rot: 0, len: x1 - x0 },
    { name: 'right', origin: new THREE.Vector3(x1, 0, z0), rot: -Math.PI / 2, len: z1 - z0 },
    { name: 'front', origin: new THREE.Vector3(x1, 0, z1), rot: Math.PI, len: x1 - x0 },
    { name: 'left', origin: new THREE.Vector3(x0, 0, z1), rot: Math.PI / 2, len: z1 - z0 },
  ];
}

export function buildRoom(t: { paper: Surface; panel: Surface; floor: Surface; ceiling: Surface; rug: Surface }) {
  const group = new THREE.Group();
  group.name = 'room';
  const paper = material(t.paper, 2.0, { metalness: 0, roughness: 0.9 });
  paper.metalnessMap = null;
  const panel = material(t.panel, 1.1, { color: '#c09274' });
  // waxed, not lacquered: a soft sheen rather than a mirror
  const floor = material(t.floor, 1.6, { color: '#c09a76' });
  floor.roughnessMap = null;
  floor.metalnessMap = null;
  floor.roughness = 0.72;
  floor.metalness = 0;
  floor.envMapIntensity = 0.5;
  const ceiling = material(t.ceiling, 2.4, { color: '#9a8a74' });
  const trim = new THREE.MeshStandardMaterial({ color: '#50301c', roughness: 0.42, metalness: 0.05 });
  const { x0, x1, z0, z1, h } = ROOM;

  const add = (g: THREE.BufferGeometry, m: THREE.Material, fn?: (o: THREE.Mesh) => void) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    fn?.(mesh);
    group.add(mesh);
    return mesh;
  };

  for (const w of walls()) {
    const place = (o: THREE.Object3D) => {
      o.position.copy(w.origin);
      o.rotation.y = w.rot;
    };
    // the window, in the left wall: that wall runs from z1 toward z0, so the opening sits at z1 - z
    const holes: [number, number, number, number][] =
      w.name === 'left' ? [[z1 - WINDOW.z - WINDOW.w / 2, WINDOW.y0, z1 - WINDOW.z + WINDOW.w / 2, WINDOW.y1]] : [];
    add(band(w.len, WAINSCOT, h, holes), paper, place);
    add(band(w.len, 0, WAINSCOT), panel, place);
    // a thick shell behind, so the sun only comes in through the window
    add(new THREE.BoxGeometry(w.len + 0.6, h + 0.6, 0.2).translate(w.len / 2, h / 2, -0.12), trim, (o) => {
      place(o);
      o.receiveShadow = false;
      if (w.name === 'left') o.visible = false;
    });
    // mouldings: skirting, chair rail, cornice
    const run = (y: number, height: number, depth: number) =>
      add(new THREE.BoxGeometry(w.len, height, depth).translate(w.len / 2, y + height / 2, depth / 2), trim, place);
    run(0, 0.17, 0.025);
    run(0.17, 0.02, 0.035);
    run(WAINSCOT - 0.03, 0.05, 0.04);
    run(WAINSCOT + 0.02, 0.015, 0.025);
    run(h - 0.16, 0.16, 0.06);
    run(h - 0.24, 0.05, 0.1);
  }
  // the left wall's shell, with the opening cut through it (built from four blocks round the window)
  {
    const zc = WINDOW.z;
    const d = 0.3;
    const block = (za: number, zb: number, ya: number, yb: number) =>
      add(new THREE.BoxGeometry(d, yb - ya, zb - za).translate(x0 - d / 2 - 0.02, (ya + yb) / 2, (za + zb) / 2), trim, (o) => (o.receiveShadow = false));
    block(z0 - 0.3, zc - WINDOW.w / 2, -0.3, h + 0.3);
    block(zc + WINDOW.w / 2, z1 + 0.3, -0.3, h + 0.3);
    block(zc - WINDOW.w / 2, zc + WINDOW.w / 2, -0.3, WINDOW.y0);
    block(zc - WINDOW.w / 2, zc + WINDOW.w / 2, WINDOW.y1, h + 0.3);
    // the architrave and sill, inside
    const ar = 0.11;
    add(new THREE.BoxGeometry(0.03, WINDOW.y1 - WINDOW.y0 + ar, ar).translate(x0 + 0.015, (WINDOW.y0 + WINDOW.y1 + ar) / 2, zc - WINDOW.w / 2 - ar / 2), trim);
    add(new THREE.BoxGeometry(0.03, WINDOW.y1 - WINDOW.y0 + ar, ar).translate(x0 + 0.015, (WINDOW.y0 + WINDOW.y1 + ar) / 2, zc + WINDOW.w / 2 + ar / 2), trim);
    add(new THREE.BoxGeometry(0.03, ar, WINDOW.w + ar * 2).translate(x0 + 0.015, WINDOW.y1 + ar / 2, zc), trim);
    add(new THREE.BoxGeometry(0.16, 0.045, WINDOW.w + 0.26).translate(x0 + 0.06, WINDOW.y0 - 0.022, zc), trim);
  }

  // the floor: herringbone, and the ceiling
  const fl = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  fl.rotateX(-Math.PI / 2);
  fl.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  // UVs in metres
  const uv = fl.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (x1 - x0), uv.getY(i) * (z1 - z0));
  add(fl, floor, (o) => (o.castShadow = false));
  const ce = fl.clone();
  ce.rotateX(Math.PI);
  ce.translate(0, h, (z0 + z1));
  add(ce, ceiling);

  // the rug under the desk, fringe and all
  const rugW = 3.3;
  const rugD = 2.2;
  const rugTex = t.rug.map;
  rugTex.center.set(0.5, 0.5);
  rugTex.rotation = Math.PI / 2;
  const rugMat = new THREE.MeshStandardMaterial({
    map: rugTex,
    normalMap: dup(t.rug.normal, [3, 3]),
    roughnessMap: dup(t.rug.arm, [3, 3]),
    roughness: 1,
    metalness: 0,
    alphaTest: 0.5,
  });
  const rug = new THREE.PlaneGeometry(rugW, rugD);
  rug.rotateX(-Math.PI / 2);
  add(rug, rugMat, (o) => {
    o.position.set(0.15, 0.012, -0.95);
    o.castShadow = false;
  });
  const body = new THREE.BoxGeometry(rugW * (1 - 80 / 1536), 0.01, rugD * 0.992);
  add(body, new THREE.MeshStandardMaterial({ color: '#2a0f0c', roughness: 1 }), (o) => {
    o.position.set(0.15, 0.005, -0.95);
    o.castShadow = false;
  });

  return { group, box: new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, h, z1)) };
}
