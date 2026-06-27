import * as THREE from 'three'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { NATURE_MODELS } from '../natureManifest'
import { patchReveal } from './patchReveal'

// Loads the curated nature props once and caches them (Suspense-style). Each
// model is reduced to a list of {geometry, material} "parts" with transforms
// baked in and multi-material meshes (e.g. bark + leaves) split apart, so every
// part can be drawn with a single InstancedMesh.

export type Part = { geometry: THREE.BufferGeometry; material: THREE.Material }
export type LoadedModel = { parts: Part[]; size: THREE.Vector3; minY: number }
export type NatureMap = Record<string, LoadedModel>

const BASE = '/models/nature/'

// Shared "sky-rim" uniforms, updated once per frame by DayNight. A soft fresnel
// term tinted by the sky lets leaf/branch/rock edges catch the light and read as
// lush & slightly translucent rather than flat — the stylized look from the
// asset-pack previews. Sharing one uniform object across every nature material
// means a single per-frame write lights them all.
export const RIM = {
  color: { value: new THREE.Color(0xbfe3f5) },
  strength: { value: 0.0 },
  power: { value: 3.4 },
}

// Shared wind uniforms, updated once per frame by DayNight. Foliage vertices are
// swayed in the vertex shader, weighted by a baked per-vertex `aSway` (0 at the
// base, 1 at the tips), so grass blades and flowers bend at the top while tree
// canopies billow — the trunk bases stay planted. `*Flat` biases the shading
// normal toward "up" for a cohesive, non-splintered tone (harder on grass than
// on canopies). Every value is a uniform (not baked into source) so all foliage
// shares one shader program while keeping its own per-kind tuning.
export const WIND = {
  time: { value: 0 },
  dir: { value: new THREE.Vector2(1, 0.35).normalize() },
  // current overall wind strength 0..1 (drifts light→heavy over time; driven by
  // DayNight). Read by the audio bed and the falling leaves so everything swells
  // together.
  strength: { value: 0.4 },
  // World-space player position; foliage near it bends away (set per-frame by the
  // Player). Parked far off until the player spawns.
  player: { value: new THREE.Vector3(9999, 0, 9999) },
  // ground cover: grass, flowers, ferns, clover, bushes (set per-frame from strength)
  gAmp: { value: 0.08 },
  gSpeed: { value: 1.2 },
  gFlutter: { value: 0.03 },
  gFlat: { value: 0.82 },
  // tree canopies (leaves) (set per-frame from strength)
  cAmp: { value: 0.2 },
  cSpeed: { value: 0.8 },
  cFlutter: { value: 0.1 },
  cFlat: { value: 0.5 },
}

// Overall wind strength as a smooth, organic function of time. Layered waves at
// irrational frequencies keep it from repeating, but it's deliberately kept in a
// narrow cozy band — it always reads as a gentle breeze and only drifts SLIGHTLY
// (yet noticeably), never building into a strong gust.
export function windStrengthAt(timeSec: number): number {
  let w = 0.3
  w += 0.06 * Math.sin(timeSec * 0.035 + 1.3) // very slow weather drift
  w += 0.04 * Math.sin(timeSec * 0.19 + 4.1) // a new mood every ~33s
  w += 0.03 * Math.sin(timeSec * 0.42 + 0.7) // shorter gusts
  return w < 0.18 ? 0.18 : w > 0.4 ? 0.4 : w
}

let cache: NatureMap | null = null
let promise: Promise<NatureMap> | null = null
let failure: unknown = null

// MTLLoader hands us MeshPhongMaterials; remap them to MeshStandardMaterial so
// the props respond to the procedural sky environment (IBL) exactly like the
// terrain, with a flat, stylized, non-metallic surface. Deduped per source
// material so shared kit materials compile a single program.
const converted = new WeakMap<THREE.Material, THREE.Material>()

