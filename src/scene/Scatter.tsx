import { useMemo } from 'react'
import * as THREE from 'three'
import { type Placed, getNormal } from './terrain'
import { type Part, useNature } from './loadNature'
import { getPlacements } from './placement'

const UP = new THREE.Vector3(0, 1, 0)

// Draws one InstancedMesh per model part. The model's intrinsic size is scaled
// to a target height, multiplied by each item's variation, and seated on the
// ground (offset by the model's minY).
function Instanced({
  parts,
  items,
  targetH,
  sizeY,
  minY,
  cast,
  recv,
  align,
  tilt,
}: {
  parts: Part[]
  items: Placed[]
  targetH: number
  sizeY: number
  minY: number
  cast?: boolean
  recv?: boolean
  align?: boolean
  tilt?: number // max random lean (radians) — breaks up rigid-vertical foliage
}) {
  const meshes = useMemo(() => {
    const baseScale = targetH / (sizeY || 1)
    const m4 = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const qYaw = new THREE.Quaternion()
    const qTilt = new THREE.Quaternion()
    const tiltAxis = new THREE.Vector3()
    const eul = new THREE.Euler()
    const n = new THREE.Vector3()
    const pos = new THREE.Vector3()
    const scl = new THREE.Vector3()
    const fract = (x: number) => x - Math.floor(x)
    return parts.map((p) => {
      const im = new THREE.InstancedMesh(p.geometry, p.material, items.length)
      im.castShadow = !!cast
      im.receiveShadow = !!recv
      im.frustumCulled = false
      items.forEach((it, i) => {
        const fs = baseScale * it.scale
        if (align) {
          // tilt so the prop's up-axis follows the ground, then yaw around it
          getNormal(it.x, it.z, n)
          q.setFromUnitVectors(UP, n)
          qYaw.setFromAxisAngle(n, it.rotY)
          q.premultiply(qYaw)
        } else {
          eul.set(0, it.rotY, 0)
          q.setFromEuler(eul)
        }
        if (tilt) {
          // deterministic per-position lean about a random horizontal axis
          const r1 = fract(Math.sin(it.x * 12.9898 + it.z * 78.233) * 43758.5453)
          const r2 = fract(Math.sin(it.x * 39.346 + it.z * 11.135) * 24634.6345)
          tiltAxis.set(Math.cos(r1 * 6.2831853), 0, Math.sin(r1 * 6.2831853))
          qTilt.setFromAxisAngle(tiltAxis, (r2 - 0.5) * 2 * tilt)
          q.premultiply(qTilt)
        }
        pos.set(it.x, it.y - minY * fs, it.z)
        scl.set(fs, fs, fs)
        m4.compose(pos, q, scl)
        im.setMatrixAt(i, m4)
      })
      im.instanceMatrix.needsUpdate = true
      return im
    })
  }, [parts, items, targetH, sizeY, minY, cast, recv, align, tilt])

  return (
    <>
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </>
  )
}

export function NatureField() {
  const nature = useNature()
  const entries = useMemo(() => getPlacements(), [])
  return (
    <>
      {entries.map((e, i) => {
        const model = nature[e.model]
        if (!model || e.items.length === 0) return null
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
          />
        )
      })}
    </>
  )
}
