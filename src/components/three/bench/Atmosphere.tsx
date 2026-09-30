'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { mulberry32 } from '@/lib/math';

const noise = /* glsl */ `
  float h21(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return v;
  }
`;

/** Lamp-lit smoke: a few large soft sheets drifting through the beam. */
function Haze() {
  const mats = useMemo(() => {
    const rand = mulberry32(7);
    return Array.from({ length: 5 }, (_, i) => ({
      mat: new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uSeed: { value: rand() * 100 },
          uColor: { value: new THREE.Color(i % 2 ? '#8a5a32' : '#5e4028') },
          uStrength: { value: 0.1 + rand() * 0.07 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying float vDepth;
          void main() {
            vUv = uv;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vDepth = -mv.z;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          varying float vDepth;
          uniform float uTime, uSeed, uStrength;
          uniform vec3 uColor;
          ${noise}
          void main() {
            vec2 p = vUv * vec2(3.0, 1.6) + vec2(uSeed, uSeed * 0.3);
            float n = fbm(p + vec2(uTime * 0.035, -uTime * 0.012) + fbm(p * 1.7 - uTime * 0.02) * 0.9);
            float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
            float a = smoothstep(0.35, 0.95, n) * edge * uStrength;
            a *= smoothstep(0.6, 3.0, vDepth); // never smear across the lens
            gl_FragColor = vec4(uColor * a, 1.0);
          }
        `,
      }),
      pos: [(rand() - 0.5) * 14, 1.2 + rand() * 3.2, -3 - rand() * 7] as [number, number, number],
      scale: [11 + rand() * 7, 5 + rand() * 3, 1] as [number, number, number],
      rot: (rand() - 0.5) * 0.3,
    }));
  }, []);

  useFrame(({ clock }) => {
    for (const m of mats) m.mat.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <group>
      {mats.map((m, i) => (
        <mesh key={i} position={m.pos} scale={m.scale} rotation-z={m.rot} material={m.mat} renderOrder={5}>
          <planeGeometry />
        </mesh>
      ))}
    </group>
  );
}

/** The lamp's beam made visible by dust in the air — a cone, soft at the rim, broken up by noise. */
function Beam({ from, to, radius }: { from: THREE.Vector3; to: THREE.Vector3; radius: number }) {
  const { geo, mat, quat, mid, len } = useMemo(() => {
    const dir = to.clone().sub(from);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(radius * 0.08, radius, len, 48, 1, true);
    geo.translate(0, -len / 2, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      // additive: the order of the faces does not matter, so one pass, not two
      forceSinglePass: true,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uLen: { value: len } },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        varying float vY;
        varying vec2 vUv;
        uniform float uLen;
        void main() {
          vUv = uv;
          vY = -position.y / uLen;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vV;
        varying float vY;
        varying vec2 vUv;
        uniform float uTime;
        ${noise}
        void main() {
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float core = pow(facing, 2.2);
          float n = fbm(vec2(vUv.x * 9.0, vY * 4.0 - uTime * 0.05));
          float a = core * (0.55 + 0.6 * n) * smoothstep(0.0, 0.12, vY) * (1.0 - smoothstep(0.55, 1.0, vY));
          gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * a * 0.055, 1.0);
        }
      `,
    });
    return { geo, mat, quat, mid: from, len };
  }, [from, to, radius]);

  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
  });
  void len;
  return <mesh geometry={geo} material={mat} position={mid} quaternion={quat} renderOrder={6} />;
}

/** Dust motes. Brighter where they cross the beam. */
function Dust({ count = 700, beamFrom, beamTo }: { count?: number; beamFrom: THREE.Vector3; beamTo: THREE.Vector3 }) {
  const { geo, mat } = useMemo(() => {
    const rand = mulberry32(11);
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * 12;
      pos[i * 3 + 1] = rand() * 6;
      pos[i * 3 + 2] = (rand() - 0.5) * 10 - 1;
      seed[i] = rand();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPx: { value: 1 },
        uA: { value: beamFrom },
        uB: { value: beamTo },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime, uPx;
        uniform vec3 uA, uB;
        varying float vLit;
        varying float vTw;
        void main() {
          vec3 p = position;
          float t = uTime * (0.05 + aSeed * 0.06);
          p += vec3(sin(t * 1.3 + aSeed * 40.0), sin(t * 0.7 + aSeed * 13.0) * 0.6 - t * 0.05, cos(t + aSeed * 7.0)) * 0.6;
          p.y = mod(p.y, 6.0);
          vec3 ab = uB - uA;
          float h = clamp(dot(p - uA, ab) / dot(ab, ab), 0.0, 1.0);
          float d = length(p - (uA + ab * h));
          vLit = smoothstep(0.35 + h * 2.2, 0.0, d) * 0.9 + 0.1;
          vTw = 0.6 + 0.4 * sin(uTime * (1.0 + aSeed * 3.0) + aSeed * 50.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = uPx * (1.2 + aSeed * 2.2) * (6.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vLit;
        varying float vTw;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.0, length(c));
          gl_FragColor = vec4(vec3(1.0, 0.85, 0.62) * a * vLit * vTw * 0.9, 1.0);
        }
      `,
    });
    return { geo, mat };
  }, [count, beamFrom, beamTo]);

  useFrame(({ clock, gl }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uPx.value = gl.getPixelRatio();
  });

  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={7} />;
}

export default function Atmosphere({ lamp, pool }: { lamp: THREE.Vector3; pool: THREE.Vector3 }) {
  return (
    <group>
      <Haze />
      <Beam from={lamp} to={pool} radius={3.1} />
      <Dust beamFrom={lamp} beamTo={pool} />
    </group>
  );
}