export function convertMaterial(src: THREE.Material): THREE.Material {
  const hit = converted.get(src)
  if (hit) return hit

  const p = src as THREE.MeshPhongMaterial & { alphaMap?: THREE.Texture | null }
  const std = new THREE.MeshStandardMaterial({
    name: p.name,
    color: p.color ? p.color.clone() : new THREE.Color(0xffffff),
    map: p.map ?? null,
    vertexColors: p.vertexColors,
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide,
  })
  if (p.emissive) std.emissive.copy(p.emissive)
  std.envMapIntensity = 0.4

  if (std.map) {
    // Palette-atlas textures (thin colour stripes beside a big white area).
    // Mipmapping averages the stripes into the white and washes the colours out
    // to pale straw — so keep them crisp with no mipmaps.
    std.map.colorSpace = THREE.SRGBColorSpace
    std.map.generateMipmaps = false
    std.map.minFilter = THREE.LinearFilter
    std.map.magFilter = THREE.LinearFilter
    std.map.needsUpdate = true
  }

  const name = p.name || ''
  const isLeaf = /leaf|leaves/i.test(name)
  const foliage = !!p.alphaMap || isLeaf || /grass|flower|fern|bush|clover|plant|petal/i.test(name)
  // 'canopy' = tree leaves, 'ground' = grass/flowers/etc, null = solid (trunk/rock)
  const kind: 'canopy' | 'ground' | null = foliage ? (isLeaf ? 'canopy' : 'ground') : null
  std.userData.windKind = kind

  if (foliage) {
    // Alpha-cutout cards. The alpha lives in the diffuse (_C) texture's alpha
    // channel, so rely on map.a + alphaTest.
    std.alphaTest = 0.5
    std.transparent = false
    std.depthWrite = true

    const canopy = kind === 'canopy'
    std.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = WIND.time
      shader.uniforms.uWindDir = WIND.dir
      shader.uniforms.uWindAmp = canopy ? WIND.cAmp : WIND.gAmp
      shader.uniforms.uWindSpeed = canopy ? WIND.cSpeed : WIND.gSpeed
      shader.uniforms.uWindFlutter = canopy ? WIND.cFlutter : WIND.gFlutter
      shader.uniforms.uFlatten = canopy ? WIND.cFlat : WIND.gFlat
      shader.uniforms.uPlayer = WIND.player
      // Ground cover gets strongly shoved aside within a generous radius so it's
      // obviously parting around you in first person; canopies only nudge.
      shader.uniforms.uPushRadius = { value: canopy ? 1.4 : 3.0 }
      shader.uniforms.uPushAmt = { value: canopy ? 0.2 : 1.3 }

      // Wind sway (vertex). Phase varies per instance (its world XZ) so the field
      // ripples rather than sways in lockstep; a slow gust swells the strength.
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          [
            '#include <common>',
            'attribute float aSway;',
            'uniform float uWindTime; uniform float uWindAmp; uniform float uWindSpeed;',
            'uniform float uWindFlutter; uniform vec2 uWindDir;',
            'uniform vec3 uPlayer; uniform float uPushRadius; uniform float uPushAmt;',
          ].join('\n'),
        )
        .replace(
          '#include <begin_vertex>',
          [
            '#include <begin_vertex>',
            '{',
            '#ifdef USE_INSTANCING',
            '  vec3 _iw = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;',
            '#else',
            '  vec3 _iw = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;',
            '#endif',
            '  float _ph = _iw.x * 0.18 + _iw.z * 0.15 + uWindTime * uWindSpeed;',
            '  float _gust = 0.7 + 0.3 * sin(uWindTime * 0.33 + _iw.x * 0.05 + _iw.z * 0.04);',
            '  float _s = (sin(_ph) + 0.5 * sin(_ph * 2.3 + 1.3)) * _gust;',
            '  transformed.x += _s * uWindAmp * aSway * uWindDir.x;',
            '  transformed.z += _s * uWindAmp * aSway * uWindDir.y;',
            '  float _fl = sin(uWindTime * 7.0 + position.x * 5.0 + position.y * 3.0);',
            '  transformed.x += _fl * uWindFlutter * aSway;',
            '  transformed.z += _fl * uWindFlutter * aSway * 0.6;',
            // Player push: bend the tips away from the player when they walk through.
            '  vec2 _toP = _iw.xz - uPlayer.xz;',
            '  float _pd = length(_toP);',
            '  float _pf = 1.0 - clamp(_pd / uPushRadius, 0.0, 1.0);',
            '  _pf *= _pf;',
            '  vec2 _pdir = _pd > 0.001 ? _toP / _pd : vec2(0.0);',
            '  transformed.x += _pdir.x * _pf * uPushAmt * aSway;',
            '  transformed.z += _pdir.y * _pf * uPushAmt * aSway;',
            '}',
          ].join('\n'),
        )

      // Cohesive tone (fragment): bias the shading normal toward up so the alpha
      // cards don't splinter into a dozen different greens. Amount is a uniform.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uFlatten;')
        .replace(
          '#include <normal_fragment_begin>',
          [
            '#include <normal_fragment_begin>',
            'vec3 _upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);',
            'normal = normalize(mix(normal, _upView, uFlatten));',
          ].join('\n'),
        )
    }
  } else {
    // Subtle sky-rim on solid props only (trunks, rocks, mushrooms): a soft
    // fresnel edge that catches the light like the backlit bark in the previews.
    std.onBeforeCompile = (shader) => {
      shader.uniforms.uRimColor = RIM.color
      shader.uniforms.uRimStrength = RIM.strength
      shader.uniforms.uRimPower = RIM.power
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uRimPower;',
        )
        .replace(
          '#include <opaque_fragment>',
          [
            'float _rimF = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPower);',
            'outgoingLight += uRimColor * (_rimF * uRimStrength);',
            '#include <opaque_fragment>',
          ].join('\n'),
        )
    }
  }

  patchReveal(std)
  converted.set(src, std)
  return std
}

