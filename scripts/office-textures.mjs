// Re-encodes the office's Poly Haven texture sets (fetched by scripts/fetch-office.mjs) for the web:
// WebP colour, normal and AO/roughness/metal maps in public/textures/office: colour at 1k where the
// camera comes close (walls, floor, panelling), everything else at 512.
// Usage: node scripts/office-textures.mjs
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = 'assets/source/polyhaven/textures';
const OUT = 'public/textures/office';
await fs.mkdir(OUT, { recursive: true });
for (const id of await fs.readdir(SRC)) {
  for (const map of ['diff', 'nor', 'arm']) {
    const src = path.join(SRC, id, `${map}.jpg`);
    try {
      await fs.access(src);
    } catch {
      continue;
    }
    const out = path.join(OUT, `${id}_${map}.webp`);
    const big = map === 'diff' && !['dirty_carpet', 'plastered_wall_02'].includes(id);
    const edge = big ? 1024 : 512;
    await sharp(src).resize(edge, edge, { fit: 'inside' }).webp({ quality: map === 'nor' ? 80 : 72 }).toFile(out);
    console.log(out, ((await fs.stat(out)).size / 1024).toFixed(0) + 'KB');
  }
}
