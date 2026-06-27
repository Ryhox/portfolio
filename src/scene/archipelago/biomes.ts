// ---------------------------------------------------------------------------
// THEMES — the catalog of island "groups" for the archipelago. Every stargazer
// rolls (all from a username hash, so it's permanent & needs no server):
//   1. a THEME  — which group/cluster they belong to. Each theme shares ONE look
//      family (its "thing in common"); rarer themes are prettier.
//   2. a VARIANT within that theme — a specific look inside the family.
//   3. a SIZE tier — how big the island is (bigger = rarer), decoupled from look.
// Variants parameterize the SAME terrain + placement systems the home island
// uses (a dome height, a vertex-colour palette, prop plans fed to sampleDisc),
// so a big variety of looks falls out of reusing one engine. Prop tints recolour
// the shared .glb kit per-instance — no new models needed.
// ---------------------------------------------------------------------------

import type { Zone } from '../terrain/terrain'

// Quaternius kit model names (same set the home island draws from).
const COMMON = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5']
const PINE = ['Pine_1', 'Pine_2', 'Pine_3']
const TWISTED = ['TwistedTree_1', 'TwistedTree_2', 'TwistedTree_3']
const DEAD = ['DeadTree_1', 'DeadTree_2', 'DeadTree_3', 'DeadTree_4', 'DeadTree_5']
const SAKURA = ['SakuraTree_1', 'SakuraTree_2', 'SakuraTree_3', 'SakuraTree_4', 'SakuraTree_5']
// Desert recolour kit (sandy grass, red rock, pale pebbles) — the desert biome.
const DESERT_GRASS = ['DesertGrass_Common_Short', 'DesertGrass_Common_Tall', 'DesertGrass_Wispy_Short', 'DesertGrass_Wispy_Tall']
const DESERT_ROCK = ['DesertRock_Medium_1', 'DesertRock_Medium_2', 'DesertRock_Medium_3']
const DESERT_PEBBLE = ['DesertPebble_Round_1', 'DesertPebble_Round_2', 'DesertPebble_Square_1', 'DesertPebble_Square_2']
// Snow recolour kit (frosted pines/trees, snowy rock & grass) — the Frostfell biome.
const SNOW_PINE = ['SnowPine_1', 'SnowPine_2', 'SnowPine_3']
const SNOW_TREE = ['SnowTree_1', 'SnowTree_2', 'SnowTree_3', 'SnowTree_4', 'SnowTree_5']
const SNOW_ROCK = ['SnowRock_Medium_1', 'SnowRock_Medium_2', 'SnowRock_Medium_3']
const SNOW_GRASS = ['SnowGrass_Common_Short', 'SnowGrass_Common_Tall', 'SnowGrass_Wispy_Short', 'SnowGrass_Wispy_Tall']
const BUSH = ['Bush_Common', 'Bush_Common_Flowers']
const GRASS = ['Grass_Common_Short', 'Grass_Common_Tall']
const FERN = ['Fern_1', 'Plant_1', 'Plant_7']
const CLOVER = ['Clover_1', 'Clover_2']
const FLOWER = ['Flower_3_Group', 'Flower_3_Single', 'Flower_4_Group', 'Flower_4_Single']
// Sakura blossom ground flowers — pink / purple / lavender, in clusters + singles.
const SAKURA_FLOWER = [
  'FlowerPink_Group', 'FlowerPink_Single',
  'FlowerPurple_Group', 'FlowerPurple_Single',
  'FlowerLavender_Group', 'FlowerLavender_Single',
]
const MUSH = ['Mushroom_Common', 'Mushroom_Laetiporus']
const ROCK = ['Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3']
const PEBBLE = ['Pebble_Round_1', 'Pebble_Round_2', 'Pebble_Square_1', 'Pebble_Square_2']

export type Tier = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

// One scatter pass within an island disc (mirrors the args of sampleDisc/variants).
export type PropPlan = {
  models: string[]
  count: number // base target within the island disc (area-scaled per island)
  targetH: number // model render height
  minScale?: number
  maxScale?: number
  zones?: Zone[] // default ['grass','sand']
  maxSlope?: number
  minDist?: number
  cast?: boolean
  recv?: boolean
  align?: boolean
  tilt?: number
  tint?: number // per-plan multiplicative recolour (overrides variant.propTint)
}

export type BiomePalette = {
  grassLo: number
  grassHi: number
  sand: number
  sandWet: number
  rock: number
  under: number
}

