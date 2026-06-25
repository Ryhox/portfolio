import { create } from 'zustand'
import type { Object3D } from 'three'

// Time of day is normalized 0..1:
//   0.00 = midnight   0.25 = sunrise   0.50 = noon   0.75 = sunset
//
// High-frequency animation reads `t` imperatively via useWorld.getState() inside
// useFrame (no React re-render). UI that needs to display the time subscribes
// through the hook as usual.
export type VolKey = 'master' | 'music' | 'waves' | 'wind' | 'ambient'
export type Quality = 'Low' | 'Medium' | 'High'
export const QUALITY_ORDER: Quality[] = ['Low', 'Medium', 'High']

// The little to-do list shown bottom-left. Each flag flips true the first time the
// player does the thing, and the entry gets crossed off. `projects` has no trigger
// yet (it's "coming soon"); `enjoy` is never crossed off — it's always the mood.
export type QuestId = 'about' | 'socials' | 'projects' | 'sail'
export type Quests = Record<QuestId, boolean>

export type WorldState = {
  t: number
  paused: boolean
  dayLengthSec: number
  loaded: boolean
  started: boolean
  muted: boolean
  menuOpen: boolean
  quality: Quality
  motionBlur: boolean       // temporal motion-blur post effect (Medium/High quality)
  motionBlurAmount: number  // 0..1 strength of the motion-blur trail
  invertX: boolean
  invertY: boolean
  volMaster: number
  volMusic: number
  volWaves: number
  volWind: number
  volAmbient: number
  sunMesh: Object3D | null
  introProgress: number  // 0–1, tracks asset loading for the ring fill
  introStep: number      // -1 idle | 0 loading complete | 1 clicked
  worldVisible: boolean  // true once the ring starts expanding → fade-in sky/water/particles
  boatMode: 'parked' | 'sailing' // whether the player is currently sailing the boat
  boardPrompt: boolean   // near the stranded boat → show the "press E" interact prompt
  mapId: 'home' | 'archipelago' // which world is mounted: the home island or the archipelago
  mapOpen: boolean       // the full-screen world map overlay is open (freezes the player)
  infoOpen: boolean      // the island rarity/info panel is open (toggled with I on an island)
  aboutOpen: boolean     // the "About me" panel is open (toggled with E at the Heartwood portrait)
  projectsOpen: boolean  // the projects message-board view is open (toggled with E at the west-path board)
  projectIndex: number   // which project paper is showing on the board (◀ ▶ to browse)
  sitting: boolean       // the player is sitting on the hilltop bench (E to sit / get up)
  quests: Quests         // to-do list progress (bottom-left checklist)
  setT: (t: number) => void
  setPaused: (p: boolean) => void
  togglePaused: () => void
  setDayLength: (s: number) => void
  setLoaded: (b: boolean) => void
  setStarted: (s: boolean) => void
  toggleMuted: () => void
  setSunMesh: (m: Object3D | null) => void
  setMenuOpen: (open: boolean) => void
  cycleQuality: () => void
  setMotionBlur: (v: boolean) => void
  toggleMotionBlur: () => void
  setMotionBlurAmount: (v: number) => void
  toggleInvert: (axis: 'x' | 'y') => void
  setVol: (key: VolKey, v: number) => void
  setIntroProgress: (p: number) => void
  setIntroStep: (s: number) => void
  setWorldVisible: (v: boolean) => void
  setBoatMode: (m: 'parked' | 'sailing') => void
  setBoardPrompt: (v: boolean) => void
  setMapId: (m: 'home' | 'archipelago') => void
  setMapOpen: (v: boolean) => void
  setInfoOpen: (v: boolean) => void
  toggleInfo: () => void
  setAboutOpen: (v: boolean) => void
  toggleAbout: () => void
  setProjectsOpen: (v: boolean) => void
  toggleProjects: () => void
  setProjectIndex: (i: number) => void
  setSitting: (v: boolean) => void
  toggleSitting: () => void
  completeQuest: (id: QuestId) => void
}

const wrap01 = (t: number) => ((t % 1) + 1) % 1

const VOL_KEY_MAP: Record<VolKey, keyof WorldState> = {
  master: 'volMaster', music: 'volMusic', waves: 'volWaves',
  wind: 'volWind', ambient: 'volAmbient',
}

