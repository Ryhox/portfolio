import { Canvas } from '@react-three/fiber'
import { Suspense } from 'react'
import * as THREE from 'three'
import { Experience } from './scene/Experience'
import { Warmup } from './scene/Warmup'
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
import { AboutPanel } from './ui/AboutPanel'
import { ProjectsBoard } from './ui/ProjectsBoard'
import { SitHint } from './ui/SitHint'
import { CompassHUD } from './ui/CompassHUD'
import { HoldReturnIndicator } from './ui/HoldReturnIndicator'
import { QuestList } from './ui/QuestList'
import { TouchControls } from './ui/TouchControls'
import { TouchDisclaimer } from './ui/TouchDisclaimer'

export default function App() {
  return (
    <>
      <Canvas
        shadows={LITE ? false : 'soft'}
        dpr={LITE ? 1 : [1, 2]}
        camera={{ fov: 60, near: 0.1, far: 2800, position: [100, 44, 0] }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance', toneMapping: THREE.AgXToneMapping, toneMappingExposure: 1.08 }}
      >
        {/* No <color> — canvas is transparent so CSS body #0c0a18 shows through */}
        <IntroGrid />
        {/* Outside Suspense so it tracks asset progress during loading, then warms
            the GPU (shaders/geometry/shadows/textures) before the intro reveals. */}
        <Warmup />
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
      <AboutPanel />
      <ProjectsBoard />
      <SitHint />
      <CompassHUD />
      <HoldReturnIndicator />
      <QuestList />
      <TouchControls />
      <TouchDisclaimer />
      <MapTransition />
    </>
  )
}
