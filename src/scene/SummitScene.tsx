import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useWorld } from '../state/useWorld'
import { getSky } from './palette'
import { getHeight } from './terrain'
import { WIND } from './loadNature'
import { patchReveal } from './patchReveal'
import { Logo3D } from './Logo3D'
import { InteractMarker } from './InteractMarker'
import { ACTIVE, activateNearest, refreshNearest, registerInteract, unregisterInteract } from './interact'
import { ARC_CENTER, PEDESTAL_HEIGHT, PORTRAIT, type PedestalSpot, type SocialDef, pedestalSpots } from './summit'
import { useT, tg, type StringKey } from '../i18n'
import { IS_TOUCH } from '../input/device'

type T = (key: StringKey, vars?: Record<string, string | number>) => string

// The pedestal label/hint depend on the social: brand/email names + the email
// address / GitHub URL stay verbatim; only Discord's "copy" hint is localized.
function socialLabel(t: T, id: string): string {
  if (id === 'email') return t('marker.social.email')
  if (id === 'github') return t('marker.social.github')
  if (id === 'discord') return t('marker.social.discord')
  return id
}
function socialHint(t: T, id: string, fallback: string): string {
  if (id === 'discord') return IS_TOUCH ? t('marker.discord.hint.touch') : t('marker.discord.hint.desktop')
  return fallback // email address / github url — not translated
}

// ---------------------------------------------------------------------------
// The summit shrine on the Heartwood hill: a portrait of the maker nailed to the
// great tree (press E → the "About me" panel) ringed by three stone pedestals,
// each topped with a 3D social logo (press E → open / copy). See summit.ts for
// the layout and interact.ts for the proximity + E-key plumbing.
// ---------------------------------------------------------------------------

const HEART_TOP = new THREE.Color(0xffe7bf)
const _fwd = new THREE.Vector3() // scratch for the camera gaze each frame

// Fire the social action: open a link, a mail client, or copy a handle.
function openSocial(s: SocialDef) {
  useWorld.getState().completeQuest('socials') // cross off the to-do once you reach out
  if (s.kind === 'mailto') {
    window.location.href = s.value
  } else if (s.kind === 'url') {
    window.open(s.value, '_blank', 'noopener,noreferrer')
  } else {
    navigator.clipboard?.writeText(s.value).catch(() => {})
    toast(tg('summit.discordCopied', { handle: s.value }))
  }
}

// A small cozy toast (used for the "copied" feedback). Plain DOM so it works
// without threading more React state through the HUD.
let toastTimer = 0
function toast(msg: string) {
  let el = document.getElementById('summit-toast') as HTMLDivElement | null
  if (!el) {
    el = document.createElement('div')
    el.id = 'summit-toast'
    el.style.cssText =
      'position:fixed;left:50%;bottom:120px;transform:translateX(-50%);z-index:140;' +
      "font-family:'Patrick Hand','Nunito','Noto Sans KR','Noto Sans JP','Noto Sans SC',cursive;font-size:19px;color:#3a2f1c;" +
      'background:#f6efda;border:1px solid #d7c8a3;border-radius:9px;padding:8px 15px;' +
      'box-shadow:0 4px 14px rgba(0,0,0,0.45);pointer-events:none;opacity:0;transition:opacity .2s ease;'
    document.body.appendChild(el)
  }
  el.textContent = msg
  requestAnimationFrame(() => (el!.style.opacity = '1'))
  window.clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => el && (el.style.opacity = '0'), 1600)
}

