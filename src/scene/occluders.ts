import type { Object3D } from 'three'

// Solid props (trees / rocks / foliage) that should hide the boat marker when
// they stand between the camera and the hull. BoatPrompt raycasts ONLY this
// list, throttled — never the whole scene — so occlusion stays cheap. The
// <Occluders> wrapper in Experience registers its group here on mount.
export const PROP_OCCLUDERS: Object3D[] = []

export function registerOccluder(o: Object3D) {
  if (!PROP_OCCLUDERS.includes(o)) PROP_OCCLUDERS.push(o)
}

export function unregisterOccluder(o: Object3D) {
  const i = PROP_OCCLUDERS.indexOf(o)
  if (i >= 0) PROP_OCCLUDERS.splice(i, 1)
}
