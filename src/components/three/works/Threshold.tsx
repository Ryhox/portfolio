'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { damp, smoothstep } from '@/lib/math';
import { anchor, rig } from '@/lib/rig';
import { MODELS, useModel } from '@/lib/models';
import { normalize } from './util';


/**
 * The first thing inside the glass: a broken clock hanging in the dark, its wheels still turning.
 * On the 404 page the same clock is the whole scene.
 */
export default function Threshold() {
  const gltf = useModel(MODELS.brokenClock);
  const group = useRef<THREE.Group>(null);
  const { root, mixer } = useMemo(() => {
    const root = normalize(gltf.scene, 7.4, 'y');
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = 0.35;
        mat.envMapIntensity = 1.25;
      }
    });
    const mixer = new THREE.AnimationMixer(gltf.scene);
    gltf.animations.forEach((c) => mixer.clipAction(c).play());
    return { root, mixer };
  }, [gltf]);

  const light = useRef<THREE.SpotLight>(null);
  const target = useMemo(() => new THREE.Object3D(), []);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const lost = rig.route === 'page' && document.body.dataset.notFound === '1';
    const dive = anchor('dive');
    const hold = rig.route === 'home' ? dive.top + dive.height - rig.vh : 0;

    // time runs a little faster while you scroll, as if the page were winding it
    mixer.update(dt * (0.55 + Math.min(2.5, Math.abs(rig.velocity) / 900)));

    const y = lost ? -rig.scroll * rig.unitsPerPx : -hold * rig.unitsPerPx;
    const visible = lost || rig.route === 'home';
    g.visible = visible && Math.abs(g.position.y - -rig.scroll * rig.unitsPerPx) < 20;
    g.position.set(lost ? 0 : 2.1, y + (lost ? 0.2 : 0.4), lost ? -1.5 : -5.5);
    // it hangs; it sways a little, and leans towards the pointer
    const sway = Math.sin(rig.time * 0.6) * 0.035;
    g.rotation.z = damp(g.rotation.z, sway - rig.pointer.sx * 0.05, 2, dt);
    g.rotation.y = damp(g.rotation.y, rig.pointer.sx * 0.18 - 0.22, 2, dt);
    g.rotation.x = damp(g.rotation.x, -rig.pointer.sy * 0.08, 2, dt);

    // lit hard from above-left on arrival; the light dims as it passes
    if (light.current) {
      const here = 1 - smoothstep(0, rig.vh * 0.9, Math.abs(rig.scroll - hold));
      light.current.intensity = 60 + 140 * (lost ? 1 : here);
      target.position.copy(g.position);
      light.current.target = target;
    }
  });

  return (
    <>
      <group ref={group}>
        <primitive object={root} />
      </group>
      <spotLight ref={light} position={[-6, 12, 6]} angle={0.38} penumbra={0.9} decay={2} distance={60} color="#ffd8a8" />
      <primitive object={target} />
    </>
  );
}
