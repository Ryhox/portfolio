'use client';

import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mulberry32, smoothstep } from '@/lib/math';
import { anchor, rig } from '@/lib/rig';
import { layoutTrain, type GearDef, type Placed } from './gears';

type Chain = { placed: Placed[]; speed: number; phase: number };

/**
 * A few trains of meshing gears around the way in: seen through the glass while zooming into the
 * tube, and for a moment after arriving, then the machine opens up and they are gone. Every gear
 * obeys its ratio, so the trains genuinely work as the page scrolls.
 */
export default function Walls({ defs }: { defs: GearDef[] }) {
  const [depth, setDepth] = useState(0);
  const meshes = useRef<(THREE.InstancedMesh | null)[]>([]);

  // the entrance sits where the camera holds during the dive; regenerate if the layout moves it
  useFrame(() => {
    const a = anchor('dive');
    const h = Math.round((a.top + a.height - rig.vh) * rig.unitsPerPx * 4) / 4;
    if (h > 0 && h !== depth) setDepth(h);
  });

  const { chains, byDef } = useMemo(() => {
    const rand = mulberry32(1864);
    const chains: Chain[] = [];
    if (!defs.length || depth <= 0) return { chains, byDef: new Map<number, { chain: number; gear: number }[]>() };
    const entry = -depth;
    const strata = [
      { z: -7, band: [5.4, 8.5], module: 0.2, count: 2 },
      { z: -14, band: [5, 11], module: 0.3, count: 2 },
    ];
    for (const st of strata) {
      for (let c = 0; c < st.count; c++) {
        const side = c % 2 === 0 ? -1 : 1;
        const x0 = side * (st.band[0] + rand() * (st.band[1] - st.band[0]));
        let y = entry + 5 - rand() * 2;
        const cz = st.z - c * 0.45; // each chain on its own plane so neighbours never interpenetrate
        const steps: { gear: number; dir: number; z?: number; axle?: boolean }[] = [{ gear: Math.floor(rand() * defs.length), dir: 0, z: cz }];
        let x = x0;
        let guard = 0;
        while (y > entry - 11 && guard++ < 60) {
          // wander downward, drifting back toward the band
          const pull = (x0 - x) * 0.08;
          const dir = -Math.PI / 2 + (rand() - 0.5) * 1.4 + pull;
          const gear = Math.floor(rand() * defs.length);
          steps.push({ gear, dir, z: cz });
          if (rand() < 0.12) steps.push({ gear: Math.floor(rand() * defs.length), dir: 0, axle: true, z: cz + 0.14 });
          const r = (st.module * defs[gear].teeth) / 2;
          y += Math.sin(dir) * r * 1.9;
          x += Math.cos(dir) * r * 1.9;
        }
        // trains stay at the entrance: anything that wandered further down is dropped
        const placed = layoutTrain(defs, steps, st.module, new THREE.Vector2(x0, entry + 5 - rand() * 2)).filter((p) => p.y > entry - 8.5);
        chains.push({ placed, speed: (0.08 + rand() * 0.12) * (rand() > 0.5 ? 1 : -1), phase: rand() * 10 });
      }
    }
    const byDef = new Map<number, { chain: number; gear: number }[]>();
    chains.forEach((ch, ci) =>
      ch.placed.forEach((p, gi) => {
        const d = defs.indexOf(p.def);
        if (!byDef.has(d)) byDef.set(d, []);
        byDef.get(d)!.push({ chain: ci, gear: gi });
      }),
    );
    return { chains, byDef };
  }, [defs, depth]);

  const entries = useMemo(() => [...byDef.entries()], [byDef]);

  useEffect(() => {
    meshes.current.forEach((m) => {
      if (m) {
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
      }
    });
  }, [entries]);

  const m4 = useMemo(() => new THREE.Matrix4(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const scl = useMemo(() => new THREE.Vector3(), []);
  const z = useMemo(() => new THREE.Vector3(0, 0, 1), []);
  const angle = useRef(0);

  useFrame((_, dt) => {
    // the walls are driven by time, and pushed along by the scroll
    angle.current += dt * 0.6 + Math.abs(rig.velocity) * 0.00035 * dt * 60;
    const camY = -rig.scroll * rig.unitsPerPx;
    // once the camera is past the way in, the trains part to the sides, so the About has the room
    const part = rig.route === 'home' ? smoothstep(0.5, 4.5, -depth - camY) : 0;
    entries.forEach(([, list], mi) => {
      const mesh = meshes.current[mi];
      if (!mesh) return;
      list.forEach((ref, i) => {
        const ch = chains[ref.chain];
        const p = ch.placed[ref.gear];
        // skip matrix work for gears far outside the view; park them
        if (Math.abs(p.y - camY) > 30) {
          m4.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, m4);
          return;
        }
        q.setFromAxisAngle(z, p.ratio * (angle.current * ch.speed + ch.phase) + p.offset);
        pos.set(p.x + Math.sign(p.x) * part * 18, p.y, p.z);
        scl.setScalar(p.scale);
        m4.compose(pos, q, scl);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    });
  });

  return (
    <group>
      {entries.map(([d, list], i) => (
        <instancedMesh
          key={`${d}-${list.length}-${depth}`}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          args={[defs[d].geometry, defs[d].material, list.length]}
        />
      ))}
    </group>
  );
}