// One stone pedestal (pedestal.glb, auto-scaled, base seated on the ground) with
// its 3D logo standing on top facing outward.
function Pedestal({ spot }: { spot: PedestalSpot }) {
  const { scene } = useGLTF('/models/pedestal.glb')
  const model = useMemo(() => {
    const root = scene.clone(true)
    root.updateMatrixWorld(true)
    const size = new THREE.Vector3()
    new THREE.Box3().setFromObject(root).getSize(size)
    root.scale.setScalar(PEDESTAL_HEIGHT / (size.y || 1))
    root.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(root)
    const center = new THREE.Vector3()
    box.getCenter(center)
    root.position.set(-center.x, -box.min.y, -center.z)
    // Keep the GLB's OWN materials (so its baked stone texture survives) — just
    // clone + reveal-patch them so they don't pop through the intro ring.
    root.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!(mesh as { isMesh?: boolean }).isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      const patch = (m: THREE.Material) => {
        const c = m.clone()
        patchReveal(c)
        return c
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(patch) : patch(mesh.material)
    })
    return root
  }, [scene])

  // A small brand-coloured light at the logo so it casts a glow on the pedestal
  // and the ground around it — subtle by day, lantern-bright at night. The logo
  // itself floats above the pedestal with a gentle bob.
  const light = useRef<THREE.PointLight>(null!)
  const baseY = PEDESTAL_HEIGHT + 0.42 // fixed hover height above the pedestal top
  useFrame((state) => {
    const t = state.clock.elapsedTime
    const nf = getSky(useWorld.getState().t).nightFactor
    const flick = 0.92 + Math.sin(t * 2 + spot.x) * 0.06
    // Emissive doesn't cast light, so THIS brand-coloured light is what actually
    // spills the logo's colour onto the stone + ground (blue under the Wumpus,
    // gold under the envelope…). Strong at night.
    light.current.intensity = (0.2 + nf * 3.2) * flick
  })

  return (
    <group position={[spot.x, spot.y, spot.z]}>
      <primitive object={model} />
      <group position={[0, baseY, 0]} rotation={[0, spot.faceY, 0]}>
        <Logo3D model={spot.social.model} color={spot.social.color} />
      </group>
      <pointLight
        ref={light}
        position={[0, baseY + 0.1, 0]}
        color={spot.social.color}
        distance={6}
        decay={2}
      />
    </group>
  )
}

// The framed portrait nailed to the Heartwood, hung with a slight forward lean.
function Portrait() {
  const groundY = useMemo(() => getHeight(PORTRAIT.x, PORTRAIT.z), [])
  const photoMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: 0x4a4148, roughness: 0.85, metalness: 0 })
    patchReveal(m)
    return m
  }, [])
  const frameMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.85 })
    patchReveal(m)
    return m
  }, [])
  const nailMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: 0x2a2630, roughness: 0.4, metalness: 0.7 })
    patchReveal(m)
    return m
  }, [])

  // Load the photo. Try each candidate filename in turn; keep the neutral
  // fallback (and warn) if none of them are present in public/ yet.
  useEffect(() => {
    const loader = new THREE.TextureLoader()
    const tryAt = (i: number) => {
      if (i >= PORTRAIT.textures.length) {
        console.warn(
          `[summit] no portrait image found. Save your photo in public/ as one of: ` +
            PORTRAIT.textures.join(', '),
        )
        return
      }
      loader.load(
        PORTRAIT.textures[i],
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          photoMat.color.set(0xffffff)
          photoMat.map = tex
          photoMat.needsUpdate = true
        },
        undefined,
        () => tryAt(i + 1),
      )
    }
    tryAt(0)
  }, [photoMat])

  const w = PORTRAIT.width
  const h = PORTRAIT.height
  const fr = 0.08 // frame border thickness
  const drop = h / 2 + fr + 0.05 // frame centre hangs this far below the nail

  // Gentle wind sway, pivoting from the nail at the top. Tiny amplitude, scaled by
  // the live wind so it breathes with the rest of the foliage.
  const swing = useRef<THREE.Group>(null)
  useFrame((state) => {
    if (!swing.current) return
    const t = state.clock.elapsedTime
    const wind = 0.6 + WIND.strength.value
    swing.current.rotation.z = Math.sin(t * 0.9) * 0.03 * wind
    swing.current.rotation.x = PORTRAIT.tilt + Math.sin(t * 0.7 + 1.3) * 0.014 * wind
  })

  return (
    // Anchor at the nail (top), against the trunk; the frame dangles below it.
    <group position={[PORTRAIT.x, groundY + PORTRAIT.nailY, PORTRAIT.z]} rotation={[0, PORTRAIT.yaw, 0]}>
      {/* nail head, driven a little into the bark (points back, -z) */}
      <mesh material={nailMat} position={[0, 0, 0.02]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.045, 0.16, 10]} />
      </mesh>
      <group ref={swing}>
        <group position={[0, -drop, 0.08]}>
          {/* frame backing */}
          <mesh material={frameMat} position={[0, 0, -0.04]} castShadow>
            <boxGeometry args={[w + fr * 2, h + fr * 2, 0.07]} />
          </mesh>
          {/* photo */}
          <mesh material={photoMat} position={[0, 0, 0.012]}>
            <planeGeometry args={[w, h]} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

