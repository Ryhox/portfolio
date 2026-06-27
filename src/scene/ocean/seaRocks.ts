// ---------------------------------------------------------------------------
// Sea-stacks: rocks that poke out of the water near the isle. Defined once here
// so two systems stay in sync from a single list:
//   - waterMaterial.ts draws an animated foam ring hugging each rock's waterline
//   - OceanHorizon.tsx places the actual rock meshes at these spots
// Kept close enough (≲110u) that the foam reads through the haze. Farther,
// barely-visible silhouette islands live in OceanHorizon and need no foam.
// All sit outside the island (origin radius > shore ~73u).
// ---------------------------------------------------------------------------

export type SeaRock = { x: number; z: number; r: number; h: number }

// Removed at user request — no rocks sticking out of the water. Kept as an empty
// list so the water foam-ring loop + player collisions simply no-op. Repopulate
// to bring sea-stacks back.
export const SEA_ROCKS: SeaRock[] = []

// Max the water shader's foam-ring loop is unrolled for (GLSL const bound).
export const SEA_ROCK_MAX = 8
