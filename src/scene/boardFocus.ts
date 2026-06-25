// Shared bridge between the projects message board, the camera-focus controller,
// and the player freeze. MessageBoard.tsx seats the board and writes the world
// point to look at + the framed camera pose here. BoardFocus.tsx eases the camera
// in/out when `projectsOpen` flips and publishes:
//   • active — true while the focus animation is running OR settled (freezes the
//     player so it never fights for the camera), and
//   • p      — eased 0..1 (0 = free play, 1 = fully framed on the board). The board
//     scales its wind sway by (1 - p) so it stills smoothly as you press E and
//     breathes again once you leave (no clip, no snap).
import * as THREE from 'three'

export const BOARD = {
  ready: false,
  center: new THREE.Vector3(), // the point on the board the camera frames
  camPos: new THREE.Vector3(), // where the camera sits while reading
}

export const BOARD_FOCUS = {
  active: false,
  p: 0,
}
