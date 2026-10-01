import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toFloatGeometry } from '../works/gears';

/** at most this many vertices to a merged mesh (a few big ones upload better than one huge one) */
const MAX_VERTS = 60000;

/**
 * Nothing in the room moves, but it arrives as hundreds of separate meshes (every book on the
 * shelf is two): each is a draw call a frame, and another when the sun's shadow is drawn. Every
 * mesh under `root` that shares a material, and its part in the shadows, is made one here: the
 * same picture from a tenth of the draw calls. Whatever is under one of `keep` is left as it is
 * (what is animated, or placed later), and so is anything see-through. `rest` hands the frame
 * back between meshes.
 */
export async function mergeStatic(root: THREE.Object3D, keep: THREE.Object3D[], rest: () => Promise<void>) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const kept = (o: THREE.Object3D) => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible || keep.includes(p)) return true;
    return false;
  };
  const sets = new Map<string, THREE.Mesh[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh & { isSkinnedMesh?: boolean; isInstancedMesh?: boolean };
    if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || Array.isArray(m.material) || kept(m)) return;
    // (what is see-through is drawn back to front, mesh by mesh: made one, its parts would be
    // drawn in whatever order they were joined, the near ones under the far)
    if (m.material.transparent) return;
    const g = m.geometry;
    if (Object.keys(g.morphAttributes).length) return;
    // only like with like: the same material, the same part in the shadows, the same attributes
    const key = [m.material.uuid, m.castShadow, m.receiveShadow, !!g.index, Object.keys(g.attributes).sort().join()].join('|');
    const list = sets.get(key);
    if (list) list.push(m);
    else sets.set(key, [m]);
  });

  const m4 = new THREE.Matrix4();
  for (const list of sets.values()) {
    if (list.length < 2) continue;
    let parts: THREE.BufferGeometry[] = [];
    let from: THREE.Mesh[] = [];
    let verts = 0;
    const flush = () => {
      if (parts.length > 1) {
        const merged = mergeGeometries(parts, false);
        // (the meshes it was made from go only once there is something to put in their place)
        if (merged) {
          const mesh = new THREE.Mesh(merged, list[0].material);
          mesh.castShadow = list[0].castShadow;
          mesh.receiveShadow = list[0].receiveShadow;
          root.add(mesh);
          for (const m of from) m.removeFromParent();
        }
      }
      for (const p of parts) p.dispose();
      parts = [];
      from = [];
      verts = 0;
    };
    for (const m of list) {
      m4.multiplyMatrices(inv, m.matrixWorld);
      // a mirrored piece faces the other way once its mirroring is baked in: its triangles are
      // turned back (one without an index is simply left as it is)
      const mirrored = m4.determinant() < 0;
      if (mirrored && !m.geometry.index) continue;
      // (the models' attributes are packed into integers: unpacked, so they can be moved)
      const g = toFloatGeometry(m.geometry);
      g.applyMatrix4(m4);
      const idx = g.index;
      if (mirrored && idx) {
        for (let i = 0; i < idx.count; i += 3) {
          const a = idx.getX(i);
          idx.setX(i, idx.getX(i + 2));
          idx.setX(i + 2, a);
        }
      }
      const n = g.getAttribute('position').count;
      if (verts + n > MAX_VERTS) flush();
      parts.push(g);
      from.push(m);
      verts += n;
      await rest();
    }
    flush();
    await rest();
  }
}
