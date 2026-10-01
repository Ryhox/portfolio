// Record a CPU profile while scrolling through part of the page, and list where the time went.
//
//   node scripts/profile.mjs --url http://localhost:3000/?qa --from maker:0.9 --to works:0.15 [--gpu soft] [--top 30]
//
// --from / --to: an anchor name and how far into it (0..1 of its height), or a pixel offset.
// --wheel: come down the page from the top with the mouse wheel, as a visitor (and the benchmark)
//          does, and profile only between --from and --to (so first-time costs there are caught).
// Best run against the dev server: function names are intact there.
import fs from 'node:fs/promises';
import puppeteer from 'puppeteer-core';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, []),
);
const url = args.url ?? 'http://localhost:3000/?qa';
const soft = args.gpu === 'soft';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: [soft ? '--use-angle=swiftshader' : '--use-angle=d3d11', ...(soft ? ['--enable-unsafe-swiftshader'] : ['--enable-gpu', '--ignore-gpu-blocklist']), '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction("window.__app && window.__app.getState().stage === 'ready'", { timeout: 240000, polling: 250 });
await new Promise((r) => setTimeout(r, 2500));

const pos = (spec) =>
  page.evaluate((s) => {
    if (/^\d+$/.test(s)) return Number(s);
    const [name, f] = s.split(':');
    const a = window.__rig.anchors.get(name);
    return a.top + (a.height - innerHeight) * Number(f ?? 0);
  }, String(spec));
const from = await pos(args.from ?? 0);
const to = await pos(args.to ?? 3000);
const cdp = await page.createCDPSession();
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
if (args.wheel) {
  await page.mouse.move(430, 450);
  let on = false;
  for (let i = 0; i < 4000; i++) {
    await page.mouse.wheel({ deltaY: Number(args.delta ?? 110) });
    await new Promise((r) => setTimeout(r, Number(args.every ?? 45)));
    const y = await page.evaluate(() => window.__rig.scroll);
    if (!on && y >= from) {
      on = true;
      await cdp.send('Profiler.start');
    }
    if (on && y >= to) break;
  }
} else {
  await page.evaluate((y) => window.__lenis.scrollTo(y, { immediate: true, force: true }), from);
  await new Promise((r) => setTimeout(r, 1500));
  await cdp.send('Profiler.start');
  await page.evaluate((y) => window.__lenis.scrollTo(y, { duration: 3, force: true }), to);
  await new Promise((r) => setTimeout(r, Number(args.ms ?? 4500)));
}
const { profile } = await cdp.send('Profiler.stop');
await browser.close();

// self time per function
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dts = profile.timeDeltas;
profile.samples.forEach((id, i) => {
  const n = byId.get(id);
  const f = n.callFrame;
  const key = `${f.functionName || '(anon)'}  ${f.url.split('/').slice(-1)[0].split('?')[0]}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + (dts[i] ?? 0) / 1000);
});
const total = [...self.values()].reduce((a, b) => a + b, 0);
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(args.top ?? 30));
console.log(`\nprofile ${args.from} → ${args.to}: ${total.toFixed(0)} ms sampled\n`);
for (const [k, ms] of top) console.log(`${ms.toFixed(1).padStart(8)} ms  ${((ms / total) * 100).toFixed(1).padStart(5)}%  ${k}`);
if (args.save) await fs.writeFile(args.save, JSON.stringify(profile));
