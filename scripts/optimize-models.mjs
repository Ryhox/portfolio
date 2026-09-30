// Optimises the raw Sketchfab exports in assets/source into web-ready GLBs in public/models.
// Run with `npm run models`.
//
// - geometry: welded, deduplicated, meshopt-compressed (quantised positions/normals/uvs)
// - textures: resized to what the scene can actually show, re-encoded as AVIF
// - anything the site replaces (the computer's baked screen) is removed before encoding
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { compactPrimitive, dedup, prune, resample, simplify, textureCompress, meshopt, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = 'assets/source';
const OUT = 'public/models';

/**
 * Keep the geometry of materials the site replaces (so it can still be measured) but drop their
 * textures, which prune then removes from the file.
 */
const stripTextures = (names) => (doc) => {
  for (const mat of doc.getRoot().listMaterials()) {
    if (!names.includes(mat.getName())) continue;
    mat.setBaseColorTexture(null);
    mat.setEmissiveTexture(null);
    mat.setMetallicRoughnessTexture(null);
    mat.setNormalTexture(null);
  }
};

/**
 * Keep only the connected pieces of a mesh whose bounds pass keep(min, max).
 * Used to lift the pocket watch off its baked, table-draped chain.
 */
const keepComponents = (keep) => (doc) => {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      const key = (i) => pos.getElement(i, []).map((x) => x.toFixed(4)).join(',');
      const parent = new Map();
      const find = (a) => {
        while (parent.get(a) !== a) {
          parent.set(a, parent.get(parent.get(a)));
          a = parent.get(a);
        }
        return a;
      };
      const keys = [];
      for (let i = 0; i < pos.getCount(); i++) {
        const k = key(i);
        keys.push(k);
        if (!parent.has(k)) parent.set(k, k);
      }
      for (let t = 0; t < idx.getCount(); t += 3) {
        const a = find(keys[idx.getScalar(t)]);
        const b = find(keys[idx.getScalar(t + 1)]);
        const c = find(keys[idx.getScalar(t + 2)]);
        parent.set(a, c);
        parent.set(b, c);
      }
      const bounds = new Map();
      for (let t = 0; t < idx.getCount(); t++) {
        const r = find(keys[idx.getScalar(t)]);
        const p = pos.getElement(idx.getScalar(t), []);
        const b = bounds.get(r) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        for (let d = 0; d < 3; d++) {
          b.min[d] = Math.min(b.min[d], p[d]);
          b.max[d] = Math.max(b.max[d], p[d]);
        }
        bounds.set(r, b);
      }
      const out = [];
      for (let t = 0; t < idx.getCount(); t += 3) {
        const b = bounds.get(find(keys[idx.getScalar(t)]));
        if (keep(b.min, b.max)) out.push(idx.getScalar(t), idx.getScalar(t + 1), idx.getScalar(t + 2));
      }
      idx.setArray(new Uint32Array(out));
      compactPrimitive(prim);
    }
  }
};

// tex: largest texture edge; simplify: meshopt error bound (a fraction of the model's size), set
// per model so nothing visible is lost where the camera goes close, and a lot where it never does
const MODELS = [
  { src: 'lumen_64_spark__computer.glb', out: 'computer.glb', tex: 1024, quality: 58, simplify: 0.0012, pre: [stripTextures(['image'])] },
  { src: 'lumen_resonance__audio_system.glb', out: 'resonance.glb', tex: 768, quality: 56, simplify: 0.0018 },
  // the projects' camera on the office desk: the flight ends inside its lens, so it keeps full textures
  { src: 'steampunk_camera.glb', out: 'camera.glb', tex: 1024, quality: 60, simplify: 0.0012 },
  { src: 'broken_steampunk_clock.glb', out: 'broken-clock.glb', tex: 768, quality: 56, simplify: 0.002 },
  { src: 'free_lowpoly_steampunk_gears_pack.glb', out: 'gears.glb', tex: 256, quality: 54, simplify: 0.002 },
  { src: 'steampunk-style_clock.glb', out: 'clock.glb', tex: 1024, quality: 58, simplify: 0.0015 },
  { src: 'fancy_victorian_square_picture_frame.glb', out: 'frame.glb', tex: 1024, quality: 58 },
  // the office behind the clock: the desk the camera lies on, and the window beside it
  { src: 'antique_office_desk.glb', out: 'desk.glb', tex: 768, quality: 56, simplify: 0.002 },
  { src: 'old_office_window.glb', out: 'office-window.glb', tex: 512, quality: 56 },
  // and its furniture, CC0 from Poly Haven (scripts/fetch-office.mjs)
  { src: 'polyhaven/vintage_grandfather_clock_01/vintage_grandfather_clock_01.gltf', out: 'office-clock.glb', tex: 512, quality: 54, simplify: 0.003 },
  { src: 'polyhaven/wooden_bookshelf_worn/wooden_bookshelf_worn.gltf', out: 'bookshelf.glb', tex: 512, quality: 54, simplify: 0.003 },
  { src: 'polyhaven/book_encyclopedia_set_01/book_encyclopedia_set_01.gltf', out: 'books.glb', tex: 512, quality: 54, simplify: 0.012 },
  { src: 'polyhaven/vintage_oil_lamp/vintage_oil_lamp.gltf', out: 'oil-lamp.glb', tex: 512, quality: 54, simplify: 0.003 },
  { src: 'polyhaven/magnifying_glass_01/magnifying_glass_01.gltf', out: 'magnifier.glb', tex: 256, quality: 54, simplify: 0.004 },
  { src: 'polyhaven/dining_chair_02/dining_chair_02.gltf', out: 'chair-a.glb', tex: 512, quality: 54, simplify: 0.004 },
  { src: 'polyhaven/gallinera_chair/gallinera_chair.gltf', out: 'chair-b.glb', tex: 512, quality: 54, simplify: 0.004 },
];

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

await fs.mkdir(OUT, { recursive: true });
let before = 0;
let after = 0;
const only = process.argv[2];
for (const m of MODELS.filter((x) => !only || x.out.includes(only))) {
  const doc = await io.read(path.join(SRC, m.src));
  for (const fn of m.pre ?? []) fn(doc);
  await doc.transform(
    prune({ keepLeaves: false, keepAttributes: false }),
    dedup(),
    weld(),
    ...(m.simplify ? [simplify({ simplifier: MeshoptSimplifier, ratio: 0, error: m.simplify, lockBorder: true })] : []),
    resample(),
    prune({ keepLeaves: false, keepAttributes: false }),
    textureCompress({ encoder: sharp, targetFormat: 'avif', resize: [m.tex, m.tex], quality: m.quality, effort: 7 }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' }),
  );
  const outPath = path.join(OUT, m.out);
  await io.write(outPath, doc);
  const [a, b] = await Promise.all([fs.stat(path.join(SRC, m.src)), fs.stat(outPath)]);
  before += a.size;
  after += b.size;
  console.log(`${m.out.padEnd(18)} ${(a.size / 1e6).toFixed(1).padStart(5)}MB -> ${(b.size / 1e6).toFixed(2)}MB`);
}
console.log(`total              ${(before / 1e6).toFixed(1).padStart(5)}MB -> ${(after / 1e6).toFixed(2)}MB`);
