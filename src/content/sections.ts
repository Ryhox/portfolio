/** Chapters of the home page, in scroll order. Drives the odometer, the index menu and anchor links. */
export const chapters = [
  { id: 'top', no: '00', title: 'Ignition', label: 'The Lumen 64' },
  { id: 'maker', no: '01', title: 'The Maker', label: 'About Ryhox, and the trades' },
  { id: 'works', no: '02', title: 'The Works', label: 'Projects, on a working machine' },
  { id: 'contact', no: '03', title: 'Say Hi', label: 'Contact' },
] as const;

export type ChapterId = (typeof chapters)[number]['id'];

/**
 * The bar at the top: the page's parts by what they are, pointing at their sections. (The radio is
 * not a part of the page: it is the record turning in the corner.)
 */
export const navItems: { id: string; chapter: ChapterId; label: string; note: string }[] = [
  { id: 'about', chapter: 'maker', label: 'About me', note: 'The portrait and the five trades' },
  { id: 'projects', chapter: 'works', label: 'Projects', note: 'Five works on a working machine' },
  { id: 'contact', chapter: 'contact', label: 'Contact', note: 'Mail, GitHub, Discord' },
];