// A single LOOK (terrain colour + dome shape + props). Size is rolled separately.
export type Variant = {
  id: string
  name: string // shown on the luck card ("Sakura Grove")
  weight: number // relative odds within its theme
  heightScale: number // crown/dome height (m above water)
  detail: number // fbm bump amplitude
  palette: BiomePalette
  propTint?: number // island-wide prop recolour
  fog?: boolean
  glow?: boolean
  props: PropPlan[]
}

// A GROUP/cluster: one shared look family, picked by a weighted draw on the hash.
export type Theme = {
  id: string
  name: string // shown on the map and as the cluster label
  tier: Tier
  weight: number // relative odds of landing in this group (rarer = prettier)
  variants: Variant[]
}

// How big the island is — an independent weighted roll (bigger = rarer).
export type SizeTier = {
  id: string
  name: string // "Small island"
  weight: number
  rMin: number
  rMax: number
}

export const SIZE_TIERS: SizeTier[] = [
  { id: 'small', name: 'Small island', weight: 50, rMin: 8, rMax: 12 },
  { id: 'medium', name: 'Medium island', weight: 32, rMin: 12, rMax: 17 },
  { id: 'large', name: 'Large island', weight: 14, rMin: 17, rMax: 23 },
  { id: 'huge', name: 'Huge island', weight: 4, rMin: 23, rMax: 30 },
]

// Home-island reference greens, reused by the lush variants.
const LUSH: BiomePalette = {
  grassLo: 0x42822a,
  grassHi: 0x6fb43e,
  sand: 0xe9dca8,
  sandWet: 0xc3ad7c,
  rock: 0x80818a,
  under: 0x46604f,
}

