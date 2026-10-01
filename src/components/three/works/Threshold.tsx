'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { damp, smoothstep } from '@/lib/math';
import { anchor, rig } from '@/lib/rig';
import { MODELS, useModel } from '@/lib/models';
import { normalize } from './util';


// built once per model: the model itself is moved into the wrapper, so a second build (React may
// run this twice) must hand back the first rather than steal the clock from it
// (not kept in the model's userData: the office clones this model, and a clone copies userData)
const built = new WeakMap<THREE.Object3D, { root: THREE.Group; mixer: THREE.AnimationMixer }>();

/**
 * The 404 page's whole scene: a broken clock hanging in the dark, its wheels still turning.
 * On the way in through the glass only its light is left, falling on the gears.
 */
export default function Threshold() {
  const gltf = useModel(MODELS.brokenClock);
  const group = useRef<THREE.Group>(null);
  const { root, mixer } = useMemo(() => {
    const cached = built.get(gltf.scene);
    if (cached) return cached;
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
    const b = { root, mixer };
    built.set(gltf.scene, b);
    return b;
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
    if (lost) mixer.update(dt * (0.55 + Math.min(2.5, Math.abs(rig.velocity) / 900)));

    const y = lost ? -rig.scroll * rig.unitsPerPx : -hold * rig.unitsPerPx;
    // the clock itself is only seen on the 404 page; elsewhere it just marks where the light aims
    g.visible = lost;
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
