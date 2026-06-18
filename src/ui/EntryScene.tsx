import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createNoise3D } from 'simplex-noise'
import * as THREE from 'three'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { addSway, convertMaterial, WIND } from '../scene/loadNature'
import { useShaftTexture } from '../scene/LightShafts'

const MGR = new THREE.LoadingManager()

function loadOBJWithMTL(objUrl: string, mtlName: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const mtl = new MTLLoader(MGR)
    mtl.setPath('/models/nature/')
    mtl.load(mtlName, (mats) => {
      mats.preload()
      const obj = new OBJLoader(MGR)
      obj.setMaterials(mats)
      obj.load(objUrl, resolve, undefined, reject)
    }, undefined, reject)
  })
}

function applyIslandMaterials(group: THREE.Group) {
  group.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return
    const mats = Array.isArray(child.material) ? child.material : [child.material]
    const converted = mats.map(convertMaterial)
    child.material = converted.length === 1 ? converted[0] : converted
    for (const mat of converted) {
      if ((mat as THREE.MeshStandardMaterial).userData?.windKind) {
        addSway(child.geometry)
        break
      }
    }
  })
}

// ─── fog ─────────────────────────────────────────────────────────────────────

function EntryFog() {
  const { scene } = useThree()
  useEffect(() => {
    const fog = new THREE.Fog('#0a0806', 14, 58)
    scene.fog = fog
    return () => { if (scene.fog === fog) scene.fog = null }
  }, [scene])
  return null
}

// ─── light shaft (single, on the tree) ───────────────────────────────────────

function EntryShaft() {
  const tex = useShaftTexture()
  const mat = useMemo(() => new THREE.MeshBasicMaterial({
    map: tex, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, fog: false,
    side: THREE.DoubleSide, color: new THREE.Color(0xff9a44), opacity: 0.09,
  }), [tex])

  useFrame(({ clock }) => {
    mat.opacity = 0.07 + 0.04 * Math.sin(clock.getElapsedTime() * 0.38 + 0.7)
  })

  // All positions are LOCAL (x=0 = tree centre); SceneGroup offsets the whole group.
  // Shaft spans world y ≈ -17 to +25, easily reaching the ground at GY=-10.
  return (
    <group position={[0, -3, 2]} rotation={[0, 0.4, 0.13]}>
      {[0, Math.PI / 3, (2 * Math.PI) / 3].map((r, j) => (
        <mesh key={j} rotation={[0, r, 0]} position={[0, 7, 0]} material={mat}>
          <planeGeometry args={[9, 44]} />
        </mesh>
      ))}
    </group>
  )
}

// ─── round glowing fireflies ──────────────────────────────────────────────────

function useDotTexture() {
  return useMemo(() => {
    const s = 64
    const c = document.createElement('canvas')
    c.width = c.height = s
    const ctx = c.getContext('2d')!
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
    g.addColorStop(0,    'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.7)')
    g.addColorStop(1,    'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, s, s)
    return new THREE.CanvasTexture(c)
  }, [])
}

const EMBER_COUNT = 55

function Fireflies() {
  const dot   = useDotTexture()
  const noise = useMemo(() => createNoise3D(), [])

  const { geo, base, phase } = useMemo(() => {
    const base  = new Float32Array(EMBER_COUNT * 3)
    const phase = new Float32Array(EMBER_COUNT)
    for (let i = 0; i < EMBER_COUNT; i++) {
      base[i * 3]     = (Math.random() - 0.5) * 48
      base[i * 3 + 1] = (Math.random() - 0.3) * 22
      base[i * 3 + 2] = (Math.random() - 0.5) * 34
      phase[i] = Math.random() * Math.PI * 2
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3))
    return { geo, base, phase }
  }, [])

  useFrame(({ clock }) => {
    const t    = clock.getElapsedTime() * 0.16
    const attr = geo.getAttribute('position') as THREE.BufferAttribute
    const arr  = attr.array as Float32Array
    for (let i = 0; i < EMBER_COUNT; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2]
      const ph = phase[i]
      arr[i * 3]     = bx + noise(bx * 0.04, by * 0.04 + ph, t) * 3.2
      arr[i * 3 + 1] = by + noise(by * 0.04, bz * 0.04 + ph, t + 1.3) * 1.8
                          + Math.sin(t * 1.05 + ph) * 0.65
      arr[i * 3 + 2] = bz + noise(bz * 0.04, bx * 0.04 + ph, t + 2.7) * 3.2
    }
    attr.needsUpdate = true
  })

  return (
    <points geometry={geo}>
      <pointsMaterial
        map={dot} color={0xffd27a} size={0.5} sizeAttenuation
        transparent opacity={0.88} depthWrite={false}
        toneMapped={false} blending={THREE.AdditiveBlending}
      />
    </points>
  )
}

