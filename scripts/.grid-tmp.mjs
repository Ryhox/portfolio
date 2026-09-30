import sharp from 'sharp';
const [out, cols, ...files] = process.argv.slice(2);
const W = 480; const c = Number(cols);
const imgs = await Promise.all(files.map(async (f) => { const b = await sharp(f).resize({ width: W }).toBuffer(); const m = await sharp(b).metadata(); return { b, h: m.height }; }));
const rowH = Math.max(...imgs.map(i => i.h));
const rows = Math.ceil(imgs.length / c);
const comps = imgs.map((i, k) => ({ input: i.b, left: (k % c) * (W + 6), top: Math.floor(k / c) * (rowH + 6) }));
await sharp({ create: { width: c * (W + 6), height: rows * (rowH + 6), channels: 3, background: '#444' } }).composite(comps).jpeg({ quality: 75 }).toFile(out);
