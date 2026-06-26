import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useWorld } from '../state/useWorld'
import { MESSAGE_BOARD, WEST_WAYPOINTS } from './layout'
import { getSky } from './palette'
import { getHeight } from './terrain'
import { WIND } from './loadNature'
import { patchReveal } from './patchReveal'
import { InteractMarker } from './InteractMarker'
import { registerInteract, unregisterInteract } from './interact'
import { PROJECTS } from './projects'
import { BOARD, BOARD_FOCUS } from './boardFocus'
import { translate, useT } from '../i18n'
import { IS_TOUCH } from '../input/device'
import { HAND } from '../ui/theme'

// ---------------------------------------------------------------------------
// The projects message board at the western end of the west spur. The BOARD stays
// still — it's the wide sheet of PAPER pinned to it that flutters in the wind, one
// per project (title, short description, image on the side), with the writing drawn
// straight onto it. The paper is UNLIT (MeshBasic) so no light — bright sun, night
// glow or a lamp behind it — can ever wash the words out. Press E and the camera
// glides in to frame it (BoardCamera.tsx) while the paper eases to rest so the text
// holds still; the ◀ ▶ bar (ui/ProjectsBoard.tsx) flips to the next sheet and
// carries the Source / Live-preview buttons.
// ---------------------------------------------------------------------------

const BOARD_HEIGHT = 2.4 // world height the GLB is auto-scaled to (before BOARD_SCALE)
const BOARD_SCALE = 1.35 // overall size of the whole board + paper
const BOARD_MODEL_YAW = 0 // extra spin if the GLB's own front isn't its local +Z
const VIEW_DIST = 1.6 // how far in front of the paper the reading camera sits (before BOARD_SCALE)

// The pinned paper, in the board's local space (group origin = board base on the
// ground, local +Z = the board's front, toward the climber). Wide / landscape.
const PAPER_W = 1.12
const PAPER_H = 0.72
const PAPER_Y = 1.5 // height of the paper's centre up the board
const PAPER_Z = 0.13 // proud of the panel face

// Where the player walks IN from along the spur — so the board turns its face back
// up the path toward them.
const APPROACH = WEST_WAYPOINTS[WEST_WAYPOINTS.length - 2]
const FACE_YAW = Math.atan2(APPROACH.x - MESSAGE_BOARD.x, APPROACH.z - MESSAGE_BOARD.z)

function useBoardModel() {
  const { scene } = useGLTF('/models/message_board.glb')
  return useMemo(() => {
    const root = scene.clone(true)
    root.updateMatrixWorld(true)
    const size = new THREE.Vector3()
    new THREE.Box3().setFromObject(root).getSize(size)
    root.scale.setScalar(BOARD_HEIGHT / (size.y || 1))
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const c = new THREE.Vector3()
    box.getCenter(c)
    root.position.set(-c.x, -box.min.y, -c.z) // base seated at y=0, centred in x/z
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!(mesh as { isMesh?: boolean }).isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const patch = (m: THREE.Material) => {
        const cl = m.clone()
        patchReveal(cl)
        return cl
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(patch) : patch(mesh.material)
    })
    return root
  }, [scene])
}

// Break a string into rows that each fit within maxW at the current ctx.font.
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(' ')
  const rows: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxW && line) {
      rows.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) rows.push(line)
  return rows
}

// Draw a cover-fit image into a box (center-cropped).
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ir = img.width / img.height
  const br = w / h
  let sw = img.width
  let sh = img.height
  if (ir > br) { sw = img.height * br } else { sh = img.width / br }
  const sx = (img.width - sw) / 2
  const sy = (img.height - sh) / 2
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