// ─── falling red leaves ────────────────────────────────────────────────────────

const LEAF_COUNT = 28

function FallingLeaves() {
  const [tex, setTex] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    new THREE.TextureLoader(MGR).load('/models/nature/Leaves_TwistedTree_C.png', (t) => {
      t.colorSpace = THREE.SRGBColorSpace
      t.generateMipmaps = false
      t.minFilter = THREE.LinearFilter
      t.magFilter = THREE.LinearFilter
      setTex(t)
    })
  }, [])

  // Positions are LOCAL (x=0 = tree centre); SceneGroup adds the responsive offset.
  const { geo, vel, phase } = useMemo(() => {
    const pos   = new Float32Array(LEAF_COUNT * 3)
    const vel   = new Float32Array(LEAF_COUNT * 3)
    const phase = new Float32Array(LEAF_COUNT)
    for (let i = 0; i < LEAF_COUNT; i++) {
      pos[i * 3]     =  0  + (Math.random() - 0.5) * 8   // centred on tree x=0
      pos[i * 3 + 1] = -2  + Math.random() * 7            // canopy y range
      pos[i * 3 + 2] =  2  + (Math.random() - 0.5) * 4
      vel[i * 3]     =  0.006 + Math.random() * 0.009
      vel[i * 3 + 1] = -(0.010 + Math.random() * 0.015)
      vel[i * 3 + 2] =  (Math.random() - 0.5) * 0.005
      phase[i]       =  Math.random() * Math.PI * 2
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { geo, vel, phase }
  }, [])

  useFrame(({ clock }) => {
    const t    = clock.getElapsedTime()
    const attr = geo.getAttribute('position') as THREE.BufferAttribute
    const arr  = attr.array as Float32Array
    for (let i = 0; i < LEAF_COUNT; i++) {
      arr[i * 3]     += vel[i * 3]     + Math.sin(t * 1.1 + phase[i]) * 0.003
      arr[i * 3 + 1] += vel[i * 3 + 1]
      arr[i * 3 + 2] += vel[i * 3 + 2]
      if (arr[i * 3 + 1] < -14 || arr[i * 3] > 7) {
        arr[i * 3]     =  0 + (Math.random() - 0.5) * 6
        arr[i * 3 + 1] =  1 + Math.random() * 4
        arr[i * 3 + 2] =  2 + (Math.random() - 0.5) * 3
      }
    }
    attr.needsUpdate = true
  })

  if (!tex) return null
  return (
    <points geometry={geo}>
      <pointsMaterial
        map={tex} size={1.3} sizeAttenuation
        transparent={false} depthWrite={false} alphaTest={0.35}
      />
    </points>
  )
}

// ─── tree + ground cover ──────────────────────────────────────────────────────

// GY = ground level. All x positions are relative to tree centre (x = 0).
// Foreground grass (z ≥ 4) sits between camera and trunk (z = 2) so it
// renders on top and visually covers where the base meets the ground.
const GY = -10

const GRASS_SPOTS = [
  // foreground — in front of trunk
  { pos: [  0.0, GY, 5.0] as const, rot: 0.0,  scale: 2.4 },
  { pos: [ -1.5, GY, 4.5] as const, rot: 1.6,  scale: 2.3 },
  { pos: [  1.2, GY, 4.8] as const, rot: 4.0,  scale: 2.2 },
  // mid-ground
  { pos: [ -2.5, GY, 3.0] as const, rot: 2.1,  scale: 2.1 },
  { pos: [  1.8, GY, 3.2] as const, rot: 3.7,  scale: 2.0 },
  // background / sides
  { pos: [ -3.5, GY, 1.5] as const, rot: 0.4,  scale: 1.9 },
  { pos: [  2.5, GY, 1.0] as const, rot: 1.0,  scale: 1.8 },
  { pos: [ -4.0, GY, 3.5] as const, rot: 1.8,  scale: 1.7 },
]

const BUSH_SPOT = { pos: [ 2.2, GY, 4.2] as const, rot: 0.8, scale: 1.8 }

const FLOWER_SPOTS = [
  { pos: [-1.5, GY, 5.2] as const, rot: 1.2, scale: 1.5 },
  { pos: [ 1.5, GY, 5.5] as const, rot: 3.8, scale: 1.4 },
  { pos: [ 3.5, GY, 3.0] as const, rot: 0.5, scale: 1.4 },
]

type Models = { tree: THREE.Group; grassClones: THREE.Group[]; bush: THREE.Group; flowerClones: THREE.Group[] }

