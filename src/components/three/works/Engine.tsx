'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { anchor, rig } from '@/lib/rig';
import { MODELS, useModel } from '@/lib/models';
import { analyseGearPack, layoutTrain, type Placed } from './gears';


export function useGearDefs() {
  const gltf = useModel(MODELS.gears);
  return useMemo(() => {
    const defs = analyseGearPack(gltf.scene);
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __gearDefs: unknown }).__gearDefs = defs;
    return defs;
  }, [gltf]);
}

/** Renders a laid-out train; `angle` is read every frame. */
export function Train({ placed, angle }: { placed: Placed[]; angle: { current: number } }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    placed.forEach((p, i) => {
      const m = refs.current[i];
      if (m) m.rotation.z = p.ratio * angle.current + p.offset;
    });
  });
  return (
    <group>
      {placed.map((p, i) => (
        <mesh
          key={i}
          ref={(m) => {
            refs.current[i] = m;
          }}
          geometry={p.def.geometry}
          material={p.def.material}
          position={[p.x, p.y, p.z]}
          scale={p.scale}
        />
      ))}
    </group>
  );
}

/** The mechanism at the threshold: the first thing seen through the glass. */
export default function Engine() {
  const defs = useGearDefs();
  const angle = useRef(0);
  const group = useRef<THREE.Group>(null);

  const placed = useMemo(() => {
    if (!defs.length) return [];
    const steps = [
      { gear: 3, dir: 0 },
      { gear: 7, dir: 0.35 },
      { gear: 12, dir: -0.5 },
      { gear: 1, dir: 0.9 },
      { gear: 16, dir: -0.2 },
      { gear: 5, dir: Math.PI - 0.4, parent: 0 },
      { gear: 9, dir: Math.PI + 0.6 },
      { gear: 14, dir: Math.PI - 0.2 },
    ];
    return layoutTrain(defs, steps, 0.2, new THREE.Vector2(-1.5, 0));
  }, [defs]);

  useFrame((_, dt) => {
    angle.current += dt * (0.12 + Math.min(2, Math.abs(rig.velocity) / 1500));
    const g = group.current;
    if (g) {
      const dive = anchor('dive');
      const hold = dive.top + dive.height - rig.vh;
      g.position.y = -hold * rig.unitsPerPx;
    }
  });

  return (
    <group ref={group} position={[0, 0, -3]}>
      <Train placed={placed} angle={angle} />
    </group>
  );
}
