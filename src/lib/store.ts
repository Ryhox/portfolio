import { create } from 'zustand';
import type { ChapterId } from '@/content/sections';

export type BootStage = 'boot' | 'ignite' | 'intro' | 'ready';

type AppState = {
  /** Boot overlay → ignition flash → camera pull-back → interactive. */
  stage: BootStage;
  /** 0..1 real asset loading progress. */
  progress: number;
  /** WebGL has compiled and presented its first frames. */
  glReady: boolean;
  /** The Lumen 64 is loaded and its shaders are compiled: the camera may leave the tube. */
  benchReady: boolean;
  /** Every model loaded, uploaded and compiled: the counter may reach 100. */
  allReady: boolean;
  sound: boolean;
  menuOpen: boolean;
  /** the view has swung across to the radio (see lib/radio) */
  radio: boolean;
  chapter: ChapterId;
  /** CRT channel change in progress (route transitions). */
  switching: boolean;
  /** Record currently on the Resonance platter, and transport state. */
  record: number;
  transport: 'standby' | 'play' | 'pause' | 'stop';
  /** A record waiting for the visitor to allow music from Apple (-1 = not asking). */
  askMusic: number;

  setStage: (s: BootStage) => void;
  setProgress: (p: number) => void;
  setGlReady: (v: boolean) => void;
  setBenchReady: (v: boolean) => void;
  setAllReady: (v: boolean) => void;
  setSound: (v: boolean) => void;
  setMenuOpen: (v: boolean) => void;
  setRadio: (v: boolean) => void;
  setChapter: (c: ChapterId) => void;
  setSwitching: (v: boolean) => void;
  setRecord: (i: number) => void;
  setTransport: (t: AppState['transport']) => void;
  setAskMusic: (i: number) => void;
};

export const useApp = create<AppState>((set) => ({
  stage: 'boot',
  progress: 0,
  glReady: false,
  benchReady: false,
  allReady: false,
  sound: false,
  menuOpen: false,
  radio: false,
  chapter: 'top',
  switching: false,
  record: 0,
  transport: 'standby',
  askMusic: -1,

  setStage: (stage) => set({ stage }),
  setProgress: (progress) => set((s) => ({ progress: Math.max(s.progress, progress) })),
  setGlReady: (glReady) => set({ glReady }),
  setBenchReady: (benchReady) => set({ benchReady }),
  setAllReady: (allReady) => set({ allReady }),
  setSound: (sound) => set({ sound }),
  setMenuOpen: (menuOpen) => set({ menuOpen }),
  setRadio: (radio) => set({ radio }),
  setChapter: (chapter) => set({ chapter }),
  setSwitching: (switching) => set({ switching }),
  setRecord: (record) => set({ record }),
  setTransport: (transport) => set({ transport }),
  setAskMusic: (askMusic) => set({ askMusic }),
}));