function ForestScene({ onEnter }: { onEnter?: () => void }) {
  const [models, setModels] = useState<Models | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      loadOBJWithMTL('/models/nature/TwistedTree_2.obj',       'TwistedTree_2.mtl'),
      loadOBJWithMTL('/models/nature/Grass_Common_Short.obj',  'Grass_Common_Short.mtl'),
      loadOBJWithMTL('/models/nature/Bush_Common_Flowers.obj', 'Bush_Common_Flowers.mtl'),
      loadOBJWithMTL('/models/nature/Flower_3_Group.obj',      'Flower_3_Group.mtl'),
    ]).then(([tree, grassSrc, bushSrc, flowerSrc]) => {
      if (!alive) return
      for (const g of [tree, grassSrc, bushSrc, flowerSrc]) applyIslandMaterials(g)

      const grassClones = GRASS_SPOTS.map(({ pos, rot, scale }) => {
        const g = grassSrc.clone(true)
        g.position.set(pos[0], pos[1], pos[2])
        g.rotation.y = rot
        g.scale.setScalar(scale)
        return g
      })
      const flowerClones = FLOWER_SPOTS.map(({ pos, rot, scale }) => {
        const f = flowerSrc.clone(true)
        f.position.set(pos[0], pos[1], pos[2])
        f.rotation.y = rot
        f.scale.setScalar(scale)
        return f
      })
      bushSrc.position.set(BUSH_SPOT.pos[0], BUSH_SPOT.pos[1], BUSH_SPOT.pos[2])
      bushSrc.rotation.y = BUSH_SPOT.rot
      bushSrc.scale.setScalar(BUSH_SPOT.scale)

      setModels({ tree, grassClones, bush: bushSrc, flowerClones })
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  if (!models) return null

  const click = (e: { stopPropagation: () => void }) => { e.stopPropagation(); onEnter?.() }

  return (
    <>
      {/* Tree — clickable */}
      <group position={[0, GY, 2]} scale={[0.9, 0.9, 0.9]} rotation={[0, Math.PI, -0.18]} onClick={click}>
        <primitive object={models.tree} />
      </group>
      {/* Grass — clickable */}
      {models.grassClones.map((g, i) => (
        <primitive key={i} object={g} onClick={click} />
      ))}
      {/* Bush + flowers — not clickable */}
      <primitive object={models.bush} />
      {models.flowerClones.map((f, i) => <primitive key={i} object={f} />)}
    </>
  )
}

// ─── constant wind for the entry scene ───────────────────────────────────────
// DayNight (main canvas) varies WIND.cAmp / gAmp over time, creating gusts that
// look weird on the entry tree. This component pins them to calm fixed values
// every frame. It unmounts with the overlay when ENTER is pressed.
function ConstantWind() {
  useFrame(() => {
    WIND.gAmp.value     = 0.055
    WIND.cAmp.value     = 0.12
    WIND.gSpeed.value   = 0.9
    WIND.cSpeed.value   = 0.65
    WIND.gFlutter.value = 0.018
    WIND.cFlutter.value = 0.06
  })
  return null
}

// ─── hover parallax camera (no drag) ─────────────────────────────────────────

const CAM_LOOK  = new THREE.Vector3(0, -2, 0)
const CAM_Y     = 6    // base height — change this to raise/lower the camera
const CAM_Z     = 20   // base distance forward
const HOVER_AMP = 0.10

function DragCamera() {
  const { camera } = useThree()
  const hoverTgt = useRef({ x: 0, y: 0 })
  const curr     = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth  - 0.5) * 2
      const ny = (e.clientY / window.innerHeight - 0.5) * 2
      hoverTgt.current.x = -nx * HOVER_AMP * CAM_Z
      hoverTgt.current.y = -ny * HOVER_AMP * CAM_Z * 0.5
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useFrame(() => {
    curr.current.x += (hoverTgt.current.x - curr.current.x) * 0.06
    curr.current.y += (hoverTgt.current.y - curr.current.y) * 0.06
    camera.position.set(
      curr.current.x,
      CAM_Y + curr.current.y,
      CAM_Z,
    )
    camera.lookAt(CAM_LOOK)
  })

  return null
}

// ─── "CLICK TO START" billboard ──────────────────────────────────────────────
// Canvas texture: Nunito 800 text + hand-drawn arrow + speaker icon + × marks.

