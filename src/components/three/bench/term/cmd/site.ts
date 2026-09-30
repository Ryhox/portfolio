import { projects } from '@/content/projects';
import { site } from '@/content/site';
import type { Cmd } from '../shell';
import { ln, segs, type Line } from '../types';

/** The commands about this site: the works, the ways to say hi, the radio, the sound. */
export const siteCommands: Record<string, Cmd> = {
  projects: {
    group: 'site',
    desc: 'the works',
    run: () => [
      ...projects.map((p) => segs([`${p.index.padEnd(4)}`, 'dim'], [p.title.padEnd(20), 'hi'], [p.kicker])),
      ln(''),
      ln('each has a file: cat ~/projects/<name>.url, or open it.', 'dim'),
    ],
  },
  works: { group: 'site', desc: 'the works', hidden: true, run: (c) => siteCommands.projects.run(c) },
  contact: {
    group: 'site',
    desc: 'how to say hi',
    run: () => [
      segs(['mail      ', 'dim'], [site.email, 'hi']),
      ...site.socials.map((s) => segs([s.label.toLowerCase().padEnd(10), 'dim'], [s.href, 'hi'])),
      segs(['discord   ', 'dim'], [site.discord, 'hi']),
    ],
  },
  about: {
    group: 'site',
    desc: 'who built this',
    run: (c) => c.sh.exec('cat ~/readme.txt').lines,
  },
  music: {
    group: 'site',
    desc: 'the record player',
    usage: 'music [play [n] | pause | stop | next | prev | list]',
    run: (c) => {
      const r = c.host.music?.(c.args.join(' ') || 'play');
      return (r ?? 'the radio is the record turning in the corner.').split('\n').map((t) => ln(t, 'dim'));
    },
  },
  sound: {
    group: 'site',
    desc: 'the site sound',
    usage: 'sound [on | off]',
    run: (c) => {
      const on = c.args[0] === 'on' ? true : c.args[0] === 'off' ? false : undefined;
      const now = c.host.sound?.(on);
      return [ln(`sound ${now ? 'on' : 'off'}.`)];
    },
  },
  enter: {
    group: 'site',
    desc: 'go into the machine',
    run: (c) => {
      c.host.enter?.();
      return [ln('engaging the works...', 'dim')];
    },
  },
  start: {
    group: 'site',
    desc: 'go into the machine',
    hidden: true,
    run: (c) => (c.args[0]?.toLowerCase() === 'works' || !c.args.length ? siteCommands.enter.run(c) : c.sh.exec(`open ${c.args.join(' ')}`).lines) as Line[],
  },
  run: { group: 'site', desc: 'go into the machine', hidden: true, run: (c) => siteCommands.start.run(c) },
  go: { group: 'site', desc: 'go into the machine', hidden: true, run: (c) => siteCommands.enter.run(c) },
};
