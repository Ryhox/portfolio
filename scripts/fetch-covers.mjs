// Fetches every record's album cover once (from Apple's public lookup) and keeps it with the site,
// so the covers show from the first moment without the visitor's browser asking Apple for anything.
// Usage: node scripts/fetch-covers.mjs  (re-run after changing src/content/records.ts)
import fs from 'node:fs/promises';
import sharp from 'sharp';

const src = await fs.readFile('src/content/records.ts', 'utf8');
const ids = [...src.matchAll(/apple:\s*(\d+)/g)].map((m) => Number(m[1]));
const res = await fetch(`https://itunes.apple.com/lookup?id=${ids.join(',')}&country=us`);
const { results } = await res.json();
await fs.mkdir('public/covers', { recursive: true });
for (const id of ids) {
  const r = results.find((x) => x.trackId === id);
  if (!r?.artworkUrl100) {
    console.warn(`no cover for ${id}`);
    continue;
  }
  const url = r.artworkUrl100.replace('100x100bb', '600x600bb');
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  await sharp(buf).resize(360, 360).webp({ quality: 82 }).toFile(`public/covers/${id}.webp`);
  console.log(`public/covers/${id}.webp  ${r.trackName}`);
}
