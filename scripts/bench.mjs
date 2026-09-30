// Scroll the whole home page the way a visitor does and report where the frames go, per section.
//
//   node scripts/bench.mjs [--url http://localhost:3000/?qa] [--gpu hw|soft] [--cpu 4] [--size 1440x900]
//                          [--dpr 1] [--hold] [--out bench-results]
//
//   --gpu soft   render with SwiftShader (a CPU rasteriser): the stand-in for a weak graphics card
//   --cpu 4      slow the CPU down four times (Chrome's throttling), like a cheap laptop or phone
//   --hold       keep the quality fixed (no adaptive resolution), to measure one setting honestly
//   --gputime    also time the GPU (costs a little CPU itself, so off by default)
//
// Needs the site running (dev or `next start`). Prints a table and writes the raw frames as JSON.
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, []),
);
const url = args.url ?? 'http://localhost:3000/?qa';
const [w, h] = String(args.size ?? '1440x900').split('x').map(Number);
const soft = args.gpu === 'soft';
const out = args.out ?? 'bench-results';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: [
    soft ? '--use-angle=swiftshader' : '--use-angle=d3d11',
    ...(soft ? ['--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist']),
    '--autoplay-policy=no-user-gesture-required',
    `--window-size=${w},${h}`,
  ],
  defaultViewport: { width: w, height: h, deviceScaleFactor: Number(args.dpr ?? 1) },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
if (args.cpu) {
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(args.cpu) });
}

const t0 = Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction("window.__app && window.__app.getState().stage === 'ready'", { timeout: 240000, polling: 250 });
const loadMs = Date.now() - t0;
await new Promise((r) => setTimeout(r, 2500));
if (args.hold) await page.evaluate(() => (window.__perf.locked = true));

// scroll down the page with the wheel, as a person would: a notch every 45 ms
await page.mouse.move(w * 0.3, h * 0.5);
await page.evaluate((gpu) => {
  window.__perf.record = [];
  window.__perf.gpuTiming = gpu;
}, !!args.gputime);
const started = Date.now();
for (let i = 0; i < 2000; i++) {
  await page.mouse.wheel({ deltaY: 110 });
  await new Promise((r) => setTimeout(r, 45));
  if (i % 20 === 0) {
    const done = await page.evaluate(() => window.__rig.scroll >= window.__rig.limit - 4);
    if (done) break;
  }
  if (Date.now() - started > 180000) break;
}
await new Promise((r) => setTimeout(r, 1500));
const { frames, tier, dpr, longTasks, gpuTimer } = await page.evaluate(() => ({
  frames: window.__perf.record,
  tier: window.__perf.tier,
  dpr: window.__perf.dpr,
  longTasks: window.__perf.longTasks,
  gpuTimer: Array.from(window.__perf.gpu).some((v) => v > 0),
}));
await browser.close();

// ── the report
const by = new Map();
for (const f of frames) {
  const k = f.chapter || 'top';
  if (!by.has(k)) by.set(k, []);
  by.get(k).push(f);
}
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};
const rows = [];
for (const [chapter, fs_] of by) {
  const ms = fs_.map((f) => f.ms);
  const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
  const gpu = fs_.map((f) => f.gpu).filter((v) => v > 0);
  rows.push({
    section: chapter,
    frames: fs_.length,
    fps: +(1000 / avg).toFixed(1),
    p95ms: +pct(ms, 95).toFixed(1),
    worstMs: +Math.max(...ms).toFixed(1),
    over33: ms.filter((v) => v > 33.4).length,
    cpuMs: +(fs_.reduce((a, f) => a + f.cpu, 0) / fs_.length).toFixed(2),
    // where the CPU time goes: scroll bookkeeping / DOM reads / WebGL / DOM writes
    split: [0, 1, 2, 3].map((k) => (fs_.reduce((a, f) => a + (f.ph?.[k] ?? 0), 0) / fs_.length).toFixed(1)).join('/'),
    gpuMs: gpu.length ? +(gpu.reduce((a, b) => a + b, 0) / gpu.length).toFixed(2) : null,
  });
}
const all = frames.map((f) => f.ms);
const worst = [...frames].sort((a, b) => b.ms - a.ms).slice(0, 8);

console.log(`\n${soft ? 'SOFTWARE GPU' : 'HARDWARE GPU'}${args.cpu ? ` · CPU ÷${args.cpu}` : ''} · ${w}×${h} · loaded in ${(loadMs / 1000).toFixed(1)} s`);
console.table(rows);
console.log(`overall ${(1000 / (all.reduce((a, b) => a + b, 0) / all.length)).toFixed(1)} fps · p95 ${pct(all, 95).toFixed(1)} ms · ending at tier ${tier}, dpr ${dpr} · long tasks ${longTasks}${gpuTimer ? '' : ' · (no GPU timer here)'}`);
console.log('worst frames:', worst.map((f) => `${f.ms.toFixed(0)}ms @${Math.round(f.scroll)}px ${f.chapter}`).join(' | '));
if (errors.length) console.log('page errors:', errors.slice(0, 5));

await fs.mkdir(out, { recursive: true });
const file = path.join(out, `bench-${soft ? 'soft' : 'hw'}${args.cpu ? `-cpu${args.cpu}` : ''}-${w}x${h}-${Date.now()}.json`);
await fs.writeFile(file, JSON.stringify({ args, loadMs, rows, tier, dpr, frames }, null, 1));
console.log('frames written to', file);
