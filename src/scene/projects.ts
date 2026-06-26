// The projects pinned to the message board on the west path. Each one is drawn onto
// a wide fluttering paper (MessageBoard.tsx) — a title, a short description and an
// image on the side; the Source / Live-preview buttons live in the ◀ ▶ control bar
// (ui/ProjectsBoard.tsx). Edit freely: the board, papers, counter and buttons all
// read from this list, so adding an entry needs no other change.
//
// Images live in public/projects/<name>.png and are referenced as /projects/<name>.png.
// `live` is optional — add a URL once a project has a hosted preview.
//
// The description is localized: `descKey` points at an i18n string (see src/i18n/en.ts)
// rather than living here, so MessageBoard re-paints it in the chosen language. The
// title (`name`), `meta` tech tags and URLs are proper nouns and stay as-is.
import type { StringKey } from '../i18n'

export type Project = {
  name: string
  meta?: string
  descKey: StringKey // i18n key for the short description
  image?: string // optional thumbnail shown on the side (a public/ path)
  source?: string // "Source" button URL
  live?: string // "Live preview" button URL
}

export const PROJECTS: Project[] = [
  {
    name: 'Portfolio',
    meta: 'React Three Fiber · three.js',
    descKey: 'project.portfolio.desc',
    image: '/projects/portfolio.png',
    source: 'https://github.com/Ryhox/portfolio',
  },
  {
    name: 'Pokyh',
    meta: 'Frontend · TypeScript',
    descKey: 'project.pokyh.desc',
    image: '/projects/pokyh.png',
    source: 'https://github.com/bedchem/pokyh-frontend',
    live: 'https://pokyh.com',
  },
  {
    name: 'Wieland-AI',
    meta: 'AI · TypeScript',
    descKey: 'project.wieland.desc',
    image: '/projects/wieland.png',
    source: 'https://github.com/Ryhox/Wieland-AI',
    live: 'https://ai.ryhox.dev',
  },
  {
    name: 'Minesweeper',
    meta: 'TypeScript · Web',
    descKey: 'project.minesweeper.desc',
    image: '/projects/minesweeper.png',
    source: 'https://github.com/Ryhox/minesweeper.ryhox.dev',
    live: 'https://minesweeper.ryhox.dev',
  },
]
