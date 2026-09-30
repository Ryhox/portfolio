import * as THREE from 'three';

/**
 * Wraps a model so that it is centred on the origin and its largest (or chosen) extent equals `size`.
 * Returns the wrapper; the original object is re-parented inside it.
 */
export function normalize(object: THREE.Object3D, size: number, axis: 'x' | 'y' | 'z' | 'max' = 'max') {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const s = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const extent = axis === 'max' ? Math.max(s.x, s.y, s.z) : s[axis];
  const k = size / Math.max(extent, 1e-6);
  const inner = new THREE.Group();
  inner.add(object);
  object.position.sub(c);
  const outer = new THREE.Group();
  outer.add(inner);
  inner.scale.setScalar(k);
  return outer;
}

/** Walks up from a hit object to find the first ancestor in `set`. */
export function findAncestor<T extends THREE.Object3D>(o: THREE.Object3D | null, test: (o: THREE.Object3D) => o is T): T | null {
  while (o) {
    if (test(o)) return o;
    o = o.parent;
  }
  return null;
}

export function setCursor(c: string) {
  document.documentElement.style.cursor = c;
}
