// Turns the site's display face (Big Shoulders, 800, as Google serves it) into a three.js typeface for
// the 3D lettering in the office. Only the glyphs asked for are kept, so the file stays a few KB.
// Usage: node scripts/make-type.mjs [TEXT] (default: PROJECTS)
import fs from 'node:fs/promises';
import path from 'node:path';
import opentype from 'opentype.js';

const TEXT = process.argv[2] ?? 'PROJECTS';
const CACHE = 'assets/source/fonts/big-shoulders-800.woff';
const OUT = 'src/components/three/office/shoulders.typeface.json';
// an old user agent gets WOFF (which opentype.js reads) instead of WOFF2
const UA = 'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/534.30 (KHTML, like Gecko) Safari/534.30';

async function source() {
  try {
    return await fs.readFile(CACHE);
  } catch {
    const css = await (await fetch('https://fonts.googleapis.com/css2?family=Big+Shoulders:opsz,wght@72,800', { headers: { 'User-Agent': UA } })).text();
    // the latin subset is the last block
    const urls = [...css.matchAll(/url\((https:[^)]+\.woff)\)/g)].map((m) => m[1]);
    const url = urls.at(-1);
    if (!url) throw new Error('no WOFF in the Google Fonts CSS');
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    await fs.mkdir(path.dirname(CACHE), { recursive: true });
    await fs.writeFile(CACHE, buf);
    return buf;
  }
}

const buf = await source();
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
if (font.tables.fvar) console.warn('warning: the font is variable; only its default instance is read');

const round = (v) => Math.round(v * 10) / 10;
const area = (pts) => {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return a / 2;
};

const glyphs = {};
for (const ch of new Set(TEXT)) {
  const g = font.charToGlyph(ch);
  // split into contours (font units, y up), so their winding can be checked
  const contours = [];
  for (const c of g.path.commands) {
    if (c.type === 'M') contours.push([c]);
    else if (c.type !== 'Z') contours.at(-1).push(c);
  }
  // three takes clockwise contours as solid: turn the glyph over if its outline runs the other way
  const biggest = contours.map((cs) => area(cs.map((c) => [c.x, c.y]))).reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
  const flip = biggest > 0;
  let o = '';
  for (const cs of contours) {
    const seq = flip ? reverse(cs) : cs;
    for (const c of seq) {
      if (c.type === 'M') o += `m ${round(c.x)} ${round(c.y)} `;
      else if (c.type === 'L') o += `l ${round(c.x)} ${round(c.y)} `;
      else if (c.type === 'Q') o += `q ${round(c.x)} ${round(c.y)} ${round(c.x1)} ${round(c.y1)} `;
      else if (c.type === 'C') o += `b ${round(c.x)} ${round(c.y)} ${round(c.x1)} ${round(c.y1)} ${round(c.x2)} ${round(c.y2)} `;
    }
  }
  const bb = g.getBoundingBox();
  glyphs[ch] = { ha: Math.round(g.advanceWidth), x_min: Math.round(bb.x1), x_max: Math.round(bb.x2), o: o.trim() };
}

/** A contour walked the other way round: same points, each curve's controls swapped. */
function reverse(cs) {
  const pts = cs.map((c) => [c.x, c.y]);
  const out = [{ type: 'M', x: pts.at(-1)[0], y: pts.at(-1)[1] }];
  for (let i = cs.length - 1; i > 0; i--) {
    const c = cs[i];
    const to = pts[i - 1];
    if (c.type === 'L') out.push({ type: 'L', x: to[0], y: to[1] });
    else if (c.type === 'Q') out.push({ type: 'Q', x: to[0], y: to[1], x1: c.x1, y1: c.y1 });
    else if (c.type === 'C') out.push({ type: 'C', x: to[0], y: to[1], x1: c.x2, y1: c.y2, x2: c.x1, y2: c.y1 });
  }
  return out;
}

const head = font.tables.head;
const json = {
  glyphs,
  familyName: 'Big Shoulders',
  ascender: font.ascender,
  descender: font.descender,
  underlinePosition: font.tables.post.underlinePosition,
  underlineThickness: font.tables.post.underlineThickness,
  boundingBox: { xMin: head.xMin, yMin: head.yMin, xMax: head.xMax, yMax: head.yMax },
  resolution: font.unitsPerEm,
  capHeight: font.tables.os2?.sCapHeight ?? 0,
  original_font_information: { copyright: 'Big Shoulders, SIL Open Font License 1.1', fontFamily: 'Big Shoulders' },
  cssFontWeight: '800',
  cssFontStyle: 'normal',
};
await fs.writeFile(OUT, JSON.stringify(json));
console.log(`${OUT}: ${Object.keys(glyphs).join('')} (${(JSON.stringify(json).length / 1024).toFixed(1)} KB, ${flipNote()})`);

function flipNote() {
  return `upm ${font.unitsPerEm}, cap ${json.capHeight}`;
}