// Draw one project onto the wide cream paper (handwritten ink, image on the side).
// `desc` is the already-localized description string.
function drawPaper(ctx: CanvasRenderingContext2D, i: number, desc: string, img?: HTMLImageElement) {
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  const p = PROJECTS[i] ?? PROJECTS[0]
  ctx.clearRect(0, 0, W, H)
  // paper + a soft inked border
  ctx.fillStyle = '#f6efda'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(120,98,64,0.28)'
  ctx.lineWidth = 5
  ctx.strokeRect(16, 16, W - 32, H - 32)

  // image box on the right
  const bw = 232
  const bh = 300
  const bx = W - 46 - bw
  const by = 66
  ctx.save()
  ctx.beginPath()
  ctx.rect(bx, by, bw, bh)
  ctx.clip()
  if (img) {
    drawCover(ctx, img, bx, by, bw, bh)
  } else {
    ctx.fillStyle = '#eae1c8'
    ctx.fillRect(bx, by, bw, bh)
    ctx.fillStyle = 'rgba(111,88,54,0.5)'
    ctx.font = `26px ${HAND}`
    ctx.textAlign = 'center'
    ctx.fillText('no preview', bx + bw / 2, by + bh / 2)
  }
  ctx.restore()
  ctx.strokeStyle = '#caa46a'
  ctx.lineWidth = 4
  ctx.strokeRect(bx, by, bw, bh)

  // left text column — kept clear of the image box with a gap so text never runs
  // over it. Long lines word-wrap to the column width.
  const lx = 46
  const lw = bx - 26 - lx
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  // title (wraps if very long)
  ctx.fillStyle = '#5a4528'
  ctx.font = `52px ${HAND}`
  let ty = 106
  for (const row of wrap(ctx, p.name, lw)) { ctx.fillText(row, lx, ty); ty += 50 }
  // meta
  if (p.meta) {
    ctx.fillStyle = 'rgba(111,88,54,0.78)'
    ctx.font = `27px ${HAND}`
    ctx.fillText(p.meta, lx, ty + 6)
    ty += 34
  }
  // divider
  ctx.strokeStyle = '#e2d5b4'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(lx, ty + 18)
  ctx.lineTo(lx + lw, ty + 18)
  ctx.stroke()
  // description (wraps to the column)
  ctx.fillStyle = '#6f5836'
  ctx.font = `31px ${HAND}`
  let y = ty + 62
  for (const row of wrap(ctx, desc, lw)) { ctx.fillText(row, lx, y); y += 42 }
}

// A single fluttering paper pinned at the top, deformed on the CPU (cheap — one
// small plane). It is UNLIT, so it reads the same in any light. The flutter
// amplitude scales with the wind AND with (1 - focus), so it stills smoothly to a
// flat, readable sheet while you read and breathes again on leave (amplitude → 0 =
// flat, so no clipping).
function Paper() {
  const projectIndex = useWorld((s) => s.projectIndex)
  const language = useWorld((s) => s.language)
  const meshRef = useRef<THREE.Mesh>(null)
  const imgCache = useRef(new Map<string, HTMLImageElement>())

  const geom = useMemo(() => new THREE.PlaneGeometry(PAPER_W, PAPER_H, 14, 12), [])
  const base = useMemo(() => Float32Array.from(geom.attributes.position.array), [geom])

  const { texture, ctx } = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 760
    canvas.height = 488
    const c = canvas.getContext('2d')!
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    return { texture: tex, ctx: c }
  }, [])

  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
    [texture],
  )

  // (Re)draw when the shown project changes; wait for the handwriting font, and pull
  // in the side image (cached) when it loads.
  useEffect(() => {
    const p = PROJECTS[projectIndex]
    const desc = translate(language, p.descKey)
    const paint = () => {
      drawPaper(ctx, projectIndex, desc, p.image ? imgCache.current.get(p.image) : undefined)
      texture.needsUpdate = true
    }
    paint()
    const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts
    fonts?.ready?.then(paint)
    if (p.image && !imgCache.current.has(p.image)) {
      const im = new Image()
      im.onload = () => { imgCache.current.set(p.image!, im); paint() }
      im.src = p.image
    }
  }, [projectIndex, ctx, texture, language])

  useFrame((state) => {
    const mesh = meshRef.current
    if (!mesh) return
    const t = state.clock.elapsedTime
    const amp = 0.05 * (0.4 + WIND.strength.value) * (1 - BOARD_FOCUS.p)
    const pos = geom.attributes.position
    const arr = pos.array as unknown as Float32Array
    for (let i = 0; i < arr.length; i += 3) {
      const bx = base[i]
      const by = base[i + 1]
      const w = (PAPER_H / 2 - by) / PAPER_H // 0 pinned at top → 1 free at the bottom
      const wave = Math.sin(bx * 5 + t * 2.4) * 0.6 + Math.sin(by * 3.5 - t * 1.8) * 0.4
      arr[i] = bx + Math.sin(t * 1.6 + by * 3) * amp * 0.35 * w
      arr[i + 2] = base[i + 2] + wave * amp * w
    }
    pos.needsUpdate = true
  })

  return (
    <group position={[0, PAPER_Y, PAPER_Z]}>
      <mesh ref={meshRef} geometry={geom} material={material} />
      {/* a little tack holding it at the top */}
      <mesh position={[0, PAPER_H / 2 - 0.02, 0.012]}>
        <sphereGeometry args={[0.022, 10, 10]} />
        <meshStandardMaterial color={0x9a3b34} roughness={0.5} />
      </mesh>
    </group>
  )
}

