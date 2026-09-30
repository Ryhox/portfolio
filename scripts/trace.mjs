// Chrome performance trace across part of the page; sums the browser's own work by event type.
//   node scripts/trace.mjs --from 6000 --to 6500 [--url http://localhost:3000/?qa]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') && acc.push([a.slice(2), all[i + 1]]), acc), []));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
await page.goto(args.url ?? 'http://localhost:3000/?qa', { waitUntil: 'domcontentloaded' });
await page.waitForFunction("window.__app && window.__app.getState().stage === 'ready'", { timeout: 240000, polling: 250 });
await new Promise((r) => setTimeout(r, 2500));
await page.evaluate((y) => window.__lenis.scrollTo(y, { immediate: true, force: true }), Number(args.from ?? 0));
await new Promise((r) => setTimeout(r, 1500));
const file = args.save ?? 'trace.tmp.json';
await page.tracing.start({ path: file, categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink', 'cc', 'gpu', 'media', 'v8.execute'] });
await page.evaluate((y) => window.__lenis.scrollTo(y, { duration: 2, force: true }), Number(args.to ?? 3000));
await new Promise((r) => setTimeout(r, Number(args.ms ?? 3000)));
await page.tracing.stop();
await browser.close();
const trace = JSON.parse(await fs.readFile(file, 'utf8'));
const events = trace.traceEvents ?? trace;
const sum = new Map();
const long = [];
for (const e of events) {
  if (e.ph !== 'X' || !e.dur) continue;
  const k = `${e.name}`;
  const v = sum.get(k) ?? { ms: 0, n: 0, max: 0, thread: e.tid };
  v.ms += e.dur / 1000;
  v.n++;
  v.max = Math.max(v.max, e.dur / 1000);
  sum.set(k, v);
  if (e.dur > 50000) long.push(`${(e.dur / 1000).toFixed(0)}ms ${e.name} ${JSON.stringify(e.args?.data ?? {}).slice(0, 120)}`);
}
const skip = /^(ThreadControllerImpl::RunTask|RunTask|MessageLoop|TaskQueueManager|SequenceManager|ProcessTask|Scheduler|RenderFrameImpl|PipelineReporter|MainThreadTaskQueue|FrameBlameContext|HandlePostMessage|SimpleWatcher|Mojo)/;
console.table([...sum].filter(([k]) => !skip.test(k)).sort((a, b) => b[1].max - a[1].max).slice(0, Number(args.top ?? 22)).map(([k, v]) => ({ event: k.slice(0, 44), totalMs: +v.ms.toFixed(1), count: v.n, maxMs: +v.max.toFixed(1) })));
console.log(long.slice(0, 12).join('\n'));
if (!args.save) await fs.unlink(file);
