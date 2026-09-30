import * as THREE from 'three';
import { TAU } from '@/lib/math';

export const GEARS_URL = '/models/gears.glb';

/** Copies every attribute into plain Float32 storage (meshopt quantises to normalised ints). */
export function toFloatGeometry(src: THREE.BufferGeometry) {
  const g = new THREE.BufferGeometry();
  for (const name of Object.keys(src.attributes)) {
    const a = src.getAttribute(name) as THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) {
      out[i * a.itemSize] = a.getX(i);
      if (a.itemSize > 1) out[i * a.itemSize + 1] = a.getY(i);
      if (a.itemSize > 2) out[i * a.itemSize + 2] = a.getZ(i);
      if (a.itemSize > 3) out[i * a.itemSize + 3] = a.getW(i);
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  if (src.index) g.setIndex(src.index.clone());
  return g;
}

export type GearDef = {
  name: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  teeth: number;
  tip: number;
  root: number;
  /** pitch radius, and module = 2·pitch / teeth, in the geometry's own units */
  pitch: number;
  module: number;
  /** angle (rad) of the first tooth's centre in the geometry's XY frame */
  phase: number;
  thickness: number;
};

/**
 * Measures a gear from its triangles: trace the outer profile r(θ), threshold it half-way between
 * tip and root, and count the plateaus. Geometry is re-oriented so the axle is +Z and centred.
 */
export function analyseGear(name: string, mesh: THREE.Mesh): GearDef | null {
  mesh.updateWorldMatrix(true, false);
  const g = toFloatGeometry(mesh.geometry);
  g.applyMatrix4(mesh.matrixWorld);
  // the pack lies flat (thin along Y); stand every gear up to face the camera
  g.computeBoundingBox();
  const s = g.boundingBox!.getSize(new THREE.Vector3());
  if (s.y < s.x && s.y < s.z) g.rotateX(Math.PI / 2);
  else if (s.x < s.y && s.x < s.z) g.rotateY(Math.PI / 2);
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingBox();
  const thickness = g.boundingBox!.max.z - g.boundingBox!.min.z;

  // outer profile r(θ) from triangle edges, sampled finely enough that every rim bin is hit
  const BINS = 720;
  const raw = new Float32Array(BINS);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const idx = g.index;
  const triCount = idx ? idx.count / 3 : pos.count / 3;
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const p = new THREE.Vector3();
  const vert = (i: number, out: THREE.Vector3) => out.fromBufferAttribute(pos, idx ? idx.getX(i) : i);
  let extent = 0;
  for (let i = 0; i < pos.count; i++) extent = Math.max(extent, Math.hypot(pos.getX(i), pos.getY(i)));
  const binArc = (extent * TAU) / BINS;
  for (let t = 0; t < triCount; t++) {
    for (let e = 0; e < 3; e++) {
      vert(t * 3 + e, va);
      vert(t * 3 + ((e + 1) % 3), vb);
      const n = Math.min(400, Math.max(2, Math.ceil(va.distanceTo(vb) / (binArc * 0.4))));
      for (let k = 0; k <= n; k++) {
        p.lerpVectors(va, vb, k / n);
        const r = Math.hypot(p.x, p.y);
        let a = Math.atan2(p.y, p.x);
        if (a < 0) a += TAU;
        const bin = Math.min(BINS - 1, Math.floor((a / TAU) * BINS));
        if (r > raw[bin]) raw[bin] = r;
      }
    }
  }
  // dilate: a gap between teeth is tens of bins wide, sampling dips are one or two
  const prof = new Float32Array(BINS);
  for (let i = 0; i < BINS; i++) {
    let m = 0;
    for (let k = -2; k <= 2; k++) m = Math.max(m, raw[(i + k + BINS) % BINS]);
    prof[i] = m;
  }
  let tip = 0;
  for (let i = 0; i < BINS; i++) tip = Math.max(tip, prof[i]);
  const sorted = Array.from(prof).sort((a, b) => a - b);
  const root = sorted[Math.floor(BINS * 0.08)];
  const hi = root + (tip - root) * 0.62;
  const lo = root + (tip - root) * 0.38;

  // count plateaus with hysteresis, starting from a bin inside a gap
  let start = 0;
  while (start < BINS && prof[start] >= lo) start++;
  let teeth = 0;
  let inTooth = false;
  let toothStart = 0;
  let firstCentre = -1;
  for (let k = 1; k <= BINS; k++) {
    const i = (start + k) % BINS;
    if (!inTooth && prof[i] >= hi) {
      inTooth = true;
      toothStart = start + k;
    } else if (inTooth && prof[i] < lo) {
      inTooth = false;
      teeth++;
      if (firstCentre < 0) firstCentre = ((toothStart + (start + k)) / 2) % BINS;
    }
  }
  if (teeth < 6 || teeth > 80) return null;
  const pitch = (tip + root) / 2;
  return {
    name,
    geometry: g,
    material: mesh.material as THREE.Material,
    teeth,
    tip,
    root,
    pitch,
    module: (2 * pitch) / teeth,
    phase: (firstCentre / BINS) * TAU,
    thickness,
  };
}

export function analyseGearPack(scene: THREE.Object3D) {
  scene.updateMatrixWorld(true);
  const defs: GearDef[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      const d = analyseGear(m.name, m);
      if (d) defs.push(d);
    }
  });
  return defs;
}

/** A gear placed in a train. Its angle is always `ratio · input + offset`. */
export type Placed = {
  def: GearDef;
  scale: number;
  x: number;
  y: number;
  z: number;
  /** pitch radius in world units */
  r: number;
  ratio: number;
  offset: number;
  parent: number;
};

/**
 * Lay out a train: each step names a gear and the direction (radians) from the previous gear.
 * All gears are rescaled to share `module`, so every neighbouring pair meshes; ratios and
 * tooth phases are solved so teeth interleave on the line of centres.
 */
export function layoutTrain(
  defs: GearDef[],
  steps: { gear: number; dir: number; parent?: number; z?: number; axle?: boolean }[],
  module: number,
  origin = new THREE.Vector2(),
) {
  const out: Placed[] = [];
  steps.forEach((st, i) => {
    const def = defs[st.gear % defs.length];
    const scale = module / def.module;
    const r = (module * def.teeth) / 2;
    if (i === 0) {
      out.push({ def, scale, x: origin.x, y: origin.y, z: st.z ?? 0, r, ratio: 1, offset: 0, parent: -1 });
      return;
    }
    const pi = st.parent ?? i - 1;
    const par = out[pi];
    if (st.axle) {
      // compound gear: same axle, same angle, sits in front
      out.push({ def, scale, x: par.x, y: par.y, z: st.z ?? par.z + 0.12, r, ratio: par.ratio, offset: par.offset, parent: pi });
      return;
    }
    const dist = par.r + r;
    const x = par.x + Math.cos(st.dir) * dist;
    const y = par.y + Math.sin(st.dir) * dist;
    const ratio = -par.ratio * (par.def.teeth / def.teeth);
    // solve the offset so a gap of this gear faces a tooth of the parent along the line of centres
    const psi = st.dir;
    const aStar = psi - par.def.phase; // parent's own angle when one of its teeth points at us…
    const inputStar = (aStar - par.offset) / par.ratio; // …expressed as an input angle
    const want = psi + Math.PI - def.phase - Math.PI / def.teeth;
    const offset = want - ratio * inputStar;
    out.push({ def, scale, x, y, z: st.z ?? par.z, r, ratio, offset, parent: pi });
  });
  return out;
}