export const THEMES: Theme[] = [
  // ── WILDWOOD REACH — the common woods (most stars land here) ─────────────
  {
    id: 'wildwood',
    name: 'Wildwood Reach',
    tier: 'common',
    weight: 34,
    variants: [
      {
        id: 'oakwood',
        name: 'Oakwood',
        weight: 65,
        heightScale: 3.0,
        detail: 0.9,
        palette: LUSH,
        props: [
          { models: COMMON, count: 10, targetH: 9, minScale: 0.85, maxScale: 1.3, minDist: 5, cast: true },
          { models: BUSH, count: 7, targetH: 1.3, minDist: 3, cast: true },
          { models: CLOVER, count: 150, targetH: 0.34 },
          { models: FERN, count: 40, targetH: 1.0 },
          { models: FLOWER, count: 70, targetH: 0.65 }, // a light scatter of wildflowers
          { models: GRASS, count: 420, targetH: 0.85, tilt: 0.32 },
        ],
      },
      {
        id: 'pinehaven',
        name: 'Pinehaven',
        weight: 35,
        heightScale: 4.2,
        detail: 1.1,
        palette: { grassLo: 0x35702f, grassHi: 0x5d9a44, sand: 0xd8cca0, sandWet: 0xb3a279, rock: 0x73787f, under: 0x3f5e50 },
        props: [
          { models: PINE, count: 14, targetH: 10, minScale: 0.85, maxScale: 1.35, minDist: 5, cast: true },
          { models: FERN, count: 60, targetH: 1.0 },
          { models: MUSH, count: 16, targetH: 0.55 },
          { models: FLOWER, count: 35, targetH: 0.65 }, // just a few flowers among the pines
          { models: GRASS, count: 380, targetH: 0.85, tilt: 0.32 },
        ],
      },
    ],
  },

  // ── BLEAKSHOAL KEYS — the common barrens: always gray stone, no grass ─────
  {
    id: 'bleakshoal',
    name: 'Bleakshoal Keys',
    tier: 'common',
    weight: 30,
    variants: [
      {
        id: 'greywaste',
        name: 'Greywaste',
        weight: 45,
        heightScale: 2.0,
        detail: 0.9,
        palette: { grassLo: 0x73756f, grassHi: 0x8c8e87, sand: 0x9b9a90, sandWet: 0x7c7b6f, rock: 0x7c7e84, under: 0x4a4d4c },
        propTint: 0x9a9a9a,
        props: [
          { models: ROCK, count: 5, targetH: 1.9, minScale: 0.9, maxScale: 1.7, minDist: 3, maxSlope: 0.65, cast: true, recv: true },
          { models: PEBBLE, count: 36, targetH: 0.4, zones: ['sand', 'grass'], align: true, maxSlope: 0.8, recv: true },
        ],
      },
      {
        id: 'stoneshoal',
        name: 'Stoneshoal',
        weight: 55,
        heightScale: 2.2,
        detail: 1.0,
        palette: { grassLo: 0x636870, grassHi: 0x838894, sand: 0x9d9d97, sandWet: 0x77776d, rock: 0x80818a, under: 0x44484c },
        props: [
          { models: ROCK, count: 9, targetH: 1.9, minScale: 0.9, maxScale: 1.9, minDist: 3, maxSlope: 0.65, zones: ['sand', 'grass'], cast: true, recv: true },
          { models: PEBBLE, count: 46, targetH: 0.4, zones: ['sand', 'grass'], align: true, maxSlope: 0.8, recv: true },
        ],
      },
    ],
  },

  // ── EMBER HOLLOW — uncommon autumn: red trees & dead groves ──────────────
  {
    id: 'ember_hollow',
    name: 'Ember Hollow',
    tier: 'uncommon',
    weight: 16,
    variants: [
      {
        id: 'emberwood',
        name: 'Emberwood',
        weight: 60,
        heightScale: 4.0,
        detail: 1.0,
        palette: { grassLo: 0x7e7a35, grassHi: 0xae9a44, sand: 0xe7d6a2, sandWet: 0xc4ad7e, rock: 0x8a8176, under: 0x5e5a3e },
        propTint: 0xffba6e,
        props: [
          // Red-leaf trees only (twisted autumn canopy), not tinted green commons.
          { models: TWISTED, count: 16, targetH: 9, minScale: 0.85, maxScale: 1.3, minDist: 5, cast: true },
          { models: BUSH, count: 6, targetH: 1.3, minDist: 3, cast: true, tint: 0xc0492c }, // red bushes
          { models: CLOVER, count: 200, targetH: 0.34 },
          { models: GRASS, count: 300, targetH: 0.85, tilt: 0.32 },
        ],
      },
      {
        id: 'hollowwood',
        name: 'Hollowwood',
        weight: 40,
        heightScale: 4.0,
        detail: 1.2,
        fog: true,
        palette: { grassLo: 0x3c463c, grassHi: 0x586253, sand: 0x8f8a76, sandWet: 0x6a6557, rock: 0x646a64, under: 0x33403c },
        propTint: 0xc28a72, // warm muted ember so the red canopy reads through the mist
        props: [
          // Red-leaf trees only (no bare dead trunks).
          { models: TWISTED, count: 14, targetH: 8.5, minScale: 0.85, maxScale: 1.3, minDist: 5, cast: true },
          { models: BUSH, count: 5, targetH: 1.3, minDist: 3, cast: true, tint: 0xb24a30 }, // red bushes
          { models: MUSH, count: 20, targetH: 0.6 },
          { models: FERN, count: 30, targetH: 1.0 },
          { models: GRASS, count: 150, targetH: 0.85, tilt: 0.3 },
        ],
      },
    ],
  },

  // ── FROSTFELL ISLES — uncommon cold: snow & frost pines ──────────────────
  {
    id: 'frostfell',
    name: 'Frostfell Isles',
    tier: 'uncommon',
    weight: 12,
    variants: [
      {
        id: 'snowdrift',
        name: 'Snowdrift',
        weight: 55,
        heightScale: 4.0,
        detail: 1.0,
        palette: { grassLo: 0xcdd9df, grassHi: 0xeef4f6, sand: 0xe2ecef, sandWet: 0xc6d4da, rock: 0x9aa6ad, under: 0x6f8288 },
        props: [
          // Real frosted snow models (no tint — the snow is in the textures).
          { models: SNOW_PINE, count: 8, targetH: 11, minScale: 0.9, maxScale: 1.3, minDist: 6, cast: true },
          { models: SNOW_TREE, count: 4, targetH: 9, minScale: 0.9, maxScale: 1.3, minDist: 5, cast: true },
          { models: SNOW_ROCK, count: 4, targetH: 1.9, minScale: 0.9, maxScale: 1.6, maxSlope: 0.6, cast: true, recv: true },
          { models: SNOW_GRASS, count: 70, targetH: 0.7, tilt: 0.22 },
        ],
      },
      {
        id: 'frostpine',
        name: 'Frostpine',
        weight: 45,
        heightScale: 6.0,
        detail: 1.3,
        palette: { grassLo: 0xb8c6cf, grassHi: 0xe2ebef, sand: 0xeaf1f4, sandWet: 0xcfdde2, rock: 0x9aa6ad, under: 0x6a7d83 },
        props: [
          { models: SNOW_PINE, count: 18, targetH: 12, minScale: 0.9, maxScale: 1.4, minDist: 5, cast: true },
          { models: SNOW_ROCK, count: 5, targetH: 1.9, minScale: 0.9, maxScale: 1.7, maxSlope: 0.6, cast: true, recv: true },
          { models: SNOW_GRASS, count: 120, targetH: 0.8, tilt: 0.25 },
        ],
      },
    ],
  },

  // ── BLOOMTIDE VALE — the rare, pretty one: nothing but cherry blossom ─────
  {
    id: 'bloomtide',
    name: 'Bloomtide Vale',
    tier: 'rare',
    weight: 6,
    variants: [
      {
        id: 'sakura',
        name: 'Sakura Grove',
        weight: 35,
        heightScale: 7.0,
        detail: 1.0,
        palette: { grassLo: 0x6f9e4c, grassHi: 0xa8cf7a, sand: 0xf0e0d0, sandWet: 0xcdb6a6, rock: 0x9a8b90, under: 0x4f6a55 },
        props: [
          // Real pink-blossom sakura trees (no tint — the blossom is in the texture).
          { models: SAKURA, count: 16, targetH: 9, minScale: 0.9, maxScale: 1.4, minDist: 5, cast: true },
          // Carpets of pink / purple / lavender blossom flowers — lots of them.
          { models: SAKURA_FLOWER, count: 520, targetH: 0.75 },
          { models: GRASS, count: 400, targetH: 0.9, tilt: 0.32 },
          { models: BUSH, count: 6, targetH: 1.3, minDist: 3, cast: true, tint: 0xffc0d4 },
        ],
      },
    ],
  },

  // ── SUNSCORCH REACH — the desert: sun-baked dunes & dead groves ──────────
  // (Replaces the old legendary "Gleaming". Desert is a plain biome, so it's an
  // everyday uncommon roll now, not a jackpot — flat, low islands.)
  {
    id: 'desert',
    name: 'Sunscorch Reach',
    tier: 'uncommon',
    weight: 14,
    variants: [
      {
        id: 'dunes',
        name: 'Sunscorch Dunes',
        weight: 60,
        heightScale: 2.0, // very flat — rolling sand, no hills
        detail: 0.7,
        palette: { grassLo: 0xc7b274, grassHi: 0xe6d28c, sand: 0xf0dd9a, sandWet: 0xd6bf83, rock: 0xb98c64, under: 0x9a7c52 },
        props: [
          // Bleached dead trees scattered across the sand.
          { models: DEAD, count: 8, targetH: 6, minScale: 0.85, maxScale: 1.25, minDist: 5, cast: true, zones: ['sand', 'grass'], tint: 0xddc69a },
          { models: DESERT_ROCK, count: 4, targetH: 1.3, minScale: 0.8, maxScale: 1.25, minDist: 3.5, maxSlope: 0.5, zones: ['sand', 'grass'], cast: true, recv: true },
          { models: DESERT_PEBBLE, count: 40, targetH: 0.4, zones: ['sand', 'grass'], align: true, maxSlope: 0.8, recv: true },
          { models: DESERT_GRASS, count: 120, targetH: 0.7, tilt: 0.28 },
        ],
      },
      {
        id: 'redrock',
        name: 'Redrock Mesa',
        weight: 40,
        heightScale: 2.6, // still flat, just a touch more relief than the dunes
        detail: 0.9,
        palette: { grassLo: 0xc2a667, grassHi: 0xdcc079, sand: 0xe9d196, sandWet: 0xcaa873, rock: 0xb06a48, under: 0x8a5c40 },
        props: [
          { models: DESERT_ROCK, count: 7, targetH: 1.5, minScale: 0.8, maxScale: 1.4, minDist: 3.5, maxSlope: 0.55, zones: ['sand', 'grass'], cast: true, recv: true },
          { models: DEAD, count: 6, targetH: 6, minDist: 5, cast: true, zones: ['sand', 'grass'], tint: 0xddc69a },
          { models: DESERT_PEBBLE, count: 50, targetH: 0.4, zones: ['sand', 'grass'], align: true, recv: true },
          { models: DESERT_GRASS, count: 70, targetH: 0.7, tilt: 0.28 },
        ],
      },
    ],
  },
]

export const THEME_TOTAL = THEMES.reduce((s, t) => s + t.weight, 0)
export const SIZE_TOTAL = SIZE_TIERS.reduce((s, t) => s + t.weight, 0)

// Weighted draw over any {weight} list — rng() returns 0..1. Bigger weight =
// picked more often, so the pretty rare groups are the jackpot.
export function pickWeighted<T extends { weight: number }>(list: T[], rng: () => number): T {
  const total = list.reduce((s, e) => s + e.weight, 0)
  let r = rng() * total
  for (const e of list) {
    r -= e.weight
    if (r <= 0) return e
  }
  return list[list.length - 1]
}
