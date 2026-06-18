import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import * as THREE from 'three'
import { Experience } from './scene/Experience'
import { LITE } from './scene/config'
import { EscMenu } from './ui/EscMenu'
import { Hud } from './ui/Hud'
import { IntroOverlay } from './ui/IntroOverlay'

export default function App() {
  return (
    <>
      <Canvas
        shadows={LITE ? false : 'soft'}
        dpr={LITE ? 1 : [1, 2]}
        camera={{ fov: 60, near: 0.1, far: 2800, position: [100, 44, 0] }}
        gl={{ antialias: true, toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.08 }}
      >
        <Suspense fallback={null}>
          <Experience />
        </Suspense>
      </Canvas>
      <IntroOverlay />
      <EscMenu />
      <Hud />
    </>
  )
}
