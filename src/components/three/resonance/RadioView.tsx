'use client';

import { Environment, Lightformer } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense } from 'react';
import * as THREE from 'three';
import { radio } from '@/lib/radio';
import { rig } from '@/lib/rig';
import { WORKS_DIST, WORKS_FOV } from '../works/Works';
import Resonance from './Resonance';

/**
 * The radio: the Resonance cabinet, standing to the right of wherever the page is. It has no room of
 * its own: it is drawn on nothing and laid over the world the page was showing, turned round toward
 * it (see the director), so it always stands in the place you were. Its view is framed like the
 * inner world's (same lens, same distance), so the page's stages map onto it the same way; it
 * comes in from the right by a view's width as the world turns.
 */
export default function RadioView({ camera }: { camera: THREE.PerspectiveCamera }) {
  const scene = useThree((s) => s.scene);
  useFrame(() => {
    camera.fov = WORKS_FOV;
    camera.aspect = rig.vw / rig.vh;
    const off = (1 - radio.pan) * rig.vw * rig.unitsPerPx;
    camera.position.set(-off, 0, WORKS_DIST);
    camera.lookAt(-off, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    scene.background = null;
  }, -1);

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
      <Suspense fallback={null}>
        <Resonance />
      </Suspense>
    </>
  );
}
