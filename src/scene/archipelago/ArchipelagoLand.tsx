import { Suspense, useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { patchReveal } from '../terrain/patchReveal'
import { setActiveMap } from '../terrain/terrain'
import { ArchipelagoScatter } from './ArchipelagoScatter'
import { archColorAt, islandHeightAt, useArchipelago, type IslandInstance } from './archipelago'

// One displaced, biome-coloured terrain patch per island. World coordinates are
// baked into the geometry (so islandHeightAt/archColorAt sample directly), and
// the reveal-ring shader is patched in like the home island.
function IslandMesh({ isl }: { isl: IslandInstance }) {
  const geometry = useMemo(() => {
    const size = isl.radius * 2 * 1.7 // dome + a margin that sinks into the sea
    const seg = Math.max(24, Math.min(96, Math.round(isl.radius * 3)))
    const g = new THREE.PlaneGeometry(size, size, seg, seg)
    g.rotateX(-Math.PI / 2)
    g.translate(isl.cx, 0, isl.cz)

    const pos = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, islandHeightAt(isl, pos.getX(i), pos.getZ(i)))
    }
    g.computeVertexNormals()

    const normal = g.attributes.normal as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const tmp = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      archColorAt(isl, pos.getX(i), pos.getY(i), pos.getZ(i), normal.getY(i), tmp)
      colors[i * 3] = tmp.r
      colors[i * 3 + 1] = tmp.g
      colors[i * 3 + 2] = tmp.b
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return g
  }, [isl])

  const material = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 })
    patchReveal(m)
    return m
  }, [])

  return <mesh geometry={geometry} material={material} receiveShadow castShadow />
}

export function ArchipelagoLand() {
  const islands = useArchipelago((s) => s.islands)
  const ensureLoaded = useArchipelago((s) => s.ensureLoaded)

  // While this land is mounted, the shared getHeight serves archipelago terrain
  // (drives the boat + player physics). Restored to the home field on unmount.
  useEffect(() => {
    setActiveMap('archipelago')
    ensureLoaded()
    return () => setActiveMap('home')
  }, [ensureLoaded])

  return (
    <>
      {islands.map((isl) => (
        <IslandMesh key={isl.id} isl={isl} />
      ))}
      <Suspense fallback={null}>
        <ArchipelagoScatter islands={islands} />
      </Suspense>
    </>
  )
}
