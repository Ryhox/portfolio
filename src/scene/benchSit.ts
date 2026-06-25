// Shared bridge for sitting on the hilltop bench. The bench (Campfire.tsx) publishes
// the seated camera pose here; a small controller eases the camera into it when
// `sitting` flips and freezes the player meanwhile (SIT.active), then hands control
// back where it started on standing up. Same gentle pattern as the projects board.
import * as THREE from 'three'

export const BENCH = {
  ready: false,
  camPos: new THREE.Vector3(), // seated eye position
  lookAt: new THREE.Vector3(), // the point (west, a touch down) the seated player gazes at
}

export const SIT = { active: false, p: 0 }