function splitByGroups(geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]): Part[] {
  const pos = geometry.getAttribute('position')
  const groups =
    geometry.groups && geometry.groups.length
      ? geometry.groups
      : [{ start: 0, count: pos.count, materialIndex: 0 }]
  const keys = ['position', 'normal', 'uv'] as const
  const parts: Part[] = []
  for (const g of groups) {
    const mat = Array.isArray(material) ? material[g.materialIndex ?? 0] : material
    const sub = new THREE.BufferGeometry()
    for (const k of keys) {
      const attr = geometry.getAttribute(k) as THREE.BufferAttribute | undefined
      if (!attr) continue
      const arr = (attr.array as Float32Array).slice(g.start * attr.itemSize, (g.start + g.count) * attr.itemSize)
      sub.setAttribute(k, new THREE.BufferAttribute(arr, attr.itemSize))
    }
    if (!sub.getAttribute('normal')) sub.computeVertexNormals()
    sub.computeBoundingBox()
    parts.push({ geometry: sub, material: mat })
  }
  return parts
}

// Per-vertex wind weight from normalized local height (0 base → 1 top), eased so
// the base stays stiff. Read by the wind vertex shader as the `aSway` attribute.
export function addSway(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute
  if (!geo.boundingBox) geo.computeBoundingBox()
  const minY = geo.boundingBox!.min.y
  const h = geo.boundingBox!.max.y - minY || 1
  const sway = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    const yn = Math.max(0, (pos.getY(i) - minY) / h)
    sway[i] = Math.pow(yn, 1.4)
  }
  geo.setAttribute('aSway', new THREE.BufferAttribute(sway, 1))
}

async function loadOne(name: string): Promise<LoadedModel> {
  const mtlLoader = new MTLLoader()
  mtlLoader.setPath(BASE)
  mtlLoader.setResourcePath(BASE)
  const materials = await mtlLoader.loadAsync(`${name}.mtl`)
  materials.preload()

  const objLoader = new OBJLoader()
  objLoader.setMaterials(materials)
  objLoader.setPath(BASE)
  const group = await objLoader.loadAsync(`${name}.obj`)
  group.updateMatrixWorld(true)

  const parts: Part[] = []
  group.traverse((child) => {
    const mesh = child as THREE.Mesh
    if (!mesh.isMesh) return
    const geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)
    const mats = mesh.material
    const conv = Array.isArray(mats) ? mats.map(convertMaterial) : convertMaterial(mats)
    parts.push(...splitByGroups(geo, conv))
  })

  // Bake the per-vertex sway weight for any wind-animated (foliage) part: 0 at
  // the model's base, ramping to 1 at the top, so the wind shader bends tips and
  // canopies while keeping bases planted.
  for (const part of parts) {
    if (!part.material.userData?.windKind) continue
    addSway(part.geometry)
  }

  const box = new THREE.Box3()
  for (const p of parts) box.union(p.geometry.boundingBox!)
  const size = new THREE.Vector3()
  box.getSize(size)
  return { parts, size, minY: box.min.y }
}

async function loadAll(): Promise<NatureMap> {
  const map: NatureMap = {}
  await Promise.all(
    NATURE_MODELS.map(async (n) => {
      try {
        map[n] = await loadOne(n)
      } catch (e) {
        console.warn('[nature] failed to load', n, e)
      }
    }),
  )
  return map
}

export function useNature(): NatureMap {
  if (cache) return cache
  if (failure) throw failure
  if (!promise) {
    promise = loadAll()
      .then((m) => (cache = m))
      .catch((e) => {
        failure = e
        throw e
      })
  }
  throw promise
}
