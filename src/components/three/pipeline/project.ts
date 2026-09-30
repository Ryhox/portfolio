import * as THREE from 'three';
import { rig } from '@/lib/rig';
import { CURVE, bendPointer } from './shaders';

const v = new THREE.Vector3();

/**
 * Where a world point shows on screen, in CSS px, once the tube's curved glass has bent the
 * picture (the inverse of the CRT pass's bend, found in a few steps). False if it is behind us.
 */
export function toScreen(p: THREE.Vector3, camera: THREE.Camera, out: [number, number]) {
  v.copy(p).project(camera);
  const aspect = rig.vw / rig.vh;
  let x = v.x;
  let y = v.y;
  for (let i = 0; i < 6; i++) {
    const [bx, by] = bendPointer(x, y, CURVE, aspect);
    x -= bx - v.x;
    y -= by - v.y;
  }
  out[0] = (x * 0.5 + 0.5) * rig.vw;
  out[1] = (-y * 0.5 + 0.5) * rig.vh;
  return v.z < 1;
}
