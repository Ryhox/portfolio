import * as THREE from 'three';
import { toFloatGeometry } from './gears';

/**
 * The Victorian frame model, split in two: the carved frame itself, and the oval "photograph"
 * surface (found by where its triangles sit in the texture atlas), which gets fresh UVs so any
 * picture or video can be mapped onto it. Both face +Z, centred, 2 units tall.
 */
export type FrameKit = {
  frame: THREE.BufferGeometry;
  photo: THREE.BufferGeometry;
  material: THREE.Material;
  /** photo aspect (width / height) of the oval opening */
  photoAspect: number;
  width: number;
  height: number;
};

export function buildFrameKit(scene: THREE.Object3D, landscape = false): FrameKit {
  scene.updateMatrixWorld(true);
  let mesh: THREE.Mesh | null = null;
  scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
  });
  const m = mesh as unknown as THREE.Mesh;
  const g = toFloatGeometry(m.geometry);
  g.applyMatrix4(m.matrixWorld);
  // the model faces +X; turn it to face the camera
  g.computeBoundingBox();
  const s = g.boundingBox!.getSize(new THREE.Vector3());
  if (s.x < s.z) g.rotateY(-Math.PI / 2);
  g.computeBoundingBox();
  const c = g.boundingBox!.getCenter(new THREE.Vector3());
  g.translate(-c.x, -c.y, -c.z);
  g.computeBoundingBox();
  const h = g.boundingBox!.max.y - g.boundingBox!.min.y;
  g.scale(2 / h, 2 / h, 2 / h);
  // hung on its side, the oval becomes a landscape opening for screen recordings
  if (landscape) g.rotateZ(Math.PI / 2);
  g.computeBoundingBox();

  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const idx = g.index!;
  const photoTris: number[] = [];
  const tA = new THREE.Vector3();
  const tB = new THREE.Vector3();
  const tC = new THREE.Vector3();
  const tN = new THREE.Vector3();
  const tAB = new THREE.Vector3();
  const frameTris: number[] = [];
  /** half extents of the whole frame */
  const fb0 = g.boundingBox!.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  for (let t = 0; t < idx.count; t += 3) {
    const a = idx.getX(t);
    const b = idx.getX(t + 1);
    const cc = idx.getX(t + 2);
    const u = (uv.getX(a) + uv.getX(b) + uv.getX(cc)) / 3;
    const v = (uv.getY(a) + uv.getY(b) + uv.getY(cc)) / 3;
    // the photograph's island in the atlas (lower right of the texture), front-facing only:
    // the island also wraps round the canvas edge, which must stay hidden inside the frame
    tA.fromBufferAttribute(pos, a);
    tB.fromBufferAttribute(pos, b);
    tC.fromBufferAttribute(pos, cc);
    tN.subVectors(tC, tB).cross(tAB.subVectors(tA, tB)).normalize();
    const front = tN.z > 0.8;
    const island = u > 0.52 && u < 0.975 && v > 0.49 && v < 0.93;
    // a few stray pieces of the island sit out on the frame's top and side edges: the opening
    // itself is well inside the frame, so anything out there is not the picture
    const inside = Math.abs(tA.x + tB.x + tC.x) / 3 < fb0.x * 0.8 && Math.abs(tA.y + tB.y + tC.y) / 3 < fb0.y * 0.8;
    if (island && front && inside) photoTris.push(a, b, cc);
    // the canvas wrapping round the stretcher: never meant to be seen, and pale shards if it is
    else if (!island) frameTris.push(a, b, cc);
  }

  const compact = (tris: number[]) => {
    const remap = new Map<number, number>();
    const index: number[] = [];
    for (const v of tris) {
      if (!remap.has(v)) remap.set(v, remap.size);
      index.push(remap.get(v)!);
    }
    const out = new THREE.BufferGeometry();
    for (const name of Object.keys(g.attributes)) {
      const a = g.getAttribute(name) as THREE.BufferAttribute;
      const arr = new Float32Array(remap.size * a.itemSize);
      remap.forEach((to, from) => {
        for (let k = 0; k < a.itemSize; k++) arr[to * a.itemSize + k] = a.array[from * a.itemSize + k];
      });
      out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
    }
    out.setIndex(index);
    out.computeBoundingBox();
    return out;
  };

  const frame = compact(frameTris);
  const photo = compact(photoTris);
  // planar UVs across the oval, so a picture fills it the right way up
  const pb = photo.boundingBox!;
  const pp = photo.getAttribute('position') as THREE.BufferAttribute;
  const puv = photo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pp.count; i++) {
    puv.setXY(i, (pp.getX(i) - pb.min.x) / (pb.max.x - pb.min.x), (pp.getY(i) - pb.min.y) / (pb.max.y - pb.min.y));
  }
  puv.needsUpdate = true;
  // nudge the picture forward a hair so it never fights the frame's depth
  photo.translate(0, 0, 0.004);
  frame.computeVertexNormals();
  photo.computeVertexNormals();

  const fb = g.boundingBox!;
  void pos;
  return {
    frame,
    photo,
    material: m.material as THREE.Material,
    photoAspect: (pb.max.x - pb.min.x) / (pb.max.y - pb.min.y),
    width: fb.max.x - fb.min.x,
    height: fb.max.y - fb.min.y,
  };
}