export function MessageBoard() {
  const model = useBoardModel()
  const t = useT()
  const groundY = useMemo(() => getHeight(MESSAGE_BOARD.x, MESSAGE_BOARD.z), [])
  const light = useRef<THREE.PointLight>(null!)

  // Publish the framed point (the paper's centre) + the reading camera pose.
  useEffect(() => {
    const fx = Math.sin(FACE_YAW)
    const fz = Math.cos(FACE_YAW)
    const cx = MESSAGE_BOARD.x + fx * PAPER_Z * BOARD_SCALE
    const cz = MESSAGE_BOARD.z + fz * PAPER_Z * BOARD_SCALE
    const cy = groundY + PAPER_Y * BOARD_SCALE
    BOARD.center.set(cx, cy, cz)
    BOARD.camPos.set(cx + fx * VIEW_DIST * BOARD_SCALE, cy, cz + fz * VIEW_DIST * BOARD_SCALE)
    BOARD.ready = true
    registerInteract({
      id: 'message-board',
      x: MESSAGE_BOARD.x,
      y: cy,
      z: MESSAGE_BOARD.z,
      range: 4.8,
      activate: () => useWorld.getState().toggleProjects(),
    })
    return () => unregisterInteract('message-board')
  }, [groundY])

  // A gentle warm light just grazes the wooden board at night (the paper itself is
  // unlit, so this can't wash the words out) — kept low so the board never glows.
  useFrame(() => {
    if (!light.current) return
    const nf = getSky(useWorld.getState().t).nightFactor
    light.current.intensity = 0.1 + nf * 0.9
  })

  return (
    <>
      <group
        position={[MESSAGE_BOARD.x, groundY, MESSAGE_BOARD.z]}
        rotation={[0, FACE_YAW + BOARD_MODEL_YAW, 0]}
        scale={BOARD_SCALE}
      >
        <primitive object={model} />
        <Paper />
        <pointLight ref={light} position={[0, PAPER_Y + 0.4, 0.9]} color={0xffe2b0} distance={5} decay={2} />
      </group>
      {/* marker uses WORLD coords for its distance/occlusion math — keep it
          untransformed. Sits just UNDER the paper. */}
      <InteractMarker
        id="message-board"
        x={MESSAGE_BOARD.x}
        y={groundY + (PAPER_Y - PAPER_H / 2) * BOARD_SCALE - 0.2}
        z={MESSAGE_BOARD.z}
        label={t('marker.projects.label')}
        hint={IS_TOUCH ? t('marker.projects.hint.touch') : t('marker.projects.hint.desktop')}
      />
    </>
  )
}

useGLTF.preload('/models/message_board.glb')
