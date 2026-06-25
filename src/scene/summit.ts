// ---------------------------------------------------------------------------
// THE SUMMIT — what crowns the Heartwood hill: a hanging portrait of the maker
// nailed to the great tree (opens the "About me" panel) and a ring of stone
// pedestals around it, each topped with a 3D social logo you can walk up to and
// press E to open. Shared by Summit.tsx (render + interaction) and placement.ts
// (so the pedestals become solid colliders you bump into).
// ---------------------------------------------------------------------------
import { HEART, SOCIAL_ARC } from './layout'
import { getHeight } from './terrain'

export type SocialKind = 'url' | 'mailto' | 'copy'
export type SocialId = 'github' | 'email' | 'discord'

export type SocialDef = {
  id: SocialId
  label: string
  // what pressing E does: open a URL, open a mail client, or copy a handle.
  kind: SocialKind
  // url/mailto → the link; copy → the text dropped on the clipboard.
  value: string
  // a short line shown in the bloom marker under the label.
  hint: string
  color: number // tint for the procedural logo (the envelope)
}

// NOTE: set your real Discord here. `copy` drops the username on the clipboard
// when you press E; switch kind→'url' + a https://discord.gg/… invite if you'd
// rather it open a server.
export const DISCORD: { kind: SocialKind; value: string } = {
  kind: 'copy',
  value: 'ryhox', // ← TODO: your Discord username (or an invite link with kind:'url')
}

// The three pedestals curve in a gentle arc on the EAST (right) side of the
// Heartwood, on the flat dais beside it: you climb the path, and just before the
// tree a branch peels off to the right out to the socials. `slot` is the position
// along the arc (-1, 0, +1); GitHub sits in the middle. `model` picks the 3D piece
// on top.
export type LogoModel = 'github' | 'discord' | 'envelope'
export const SOCIALS: (SocialDef & { slot: number; model: LogoModel })[] = [
  { id: 'email', label: 'Email', kind: 'mailto', value: 'mailto:emanuelpfeifer1@gmail.com', hint: 'emanuelpfeifer1@gmail.com', slot: -1, model: 'envelope', color: 0xf3c969 },
  { id: 'github', label: 'GitHub', kind: 'url', value: 'https://github.com/ryhox', hint: 'github.com/ryhox', slot: 0, model: 'github', color: 0xf2efe6 },
  { id: 'discord', label: 'Discord', kind: DISCORD.kind, value: DISCORD.value, hint: DISCORD.kind === 'copy' ? 'press E to copy' : 'discord', slot: 1, model: 'discord', color: 0x8c9eff },
]

// World-space target height for the pedestal model (auto-scaled from its bbox).
export const PEDESTAL_HEIGHT = 0.95
// The pedestals stand in a true HALF-CIRCLE whose mouth opens WEST, back toward the
// climber: the centre pedestal sits at the far (east) point of the arc and the two
// outer ones curl forward to either side, so you walk up the branch straight into
// the cup. ARC_FOCUS is the centre of that circle (a little west of the dais
// centre); each pedestal is ARC_R out from it, fanned by ±ARC_SPREAD.
const ARC_R = 3.2
const ARC_SPREAD = (52 * Math.PI) / 180
const ARC_FOCUS = { x: SOCIAL_ARC.x - 1.6, z: SOCIAL_ARC.z }
// Radius the player collides with around each pedestal base.
export const PEDESTAL_COLLIDER_R = 0.55

// Centre of the clearing — used to park the fill light over it.
export const ARC_CENTER = { x: SOCIAL_ARC.x, z: SOCIAL_ARC.z }

export type PedestalSpot = {
  social: (typeof SOCIALS)[number]
  x: number
  z: number
  y: number // ground height at the base
  faceY: number // Y rotation so the logo faces west, back toward the climber
}

// Resolve each social to a world spot on the half-circle. `slot` (-1/0/+1) is the
// angle around ARC_FOCUS (0 = due east, the far point); the outer two curl forward
// to the sides. Each logo faces back toward ARC_FOCUS (west) so you read it head-on
// walking up the branch into the cup.
export function pedestalSpots(): PedestalSpot[] {
  return SOCIALS.map((social) => {
    const ang = social.slot * ARC_SPREAD // 0 = due east (far point of the arc)
    const x = ARC_FOCUS.x + Math.cos(ang) * ARC_R
    const z = ARC_FOCUS.z + Math.sin(ang) * ARC_R
    return { social, x, z, y: getHeight(x, z), faceY: Math.atan2(ARC_FOCUS.x - x, ARC_FOCUS.z - z) }
  })
}

// The portrait nailed to the Heartwood trunk, facing the climb (south). It hangs
// from a nail at the TOP (which touches the bark) and the frame dangles below,
// swaying a hair in the wind. `nailY` is the nail height above local ground.
export const PORTRAIT = {
  x: HEART.x - 0.25, // a touch left of the trunk centre
  z: HEART.z + 0.88, // proud of the bark; nail still bites in
  nailY: 2.5, // height of the nail (top contact point) above the ground
  yaw: -0.12, // turn to follow the trunk's twist
  tilt: 0, // hang straight down flush against the trunk
  width: 0.78,
  height: 1.0, // portrait orientation (the photo is taller than wide)
  // Your photo. It currently lives in public/models/me.jpg; the others are
  // fallbacks so dropping it at the public root works too.
  textures: ['/models/me.jpg', '/me.jpg', '/me.png', '/me.jpeg', '/me.webp'],
  range: 3.6, // walk within this of the trunk to read it
}

// Colliders for the player (pedestals are solid; the tree is already a collider).
export function summitColliders(): { x: number; z: number; r: number }[] {
  return pedestalSpots().map((s) => ({ x: s.x, z: s.z, r: PEDESTAL_COLLIDER_R }))
}