function ClickToStart() {
  const [tex, setTex] = useState<THREE.Texture | null>(null)

  useEffect(() => {
    const W = 600, H = 300
    const c = document.createElement('canvas')
    c.width = W; c.height = H
    const ctx = c.getContext('2d')!

    const paint = () => {
      ctx.clearRect(0, 0, W, H)

      const shadow = () => {
        ctx.shadowColor = 'rgba(8, 3, 18, 0.85)'
        ctx.shadowBlur = 9
        ctx.shadowOffsetX = 2
        ctx.shadowOffsetY = 3
      }

      // Layout: arrow on LEFT, text on RIGHT, speaker below text
      const textX = 390  // text centre x
      const textY1 = 112, textY2 = 208

      // "CLICK TO" + "START" — Nunito 800
      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'alphabetic'
      ctx.font = '800 80px Nunito, sans-serif'
      ctx.fillStyle = '#ffffff'
      shadow()
      ctx.fillText('CLICK TO', textX, textY1)
      ctx.fillText('START',    textX, textY2)
      ctx.restore()

      // Curved arrow — starts right (near text), curves down-left, tip points LEFT (toward tree)
      ctx.save()
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.90)'
      ctx.lineWidth = 3.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      shadow()
      const p0: [number, number] = [225, 158]
      const p1: [number, number] = [242, 194]
      const p2: [number, number] = [188, 234]
      const p3: [number, number] = [72, 224]
      ctx.beginPath()
      ctx.moveTo(...p0)
      ctx.bezierCurveTo(...p1, ...p2, ...p3)
      ctx.stroke()
      // Arrowhead — tangent at end from p2→p3 (points left toward tree)
      const adx = p3[0] - p2[0], ady = p3[1] - p2[1]
      const al = Math.sqrt(adx * adx + ady * ady)
      const ux = adx / al, uy = ady / al
      const ah = 14, sp = 0.42
      const rotPt = (dx: number, dy: number, a: number): [number, number] =>
        [dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a)]
      const [lx, ly] = rotPt(-ux, -uy,  sp)
      const [rx, ry] = rotPt(-ux, -uy, -sp)
      ctx.beginPath()
      ctx.moveTo(p3[0], p3[1]); ctx.lineTo(p3[0] + lx * ah, p3[1] + ly * ah)
      ctx.moveTo(p3[0], p3[1]); ctx.lineTo(p3[0] + rx * ah, p3[1] + ry * ah)
      ctx.stroke()
      ctx.restore()

      // Speaker icon — below the text, manual paths
      ctx.save()
      ctx.fillStyle = 'rgba(255, 255, 255, 0.90)'
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.90)'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      shadow()
      const sx = textX, sy = 268
      ctx.fillRect(sx - 28, sy - 11, 18, 22)
      ctx.beginPath()
      ctx.moveTo(sx - 10, sy - 11)
      ctx.lineTo(sx + 16, sy - 26)
      ctx.lineTo(sx + 16, sy + 26)
      ctx.lineTo(sx - 10, sy + 11)
      ctx.closePath()
      ctx.fill()
      ctx.beginPath(); ctx.arc(sx + 16, sy, 16, -0.7, 0.7); ctx.stroke()
      ctx.beginPath(); ctx.arc(sx + 16, sy, 27, -0.7, 0.7); ctx.stroke()
      ctx.restore()

      const t = new THREE.CanvasTexture(c)
      t.colorSpace = THREE.SRGBColorSpace
      setTex(prev => { prev?.dispose(); return t })
    }

    paint()
    document.fonts.ready.then(paint)
  }, [])

  if (!tex) return null
  return (
    <mesh position={[7, 0, 3]} rotation={[0, -Math.PI / 4, 0]} renderOrder={10}>
      <planeGeometry args={[8, 8 * (300 / 600)]} />
      <meshBasicMaterial
        map={tex} transparent depthWrite={false} depthTest={false}
        toneMapped={false} fog={false}
      />
    </mesh>
  )
}

// ─── responsive offset wrapper ────────────────────────────────────────────────
// Tree sits at ¼ of viewport width left of centre on every screen size:
//   desktop 16:9  → x ≈ −9.2
//   mobile portrait → x ≈ −2.9  (feels centred on a narrow screen)
// This matches "between the left window border and the left edge of the ENTER button".

function SceneGroup({ onEnter }: { onEnter?: () => void }) {
  return (
    <group position={[0, 0, 0]}>
      <EntryShaft />
      <FallingLeaves />
      <ForestScene onEnter={onEnter} />
    </group>
  )
}

// ─── canvas ───────────────────────────────────────────────────────────────────

export function EntryScene({ onEnter }: { onEnter?: () => void }) {
  return (
    <Canvas
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      camera={{ position: [0, 6, 20], fov: 55 }}
      gl={{ alpha: true, antialias: false }}
    >
      <EntryFog />

      <ambientLight color="#c87838" intensity={0.7} />
      <hemisphereLight args={['#d4a030', '#2c1404', 1.3]} />
      <directionalLight color="#ff7a2e" intensity={2.0} position={[149, 4, 57]} />

      <ConstantWind />
      <DragCamera />

      {/* Fireflies span the whole screen — not inside the offset group */}
      <Fireflies />

      <SceneGroup onEnter={onEnter} />
      <ClickToStart />
    </Canvas>
  )
}
