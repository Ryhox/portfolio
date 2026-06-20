import { useMemo } from 'react'
import * as THREE from 'three'
import { TERRAIN_HALF, colorAt, getHeight } from './terrain'
import { patchReveal } from './patchReveal'

// Procedural landmass: a square grid displaced by getHeight and vertex-colored
// by zone (underwater / sand / grass / rock). Smooth shading with a painterly
// palette to match the Quaternius kit.
export function Island() {
  const geometry = useMemo(() => {
    const size = TERRAIN_HALF * 2
    const seg = 360
    const g = new THREE.PlaneGeometry(size, size, seg, seg)
    g.rotateX(-Math.PI / 2) // lie flat on the XZ plane

    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, getHeight(pos.getX(i), pos.getZ(i)))
    }
    g.computeVertexNormals()

    const normal = g.attributes.normal as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const tmp = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      colorAt(pos.getX(i), pos.getY(i), pos.getZ(i), normal.getY(i), tmp)
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return g
  }, [])

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 })
    patchReveal(m)
    return m
  }, [])

  return (
    <mesh geometry={geometry} receiveShadow castShadow material={material} />
  )
}
