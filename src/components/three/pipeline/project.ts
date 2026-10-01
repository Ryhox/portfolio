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

/**
 * The same, for points that may lie far outside the view (where stepping toward the answer no
 * longer settles): the glass bends along the line from the middle, so how far out a point shows
 * is the root of a cubic, found by Newton's method. False if the point is not in front of us.
 */
export function toScreenFar(p: THREE.Vector3, camera: THREE.Camera, out: [number, number]) {
  v.copy(p).applyMatrix4(camera.matrixWorldInverse);
  if (v.z > -1e-4) return false;
  v.applyMatrix4(camera.projectionMatrix);
  const a2 = (rig.vw / rig.vh) ** 2;
  const to = Math.sqrt((v.x * v.x * a2 + v.y * v.y) / (a2 + 1));
  let m = to;
  for (let i = 0; i < 12; i++) m -= (m + CURVE * m ** 3 - (1 + CURVE) * to) / (1 + 3 * CURVE * m * m);
  const g = to > 1e-9 ? m / to : 1;
  out[0] = (v.x * g * 0.5 + 0.5) * rig.vw;
  out[1] = (-v.y * g * 0.5 + 0.5) * rig.vh;
  return true;
}
