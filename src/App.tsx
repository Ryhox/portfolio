import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import * as THREE from 'three'
import { Experience } from './scene/Experience'
import { LITE } from './scene/config'
import { Brand } from './ui/Brand'
import { EscMenu } from './ui/EscMenu'
import { Minimap } from './ui/Minimap'
import { WorldMap } from './ui/WorldMap'
import { IntroController } from './ui/intro/IntroController'
import { IntroGrid } from './ui/intro/IntroGrid'
import { IntroLabel } from './ui/intro/IntroLabel'
import { LoadingScreen } from './ui/intro/LoadingScreen'
import { WaterOverlay } from './ui/WaterOverlay'
import { MapTransition } from './ui/MapTransition'
import { EnteringIslandBanner } from './ui/EnteringIslandBanner'
import { IslandInfo } from './ui/IslandInfo'
import { CompassHUD } from './ui/CompassHUD'
import { HoldReturnIndicator } from './ui/HoldReturnIndicator'

export default function App() {
  return (
    <>
      <Canvas
        shadows={LITE ? false : 'soft'}
        dpr={LITE ? 1 : [1, 2]}
        camera={{ fov: 60, near: 0.1, far: 2800, position: [100, 44, 0] }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.08 }}
      >
        {/* No <color> — canvas is transparent so CSS body #0c0a18 shows through */}
        <IntroGrid />
        <Suspense fallback={null}>
          <Experience />
        </Suspense>
      </Canvas>
      <LoadingScreen />
      <IntroLabel />
      <IntroController />
      <EscMenu />
      <Brand />
      <Minimap />
      <WorldMap />
      <WaterOverlay />
      <EnteringIslandBanner />
      <IslandInfo />
      <CompassHUD />
      <HoldReturnIndicator />
      <MapTransition />
    </>
  )
}
