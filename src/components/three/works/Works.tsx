'use client';

import { Environment, Lightformer } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect } from 'react';
import * as THREE from 'three';
import { smoothstep } from '@/lib/math';
import { office } from '@/lib/office';
import { anchor, rig } from '@/lib/rig';
import { useGearDefs } from './Engine';
import Threshold from './Threshold';
import Walls from './Walls';
import About3D from '../about/About3D';

export const WORKS_FOV = 32;
export const WORKS_DIST = 12;

/**
 * The world inside the tube. The camera descends with the page: one CSS pixel of scroll is
 * `rig.unitsPerPx` world units on the z = 0 plane, so anything placed on that plane can be
 * pinned to a DOM element and will travel with it exactly.
 */
function GearWalls() {
  const defs = useGearDefs();
  return <Walls defs={defs} />;
}

const _hub = new THREE.Vector3();

export default function Works({ camera }: { camera: THREE.PerspectiveCamera }) {
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    scene.fog = new THREE.Fog('#070504', WORKS_DIST + 4, WORKS_DIST + 38);
    scene.background = new THREE.Color('#070504');
    return () => {
      scene.fog = null;
      scene.background = null;
    };
  }, [scene]);

  useFrame(() => {
    const aspect = rig.vw / rig.vh;
    camera.fov = WORKS_FOV;
    camera.aspect = aspect;
    rig.unitsPerPx = (2 * WORKS_DIST * Math.tan(THREE.MathUtils.degToRad(WORKS_FOV) / 2)) / rig.vh;

    // hold at the threshold while the dive is in progress, then travel with the page
    const dive = anchor('dive');
    const hold = rig.route === 'home' ? dive.top + dive.height - rig.vh : 0;
    const s = Math.max(rig.scroll, hold);
    const push = rig.route === 'home' ? 1 - smoothstep(0, 1, rig.dive) : 0;

    // the camera does not follow the pointer: much of this world is pinned to the page's type, and
    // must stay exactly where the type says; the machines themselves lean toward the cursor instead
    camera.position.set(0, -s * rig.unitsPerPx, WORKS_DIST + push * 9);
    camera.rotation.set(0, 0, 0);

    // the end of the About: straight into the clock's hub, faster and faster, until the hub is
    // all there is and it opens onto the office behind it
    // (only while the office shows: once the films cover it, the camera is back with the page)
    const z = office.mix > 0 ? office.zoom : 0;
    if (z > 0 && office.hubReady) {
      const e = z * z * (3 - 2 * z);
      _hub.copy(office.hub);
      camera.position.lerp(_hub.setZ(_hub.z + 0.3), e);
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    if (z > 0 && office.hubReady) {
      const dz = Math.max(0.05, camera.position.z - office.hub.z);
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(WORKS_FOV) / 2);
      // the hub's radius on screen, as a fraction of the height
      const r = office.hubR / (2 * tanHalf * dz);
      const open = smoothstep(0.22, 0.52, z);
      const v = _hub.copy(office.hub).project(camera);
      office.portal[0] = v.x * 0.5 + 0.5;
      office.portal[1] = v.y * 0.5 + 0.5;
      office.portal[2] = Math.max(r * open, smoothstep(0.96, 1, z) * 3);
    } else if (z >= 1) {
      // arrived in the office without passing the clock (a reload, a jump): it is simply open
      office.portal[0] = office.portal[1] = 0.5;
      office.portal[2] = 3;
    } else office.portal[2] = 0;
  });

  return (
    <>
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={1.6} color="#ffcf9a" position={[-5, 6, 4]} scale={[10, 4, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#ffe6c8" position={[7, 0, 3]} scale={[2, 10, 1]} rotation-y={-Math.PI / 3} />
        <Lightformer form="rect" intensity={0.35} color="#8f6a48" position={[0, -6, 5]} scale={[16, 3, 1]} />
      </Environment>
      <ambientLight intensity={0.05} />
      <directionalLight position={[-4, 6, 8]} intensity={1.6} color="#ffd9aa" />
      <directionalLight position={[6, -2, -4]} intensity={0.8} color="#ffc98f" />
      {/* loaded behind the counter, warmed up and rendered once unseen, so the dive never stutters */}
      <Suspense fallback={null}>
        <Threshold />
      </Suspense>
      <Suspense fallback={null}>
        <GearWalls />
      </Suspense>
      <Suspense fallback={null}>
        <About3D />
      </Suspense>
    </>
  );
}
