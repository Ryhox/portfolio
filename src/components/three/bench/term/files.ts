import { projects } from '@/content/projects';
import { records } from '@/content/records';
import { site } from '@/content/site';
import { dir, file, type DirNode, type Node } from './fs';
import type { Shell } from './shell';

export const GAMES = ['snake', 'tetris', '2048', 'pong', 'mines', 'ttt', 'hangman', 'guess'];

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** The machine's filesystem as it is on a fresh boot. */
export function buildFs(sh: Shell): DirNode {
  const projectFiles: Record<string, Node> = {};
  for (const p of projects) {
    projectFiles[`${p.slug}.url`] = file(
      [
        p.title.toUpperCase(),
        p.kicker,
        '',
        p.description,
        '',
        `stack   ${p.stack.join(', ')}`,
        `demo    ${p.links.demo ?? 'none'}`,
        `source  ${p.links.source}`,
      ].join('\n'),
      `link:${p.links.demo ?? p.links.source}`,
    );
  }

  const music: Record<string, Node> = {};
  records.forEach((r, i) => {
    music[`${String(i + 1).padStart(2, '0')}-${slugify(r.title)}.rec`] = file(
      `${r.title}\n${r.artist} · ${r.album}\n30-second preview from Apple Music. run this file to play it.`,
      `music:${i + 1}`,
    );
  });

  const games: Record<string, Node> = {};
  for (const g of GAMES) games[g] = file(binary(g), `cmd:${g}`, 'x');

  const bin: Record<string, Node> = {};
  for (const c of Object.keys(sh.commands).sort()) if (/^[a-z0-9]/.test(c)) bin[c] = file(binary(c), `cmd:${c}`, 'x');

  const root = dir(
    {
      bin: dir(bin, true),
      dev: dir(
        {
          null: file(''),
          zero: file(''),
          random: file(() => noise(6)),
          tty: file(''),
        },
        true,
      ),
      etc: dir(
        {
          motd: file('welcome to ryhox os 3.14 (lumen 64 spark). type help.'),
          hostname: file('lumen'),
          'os-release': file(
            ['NAME="Ryhox OS"', 'VERSION="3.14 (Brass)"', 'ID=ryhox', 'PRETTY_NAME="Ryhox OS 3.14"', `HOME_URL="${site.url}"`].join('\n'),
          ),
          passwd: file(['root:x:0:0:root:/root:/bin/bash', `ryhox:x:1000:1000:Ryhox:/home/ryhox:/bin/bash`, 'kettle:x:418:418:teapot:/dev/null:/bin/false'].join('\n')),
          shells: file('/bin/bash'),
          issue: file('Ryhox OS 3.14 \\n \\l'),
        },
        true,
      ),
      home: dir(
        {
          ryhox: dir({
            'readme.txt': file(
              [
                'RYHOX',
                'web developer and three.js engineer',
                '',
                'i build playful, tactile things for the web: worlds you',
                'can explore, apps people open every day, and machines',
                'like this one.',
                '',
                `mail     ${site.email}`,
                `github   ${site.socials[0].href}`,
                `discord  ${site.discord}`,
                '',
                'try: ls projects, neofetch, games, sl, cowsay hi',
              ].join('\n'),
            ),
            projects: dir(projectFiles),
            music: dir(music),
            games: dir(games),
            notes: dir({
              'todo.txt': file('- make the cogs turn\n- make the cogs turn slower\n- make the cogs turn exactly right\n- a real terminal on the landing page'),
              'ideas.md': file('# ideas\n\n- a film strip that never ends\n- a radio that plays real records\n- a laptop you can type into'),
            }),
            'hello.sh': file(
              ['#!/bin/bash', '# a tiny script. run it: ./hello.sh', 'echo "hello from $HOSTNAME, $USER."', 'echo "it is $(date +%H:%M) and the cogs are turning."'].join('\n'),
              undefined,
              'x',
            ),
            '.bashrc': file(['# ~/.bashrc', "alias ll='ls -l'", "alias la='ls -a'", 'export EDITOR=nano', '', '# the kettle is always on'].join('\n')),
            '.secret': file('the kettle is always on. (so is the sudo password.)'),
          }),
        },
        true,
      ),
      root: dir({ 'flag.txt': file('you got in. the kettle says hi.') }, true),
      scrap: dir(
        {
          'portfolio-v1.zip': file('recycled. most of it is in the site you are looking at.'),
          'important!.css': file('.everything { color: red !important; }\n/* never again */'),
          'final-final-v3.psd': file('there was no v4. there was a v3-final-2.'),
        },
        true,
      ),
      tmp: dir({}),
      usr: dir({ share: dir({ games: dir({ 'README': file('the games live in ~/games. or just type: games') }, true) }, true) }, true),
      var: dir({ log: dir({ 'boot.log': file(() => bootLog()) }, true) }, true),
      proc: dir(
        {
          cpuinfo: file(['processor   : 0', 'vendor_id   : BabbageWorks', 'model name  : Analytical Engine Mk. II', 'cpu MHz     : 0.000001', 'cogs        : 64', 'flags       : brass steam escapement'].join('\n')),
          meminfo: file(() => {
            const used = 41 + Math.floor(Math.random() * 6);
            return [`MemTotal:       64 kB`, `MemFree:        ${64 - used} kB`, `MemAvailable:   ${64 - used + 3} kB`, `Punchcards:     1200`].join('\n');
          }),
          uptime: file(() => `${((Date.now() - sh.started) / 1000).toFixed(2)} 64.00`),
          version: file('Ryhox OS 3.14.1864 (brassh@lumen) (babbage-cc 1.0) #1 SMP'),
          loadavg: file('0.64 0.64 0.64 1/4 6400'),
        },
        true,
      ),
    },
    true,
  );
  (root.children.proc as DirNode).virtual = true;
  (root.children.dev as DirNode).virtual = true;
  (root.children.bin as DirNode).virtual = true;
  return root;
}

function bootLog() {
  const t = new Date();
  const stamp = (s: number) => `[${s.toFixed(6).padStart(12)}]`;
  return [
    `${stamp(0)} ryhox os 3.14 booting on ${t.toUTCString()}`,
    `${stamp(0.000064)} escapement: 64 cogs found`,
    `${stamp(0.013)} tube: warming the phosphor`,
    `${stamp(0.52)} resonance: the cabinet is in the corner`,
    `${stamp(0.64)} kettle: on`,
    `${stamp(1.2)} all cogs nominal`,
  ].join('\n');
}

/** What cat shows of a program: the start of a binary, as bytes that are not text. */
function binary(name: string) {
  return `\u007fELF\u0002\u0001\u0001  >  @  ${name}  ${'¤±§¶þ¿ßð'.repeat(3)}\nbinary file. run it instead: ${name}`;
}

export function noise(rows: number, cols = 48) {
  const chars = '!"#$%&()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~¤±§¶þ¿ßðæø';
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => chars[Math.floor(Math.random() * chars.length)]).join('')).join('\n');
}
