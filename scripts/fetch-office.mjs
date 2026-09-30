// Fetches the office's CC0 furniture and surfaces from Poly Haven (https://polyhaven.com) into
// assets/source/polyhaven, at 1k: models as glTF (optimised later by `npm run models`), texture
// sets as JPG (re-encoded into public/textures/office by `node scripts/office-textures.mjs`).
// Usage: node scripts/fetch-office.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = 'assets/source/polyhaven';
const MODELS = [
  'vintage_grandfather_clock_01',
  'wooden_bookshelf_worn',
  'book_encyclopedia_set_01',
  'vintage_oil_lamp',
  'magnifying_glass_01',
  'dining_chair_02',
  'gallinera_chair',
];
const TEXTURES = ['decrepit_wallpaper', 'dark_paneled_wood', 'herringbone_parquet', 'dirty_carpet', 'plastered_wall_02'];

const get = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
};
const save = async (url, file) => {
  try {
    await fs.access(file);
    return;
  } catch {}
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, Buffer.from(await (await get(url)).arrayBuffer()));
};

for (const id of MODELS) {
  const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  const g = files.gltf?.['1k']?.gltf;
  if (!g) {
    console.log('no glTF for', id);
    continue;
  }
  const dir = path.join(OUT, id);
  await save(g.url, path.join(dir, `${id}.gltf`));
  for (const [rel, f] of Object.entries(g.include)) await save(f.url, path.join(dir, rel));
  console.log('model', id);
}
for (const id of TEXTURES) {
  const files = await (await get(`https://api.polyhaven.com/files/${id}`)).json();
  const dir = path.join(OUT, 'textures', id);
  for (const [key, name] of [
    ['Diffuse', 'diff'],
    ['nor_gl', 'nor'],
    ['arm', 'arm'],
  ]) {
    const f = files[key]?.['1k']?.jpg;
    if (f) await save(f.url, path.join(dir, `${name}.jpg`));
  }
  console.log('texture', id);
}
