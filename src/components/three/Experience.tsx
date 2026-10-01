'use client';

import { Canvas, advance } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { setRender } from '@/lib/loop';
import { useApp } from '@/lib/store';
import Director from './Director';

function initialDpr() {
  const d = window.devicePixelRatio || 1;
  const coarse = matchMedia('(pointer: coarse)').matches;
  return Math.min(d, coarse ? 1.25 : 1.35);
}

export default function Experience() {
  const [dpr, setDpr] = useState(initialDpr);
  const [supported] = useState(() => document.documentElement.dataset.nogl !== '1');

  useEffect(() => {
    // R3F is advanced by hand: in seconds, so every useFrame delta (and clock) is in seconds too
    setRender((ms) => advance(ms / 1000));
    const m = THREE.DefaultLoadingManager;
    m.onProgress = (_url, loaded, total) => useApp.getState().setProgress(loaded / Math.max(1, total));
    return () => {
      setRender(null);
      m.onProgress = () => {};
    };
  }, []);

  if (!supported) return null;

  return (
    <div
      aria-hidden="true"
      data-screen-layer
      className="gl-stage"
    >
      <Canvas
        frameloop="never"
        dpr={dpr}
        gl={{
          antialias: false,
          alpha: false,
          stencil: false,
          depth: true,
          powerPreference: 'high-performance',
        }}
        eventSource={document.documentElement}
        eventPrefix="client"
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          gl.setClearColor('#050403', 1);
          // asking the driver whether each program linked is a wait on the GPU the first time it is
          // used: that is for development
          gl.debug.checkShaderErrors = process.env.NODE_ENV !== 'production';
        }}
      >
        <Director setDpr={setDpr} />
      </Canvas>
    </div>
  );
}