// Proximity driver: each frame arm the nearest in-range interactable; an E
// keypress fires it (open a social, or toggle the About panel). One window-level
// keydown is enough — the summit is far from the boat, so it never clashes with
// boarding.
function SummitInteract({ spots }: { spots: PedestalSpot[] }) {
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    for (const s of spots) {
      registerInteract({
        id: `social-${s.social.id}`,
        x: s.x,
        y: s.y + PEDESTAL_HEIGHT,
        z: s.z,
        range: 4.8,
        activate: () => openSocial(s.social),
      })
    }
    registerInteract({
      id: 'portrait',
      x: PORTRAIT.x,
      y: getHeight(PORTRAIT.x, PORTRAIT.z) + PORTRAIT.nailY - 0.6,
      z: PORTRAIT.z,
      range: Math.max(PORTRAIT.range, 4.5),
      // Open-only: walking up + E opens the panel. Closing is handled globally
      // (E anywhere, or ESC) by AboutPanel, so you can dismiss it after walking off.
      activate: () => { if (!useWorld.getState().aboutOpen) useWorld.getState().setAboutOpen(true) },
    })
    return () => {
      for (const s of spots) unregisterInteract(`social-${s.social.id}`)
      unregisterInteract('portrait')
    }
  }, [spots])

  useFrame(() => {
    // Horizontal gaze direction, so E only fires what you're looking at.
    camera.getWorldDirection(_fwd)
    const fx = _fwd.x
    const fz = _fwd.z
    const len = Math.hypot(fx, fz) || 1
    refreshNearest(camera.position.x, camera.position.z, fx / len, fz / len)
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE' || e.repeat) return
      const ws = useWorld.getState()
      if (!ws.started || ws.menuOpen || ws.mapOpen || ws.boatMode === 'sailing') return
      if (!ACTIVE.id) return
      activateNearest()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return null
}

// Warm lantern-light over the shrine so the portrait + pedestals stay clearly
// visible at dusk and night. A high key light covers the whole clearing and a
// low fill light grazes the row of pedestals so the mascots never fall into
// shadow. Both swell hard at night; a touch of base light keeps them lit by day.
function ShrineLight() {
  const key = useRef<THREE.PointLight>(null!)
  const fill = useRef<THREE.PointLight>(null!)
  const groundY = useMemo(() => getHeight(PORTRAIT.x, PORTRAIT.z), [])
  useFrame((state) => {
    const nf = getSky(useWorld.getState().t).nightFactor
    const flick = 0.93 + Math.sin(state.clock.elapsedTime * 2.3) * 0.05
    key.current.intensity = (1.0 + nf * 7.0) * flick
    fill.current.intensity = (0.6 + nf * 4.5) * flick
  })
  return (
    <group>
      <pointLight
        ref={key}
        position={[PORTRAIT.x, groundY + PORTRAIT.nailY + 1.6, PORTRAIT.z + 2.0]}
        color={HEART_TOP}
        distance={26}
        decay={1.5}
        castShadow={false}
      />
      <pointLight
        ref={fill}
        position={[ARC_CENTER.x, groundY + 2.2, ARC_CENTER.z]}
        color={0xffd9a0}
        distance={20}
        decay={1.6}
        castShadow={false}
      />
    </group>
  )
}

export function Summit() {
  const t = useT()
  const spots = useMemo(() => pedestalSpots(), [])
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    ;(window as unknown as { __summit: unknown }).__summit = {
      ground: getHeight(PORTRAIT.x, PORTRAIT.z),
      portraitY: getHeight(PORTRAIT.x, PORTRAIT.z) + PORTRAIT.nailY - 0.6,
      spots: spots.map((s) => ({ id: s.social.id, x: s.x, y: s.y, z: s.z })),
    }
  }
  return (
    <group>
      {spots.map((s) => (
        <Pedestal key={s.social.id} spot={s} />
      ))}
      <Portrait />
      <ShrineLight />
      <SummitInteract spots={spots} />
      {/* bloom markers */}
      {spots.map((s) => (
        <InteractMarker
          key={s.social.id}
          id={`social-${s.social.id}`}
          x={s.x}
          y={s.y + PEDESTAL_HEIGHT + 1.15}
          z={s.z}
          label={socialLabel(t, s.social.id)}
          hint={socialHint(t, s.social.id, s.social.hint)}
          showDist={6}
        />
      ))}
      <InteractMarker
        id="portrait"
        x={PORTRAIT.x}
        y={getHeight(PORTRAIT.x, PORTRAIT.z) + PORTRAIT.nailY - PORTRAIT.height - 0.55}
        z={PORTRAIT.z + 0.2}
        label={t('marker.about.label')}
        hint={IS_TOUCH ? t('marker.about.hint.touch') : t('marker.about.hint.desktop')}
      />
    </group>
  )
}

useGLTF.preload('/models/pedestal.glb')
