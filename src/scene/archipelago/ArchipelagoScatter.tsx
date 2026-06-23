import { useMemo } from 'react'
import * as THREE from 'three'
import { useNature } from '../loadNature'
import { Instanced } from '../Scatter'
import { getArchPlacements, type IslandInstance } from './archipelago'

// Scatters every island's biome props in one pass, reusing the home island's
// instanced renderer. Each placement entry carries an optional biome `tint`
// applied as a per-instance colour, so the same .glb kit reads as palms, snowy
// pines, pink cherry canopies, glowing crystals, etc. — no extra models.
export function ArchipelagoScatter({ islands }: { islands: IslandInstance[] }) {
  const nature = useNature()
  const entries = useMemo(() => getArchPlacements(islands), [islands])
  const tints = useMemo(() => new Map<number, THREE.Color>(), [])

  return (
    <>
      {entries.map((e, i) => {
        const model = nature[e.model]
        if (!model || e.items.length === 0) return null
        let tint: THREE.Color | undefined
        if (e.tint != null) {
          tint = tints.get(e.tint)
          if (!tint) {
            tint = new THREE.Color(e.tint)
            tints.set(e.tint, tint)
          }
        }
        return (
          <Instanced
            key={i}
            parts={model.parts}
            items={e.items}
            targetH={e.targetH}
            sizeY={model.size.y}
            minY={model.minY}
            cast={e.cast}
            recv={e.recv}
            align={e.align}
            tilt={e.tilt}
            tint={tint}
            sink={e.sink}
          />
        )
      })}
    </>
  )
}
