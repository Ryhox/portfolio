'use client';

import { ContactShadows, Environment, Lightformer } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { rig } from '@/lib/rig';
import Computer from './Computer';
import type { Greeter } from './Greeter';
import { tube } from './tube';

RectAreaLightUniformsLib.init();

const LAMP = new THREE.Vector3(-3.4, 8.6, 3.2);
const POOL = new THREE.Vector3(-0.4, 0, 0.6);

/** A plain workshop floor: matte and dark, light enough for the lamp to pool on and the cables to read. */
function Floor() {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#2a221b',
        roughness: 0.62,
        metalness: 0.15,
        envMapIntensity: 0.3,
      }),
    [],
  );
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.002} material={mat}>
      <circleGeometry args={[60, 64]} />
    </mesh>
  );
}

/** The workbench: the Lumen 64 under a single lamp in a dark workshop. */
export default function Bench({ greeter, crt }: { greeter: Greeter; crt: THREE.Texture }) {
  const scene = useThree((s) => s.scene);
  const screenLight = useRef<THREE.RectAreaLight>(null);
  const key = useRef<THREE.SpotLight>(null);
  const rim = useRef<THREE.SpotLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const back = useRef<THREE.SpotLight>(null);
  const ballLight = useRef<THREE.SpotLight>(null);
  const ballTarget = useMemo(() => new THREE.Object3D(), []);
  const targets = useMemo(() => ({ key: new THREE.Object3D(), rim: new THREE.Object3D(), back: new THREE.Object3D() }), []);

  useEffect(() => {
    scene.fog = new THREE.FogExp2('#0a0705', 0.05);
    targets.key.position.copy(POOL);
    targets.rim.position.set(-0.3, 1.4, 0);
    targets.back.position.set(-6.5, 7.2, -12);
    Object.values(targets).forEach((t) => scene.add(t));
    return () => {
      scene.fog = null;
      Object.values(targets).forEach((t) => scene.remove(t));
    };
  }, [scene, targets]);

  useFrame(() => {
    const l = screenLight.current;
    if (l && tube.ready) {
      l.position.copy(tube.C).addScaledVector(tube.N, 0.02);
      l.lookAt(l.position.clone().add(tube.N));
      l.width = tube.hw * 2;
      l.height = tube.hh * 2;
      // the tube lights the keys; flicker rides on the phosphor
      l.intensity = 3.2 * rig.power * (0.985 + Math.sin(rig.time * 113) * 0.015);
    }
    if (key.current) {
      key.current.target = targets.key;
      key.current.intensity = 260 * rig.lamp;
    }
    if (hemi.current) hemi.current.intensity = 0.08 + 0.3 * rig.lamp;
    if (rim.current) rim.current.target = targets.rim;
    // a small lamp over the trackball, so it and its cable read against the floor
    const bl = ballLight.current;
    if (bl && tube.ready) {
      ballTarget.position.copy(tube.ball).addScaledVector(tube.R, -0.6);
      bl.position.copy(tube.ball).addScaledVector(tube.U, 3.2).addScaledVector(tube.N, 1.6).addScaledVector(tube.R, 0.6);
      bl.target = ballTarget;
      bl.intensity = 34 * rig.lamp;
    }
    if (back.current) {
      back.current.target = targets.back;
      back.current.intensity = 90 * (0.25 + 0.75 * rig.lamp);
    }
  });

  return (
    <>
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#ffd6a8" position={[-4, 6, 3]} scale={[8, 3, 1]} rotation-x={Math.PI / 2.4} />
        <Lightformer form="rect" intensity={1.4} color="#ffe9d2" position={[6, 2.5, -2]} scale={[1.2, 6, 1]} rotation-y={-Math.PI / 2} />
        <Lightformer form="rect" intensity={0.5} color="#b98a5c" position={[0, 1, 8]} scale={[12, 2, 1]} />
        <Lightformer form="ring" intensity={0.8} color="#ffbf80" position={[-6, 3, -4]} scale={2} />
      </Environment>

      <hemisphereLight ref={hemi} args={['#3a2a1c', '#050302', 0.08]} />
      <spotLight ref={key} position={LAMP} angle={0.42} penumbra={0.85} intensity={0} distance={30} decay={2} color="#ffcf98" />
      {/* the rim is there from the first frame, so the falling watch catches light in the dark */}
      <spotLight ref={rim} position={[6.5, 5.5, -7]} angle={0.32} penumbra={1} intensity={70} distance={30} decay={2} color="#ffe6c6" />
      <spotLight ref={back} position={[2, 14, -2]} angle={0.45} penumbra={1} intensity={30} distance={40} decay={2} color="#ffc890" />
      <spotLight ref={ballLight} angle={0.55} penumbra={1} decay={2} distance={12} color="#ffd2a0" intensity={0} />
      <primitive object={ballTarget} />
      <rectAreaLight ref={screenLight} color="#ffab55" intensity={0} width={2} height={1.2} />

      <Suspense fallback={null}>
        <Computer greeter={greeter} crt={crt} />
        <ContactShadows position={[0, 0.001, 0]} scale={14} resolution={1024} blur={2.6} opacity={0.9} far={3} frames={1} color="#000000" />
      </Suspense>
      <Floor />
    </>
  );
}
