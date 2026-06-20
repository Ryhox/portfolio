/**
 * Loading progress ring — fills clockwise as assets load (0→1).
 * Accepts a completion callback so IntroController can sequence
 * collapse → reveal with no overlap (two-ring artifact avoided).
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import gsap from 'gsap'
import { useWorld } from '../../state/useWorld'
import { introActions } from './introActions'
import { RING_X, RING_Z, RING_GROUND_Y } from '../../scene/spawnConstants'

const vertexShader = /* glsl */`
varying vec3 vLocalPos;
void main() {
  vLocalPos   = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = /* glsl */`
varying vec3  vLocalPos;
uniform float smoothedProgress;
uniform vec3  ringColor;

void main() {
  float angle         = atan(vLocalPos.y, vLocalPos.x);
  float angleProgress = 1.0 - (angle / 6.28318530718 + 0.5);
  if (smoothedProgress < angleProgress) discard;
  gl_FragColor = vec4(ringColor, 1.0);
}
`

const OUTER = 5.0
const INNER = OUTER - 0.04

export function IntroRing() {
  const meshRef  = useRef<THREE.Mesh>(null)
  const matRef   = useRef<THREE.ShaderMaterial>(null)
  const smoothed = useRef(0)

  const uniforms = useMemo(() => ({
    smoothedProgress: { value: 0.0 },
    ringColor:        { value: new THREE.Color('#e88eff').multiplyScalar(5.5) },
  }), [])

  useFrame((_, dt) => {
    const target = useWorld.getState().introProgress
    smoothed.current += (target - smoothed.current) * Math.min(dt * 10, 1)
    if (matRef.current) {
      matRef.current.uniforms.smoothedProgress.value = smoothed.current
    }
  })

  useEffect(() => {
    // Accepts onDone callback — called when ring is fully invisible
    introActions.collapseProgress = (onDone: () => void) => {
      if (!meshRef.current) return
      const dummy = { scale: 1 }
      gsap.to(dummy, {
        scale: 0,
        duration: 1.0,
        ease: 'power3.in',
        overwrite: true,
        onUpdate: () => { meshRef.current?.scale.setScalar(dummy.scale) },
        onComplete: () => {
          if (meshRef.current) meshRef.current.visible = false
          onDone()
        },
      })
    }
    return () => { introActions.collapseProgress = null }
  }, [])

  return (
    <mesh
      ref={meshRef}
      renderOrder={100}
      position={[RING_X, RING_GROUND_Y + 0.002, RING_Z]}
      rotation={[-Math.PI / 2, 0, Math.PI / 2]}
    >
      <ringGeometry args={[INNER, OUTER, 128, 1]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        side={THREE.DoubleSide}
        transparent={true}
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  )
}