export const useWorld = create<WorldState>((set) => ({
  t: 0.33,   // morning (~8am) — the cozy idle mood; cycle resumes after start
  paused: true, // time is frozen until the player enters the world
  dayLengthSec: 140,
  loaded: false,
  started: false,
  muted: false,
  menuOpen: false,
  quality: 'High',
  motionBlur: true,
  motionBlurAmount: 0.25,
  invertX: false,
  invertY: false,
  volMaster: 1,
  volMusic: 0.5,
  volWaves: 0.5,
  volWind: 0.5,
  volAmbient: 0.5,
  sunMesh: null,
  introProgress: 0,
  introStep: -1,
  worldVisible: false,
  boatMode: 'parked',
  boardPrompt: false,
  mapId: 'home',
  mapOpen: false,
  infoOpen: false,
  aboutOpen: false,
  projectsOpen: false,
  projectIndex: 0,
  sitting: false,
  quests: { about: false, socials: false, projects: false, sail: false },
  setT: (t) => set({ t: wrap01(t) }),
  setPaused: (paused) => set({ paused }),
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  setDayLength: (dayLengthSec) => set({ dayLengthSec }),
  setLoaded: (loaded) => set({ loaded }),
  setStarted: (started) => set({ started }),
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
  setSunMesh: (sunMesh) => set({ sunMesh }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  cycleQuality: () =>
    set((s) => ({
      quality: QUALITY_ORDER[(QUALITY_ORDER.indexOf(s.quality) + 1) % QUALITY_ORDER.length],
    })),
  setMotionBlur: (motionBlur) => set({ motionBlur }),
  toggleMotionBlur: () => set((s) => ({ motionBlur: !s.motionBlur })),
  setMotionBlurAmount: (motionBlurAmount) => set({ motionBlurAmount }),
  toggleInvert: (axis) =>
    set((s) => (axis === 'x' ? { invertX: !s.invertX } : { invertY: !s.invertY })),
  setVol: (key, v) => set({ [VOL_KEY_MAP[key]]: v } as Partial<WorldState>),
  setIntroProgress: (introProgress) => set({ introProgress }),
  setIntroStep: (introStep) => set({ introStep }),
  setWorldVisible: (worldVisible) => set({ worldVisible }),
  setBoatMode: (boatMode) => set({ boatMode }),
  setBoardPrompt: (boardPrompt) => set({ boardPrompt }),
  // Arriving in the archipelago crosses off "Set Sail" (you went to see the
  // other wanderers' isles).
  setMapId: (mapId) =>
    set((s) => ({ mapId, quests: mapId === 'archipelago' && !s.quests.sail ? { ...s.quests, sail: true } : s.quests })),
  setMapOpen: (mapOpen) => set({ mapOpen }),
  setInfoOpen: (infoOpen) => set({ infoOpen }),
  toggleInfo: () => set((s) => ({ infoOpen: !s.infoOpen })),
  // Opening the About panel crosses off "Who am I?".
  setAboutOpen: (aboutOpen) =>
    set((s) => ({ aboutOpen, quests: aboutOpen && !s.quests.about ? { ...s.quests, about: true } : s.quests })),
  toggleAbout: () =>
    set((s) => {
      const aboutOpen = !s.aboutOpen
      return { aboutOpen, quests: aboutOpen && !s.quests.about ? { ...s.quests, about: true } : s.quests }
    }),
  // Opening the Projects board crosses off "Projects".
  setProjectsOpen: (projectsOpen) =>
    set((s) => ({ projectsOpen, quests: projectsOpen && !s.quests.projects ? { ...s.quests, projects: true } : s.quests })),
  toggleProjects: () =>
    set((s) => {
      const projectsOpen = !s.projectsOpen
      return { projectsOpen, quests: projectsOpen && !s.quests.projects ? { ...s.quests, projects: true } : s.quests }
    }),
  setProjectIndex: (projectIndex) => set({ projectIndex }),
  setSitting: (sitting) => set({ sitting }),
  toggleSitting: () => set((s) => ({ sitting: !s.sitting })),
  completeQuest: (id) => set((s) => (s.quests[id] ? {} : { quests: { ...s.quests, [id]: true } })),
}))

// Mutable object GSAP can animate — drives the cinematic fly-in in Experience.tsx.
// startPos overrides the orbit position as the fly-in origin (set before animating progress).
export const FLY = {
  progress: 0,
  startPos: null as { x: number; y: number; z: number } | null,
}

// Dev convenience: lets the screenshot harness drive time/started from JS.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { useWorld: typeof useWorld }).useWorld = useWorld
}

// Human-readable phase label for the HUD.
export function phaseLabel(t: number): string {
  if (t < 0.22 || t >= 0.96) return 'Deep Night'
  if (t < 0.3) return 'Dawn'
  if (t < 0.45) return 'Morning'
  if (t < 0.55) return 'Midday'
  if (t < 0.7) return 'Afternoon'
  if (t < 0.78) return 'Sunset'
  if (t < 0.86) return 'Dusk'
  return 'Night'
}
