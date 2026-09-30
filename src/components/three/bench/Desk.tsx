'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/math';

/** Procedural oiled walnut: long grain streaks, pores, a few tool scars. No image files. */
function woodTextures() {
  const size = 1024;
  const rand = mulberry32(64);
  const color = document.createElement('canvas');
  const rough = document.createElement('canvas');
  color.width = color.height = rough.width = rough.height = size;
  const c = color.getContext('2d')!;
  const r = rough.getContext('2d')!;

  c.fillStyle = '#2a1a10';
  c.fillRect(0, 0, size, size);
  r.fillStyle = '#8c8c8c';
  r.fillRect(0, 0, size, size);

  // planks
  const planks = 5;
  for (let p = 0; p < planks; p++) {
    const y0 = (p / planks) * size;
    const tone = 0.8 + rand() * 0.35;
    c.fillStyle = `rgba(${Math.round(42 * tone)},${Math.round(26 * tone)},${Math.round(15 * tone)},1)`;
    c.fillRect(0, y0, size, size / planks);
    // grain
    for (let i = 0; i < 180; i++) {
      const y = y0 + rand() * (size / planks);
      const amp = 2 + rand() * 7;
      const freq = 0.002 + rand() * 0.01;
      const ph = rand() * 10;
      const a = 0.05 + rand() * 0.12;
      c.strokeStyle = rand() > 0.5 ? `rgba(12,6,3,${a})` : `rgba(96,58,32,${a * 0.7})`;
      c.lineWidth = 0.6 + rand() * 1.8;
      c.beginPath();
      for (let x = 0; x <= size; x += 16) {
        const yy = y + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph) * amp * 0.3;
        if (x === 0) c.moveTo(x, yy);
        else c.lineTo(x, yy);
      }
      c.stroke();
      r.strokeStyle = `rgba(${rand() > 0.5 ? 170 : 110},${rand() > 0.5 ? 170 : 110},${rand() > 0.5 ? 170 : 110},0.25)`;
      r.lineWidth = c.lineWidth;
      r.stroke();
    }
    // seam between planks
    c.fillStyle = 'rgba(0,0,0,0.85)';
    c.fillRect(0, y0, size, 2);
    r.fillStyle = '#e0e0e0';
    r.fillRect(0, y0, size, 2);
  }
  // pores and scars
  for (let i = 0; i < 2200; i++) {
    const x = rand() * size;
    const y = rand() * size;
    c.fillStyle = `rgba(8,4,2,${0.15 + rand() * 0.3})`;
    c.fillRect(x, y, 1 + rand() * 5, 1);
  }
  for (let i = 0; i < 26; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const len = 20 + rand() * 120;
    const ang = (rand() - 0.5) * 0.6;
    r.strokeStyle = 'rgba(40,40,40,0.8)';
    r.lineWidth = 1;
    r.beginPath();
    r.moveTo(x, y);
    r.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    r.stroke();
  }

  const map = new THREE.CanvasTexture(color);
  map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(rough);
  for (const t of [map, roughnessMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(12, 12);
    t.anisotropy = 8;
  }
  return { map, roughnessMap };
}

export default function Desk() {
  const mat = useMemo(() => {
    const { map, roughnessMap } = woodTextures();
    return new THREE.MeshStandardMaterial({
      map,
      roughnessMap,
      roughness: 0.62,
      metalness: 0,
      envMapIntensity: 0.55,
      color: '#9c8270',
    });
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={-0.002} material={mat}>
      <planeGeometry args={[140, 140]} />
    </mesh>
  );
}
