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

let want = '';
let under: HTMLElement | null = null;
let on: HTMLElement | null = null;
const apply = () => {
  const el = want ? under : null;
  if (on && on !== el) on.style.cursor = '';
  on = el;
  if (on && on.style.cursor !== want) on.style.cursor = want;
};
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointermove',
    (e) => {
      under = e.target instanceof HTMLElement ? e.target : null;
      if (want) apply();
    },
    { passive: true },
  );
}

/**
 * The pointer's shape over something in the 3D. The canvas takes no pointer itself (the page over
 * it does), so the shape is put on whatever element of the page is under the pointer, and follows
 * it. Put on the document's root instead it is inherited by everything, and every change of it
 * restyles the whole page: most of a frame, each time the pointer crosses a key or a picture.
 */
export function setCursor(c: string) {
  want = c;
  apply();
}
