import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * All models go through here: meshopt geometry is decoded in web workers, and images are decoded
 * off the main thread by the loader (createImageBitmap), so loading never stalls the page.
 */
let workers = false;
const extend = (loader: { setMeshoptDecoder: (d: typeof MeshoptDecoder) => void }) => {
  if (!workers && typeof window !== 'undefined') {
    MeshoptDecoder.useWorkers(Math.min(4, Math.max(1, (navigator.hardwareConcurrency || 4) - 2)));
    workers = true;
  }
  loader.setMeshoptDecoder(MeshoptDecoder);
};

/**
 * Once per model: double-sided transparent materials are drawn in one pass, not two. three's
 * default draws their back faces and then their front faces, flipping the material (and
 * re-validating its shader) twice per object per frame; the Lumen models have dozens of them,
 * and that alone cost the Projects section a third of its frame time.
 */
function tune(scene: THREE.Object3D) {
  if (scene.userData.tuned) return;
  scene.userData.tuned = true;
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!m) return;
    for (const mat of Array.isArray(m) ? m : [m]) {
      // glass that bends what is behind it makes three draw everything else in the scene a second
      // time, every frame, to have a picture to bend: for a lens lying on a desk that doubled the
      // office's whole cost. Here glass is plain, clear glass
      const glass = mat as THREE.MeshPhysicalMaterial;
      if (glass.transmission > 0) {
        glass.transmission = 0;
        glass.transparent = true;
        glass.opacity = Math.min(glass.opacity, 0.28);
        glass.depthWrite = false;
      }
      if (mat.transparent && mat.side === THREE.DoubleSide) mat.forceSinglePass = true;
    }
  });
}

export const useModel = (url: string) => {
  const gltf = useGLTF(url, false, false, extend as never);
  tune(gltf.scene);
  return gltf;
};
export const preloadModel = (url: string) => useGLTF.preload(url, false, false, extend as never);

export const MODELS = {
  computer: '/models/computer.glb',
  brokenClock: '/models/broken-clock.glb',
  gears: '/models/gears.glb',
  clock: '/models/clock.glb',
  frame: '/models/frame.glb',
  resonance: '/models/resonance.glb',
  camera: '/models/camera.glb',
  desk: '/models/desk.glb',
  officeWindow: '/models/office-window.glb',
  officeClock: '/models/office-clock.glb',
  bookshelf: '/models/bookshelf.glb',
  books: '/models/books.glb',
  oilLamp: '/models/oil-lamp.glb',
  magnifier: '/models/magnifier.glb',
  chairA: '/models/chair-a.glb',
  chairB: '/models/chair-b.glb',
} as const;
