// The projects pinned to the message board on the west path. Each one is drawn onto
// a wide fluttering paper (MessageBoard.tsx) — a title, a short description and an
// image on the side; the Source / Live-preview buttons live in the ◀ ▶ control bar
// (ui/ProjectsBoard.tsx). Edit freely: the board, papers, counter and buttons all
// read from this list, so adding an entry needs no other change.
//
// Images live in public/projects/<name>.png and are referenced as /projects/<name>.png.
// `live` is optional — add a URL once a project has a hosted preview.

export type Project = {
  name: string
  meta?: string
  desc: string[] // short description, a few lines
  image?: string // optional thumbnail shown on the side (a public/ path)
  source?: string // "Source" button URL
  live?: string // "Live preview" button URL
}

export const PROJECTS: Project[] = [
  {
    name: 'Portfolio',
    meta: 'React Three Fiber · three.js',
    desc: [
      'This cozy island itself — an interactive',
      '3D portfolio with a day/night cycle, a',
      'sailable boat and a hilltop shrine.',
      'Built from scratch, no engine.',
    ],
    image: '/projects/portfolio.png',
    source: 'https://github.com/Ryhox/portfolio',
  },
  {
    name: 'Pokyh',
    meta: 'Frontend · TypeScript',
    desc: [
      'The frontend for Pokyh — a clean,',
      'modern web app interface built with',
      'a component-driven TypeScript stack.',
    ],
    image: '/projects/pokyh.png',
    source: 'https://github.com/bedchem/pokyh-frontend',
    live: 'https://pokyh.com',
  },
  {
    name: 'Wieland-AI',
    meta: 'AI · TypeScript',
    desc: [
      'A personal AI assistant project —',
      'wiring up a language model into a',
      'helpful, conversational tool.',
    ],
    image: '/projects/wieland.png',
    source: 'https://github.com/Ryhox/Wieland-AI',
    live: 'https://ai.ryhox.dev',
  },
  {
    name: 'Minesweeper',
    meta: 'TypeScript · Web',
    desc: [
      'The classic Minesweeper, rebuilt for',
      'the web — quick, clean and playable',
      'right in the browser.',
    ],
    image: '/projects/minesweeper.png',
    source: 'https://github.com/Ryhox/minesweeper.ryhox.dev',
    live: 'https://minesweeper.ryhox.dev',
  },
]
