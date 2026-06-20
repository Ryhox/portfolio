import * as THREE from 'three'
import { RING_X, RING_Z } from './spawnConstants'

export const REVEAL_DIST      = { value: 0.0 }
export const REVEAL_CENTER    = { value: new THREE.Vector2(RING_X, RING_Z) }
export const REVEAL_COLOR_U   = { value: new THREE.Color('#e88eff') }
export const REVEAL_INTENSITY = { value: 5.5 }
export const REVEAL_THICKNESS = { value: 0.05 }

// 0 → 1 over 4 seconds once worldVisible=true; multiplied into sky/water/particles opacity
export const WORLD_ALPHA = { value: 0 }
