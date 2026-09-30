// Headless visual QA: drives the running dev/prod server with the locally installed Chrome.
// Usage: node scripts/qa.mjs <plan.json>
// plan: { url, width, height, dpr, out, steps: [{ wait?: ms, scroll?: px | "#id", smooth?: bool, shot?: name, eval?: js, key?: string, move?: [x,y], click?: [x,y] }] }
import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import path from 'node:path';

const plan = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const chrome =
  process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: [
    '--use-angle=d3d11',
    '--enable-gpu',
    '--ignore-gpu-blocklist',
    '--enable-webgl',
    '--autoplay-policy=no-user-gesture-required',
    `--window-size=${plan.width ?? 1440},${plan.height ?? 900}`,
  ],
  defaultViewport: { width: plan.width ?? 1440, height: plan.height ?? 900, deviceScaleFactor: plan.dpr ?? 1, isMobile: !!plan.mobile, hasTouch: !!plan.mobile },
});

const page = await browser.newPage();
const logs = [];
page.on('console', (m) => {
  if (['error', 'warn'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`);
});
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

if (plan.storage) {
  // e.g. { "ryhox-music-ok": "1" }: set before any of the page's code runs
  await page.evaluateOnNewDocument((kv) => {
    for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v);
  }, plan.storage);
}
await page.goto(plan.url ?? 'http://localhost:3000/', { waitUntil: 'domcontentloaded' });
const out = plan.out ?? '.';
await fs.mkdir(out, { recursive: true });

for (const st of plan.steps ?? []) {
  if (st.waitFor) {
    await page.waitForFunction(st.waitFor, { timeout: st.timeout ?? 60000, polling: 200 }).catch(() => logs.push(`[qa] timeout waiting for ${st.waitFor}`));
  }
  if (st.scroll !== undefined) {
    await page.evaluate(
      ({ y, smooth }) => {
        const l = window.__lenis;
        const target = typeof y === 'string' ? document.querySelector(y) : y;
        if (l) l.scrollTo(target, smooth ? { duration: 1.2, force: true } : { immediate: true, force: true });
        else window.scrollTo(0, typeof y === 'number' ? y : target.getBoundingClientRect().top + scrollY);
      },
      { y: st.scroll, smooth: !!st.smooth },
    );
  }
  if (st.move) await page.mouse.move(st.move[0], st.move[1], { steps: 8 });
  // hover / click an element by selector (its centre), so plans survive layout changes
  if (st.viewport) {
    await page.setViewport({ width: st.viewport[0], height: st.viewport[1], deviceScaleFactor: 1 });
  }
  if (st.drag) {
    const [x0, y0, x1, y1] = st.drag;
    await page.mouse.move(x0, y0, { steps: 4 });
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps: 14 });
    await page.mouse.up();
  }
  for (const kind of ['hover', 'clickSel', 'dblSel']) {
    if (!st[kind]) continue;
    const box = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, st[kind]);
    if (!box) {
      logs.push(`[qa] no element for ${st[kind]}`);
      continue;
    }
    await page.mouse.move(box.x, box.y, { steps: 6 });
    if (kind === 'clickSel') await page.mouse.click(box.x, box.y);
    if (kind === 'dblSel') {
      // a real double click: two presses, the second one counted as the double
      await page.mouse.click(box.x, box.y);
      await new Promise((r) => setTimeout(r, 90));
      await page.mouse.click(box.x, box.y, { clickCount: 2 });
    }
  }
  if (st.click) await page.mouse.click(st.click[0], st.click[1]);
  if (st.key) await page.keyboard.type(st.key, { delay: 60 });
  if (st.press) await page.keyboard.press(st.press);
  if (st.eval) {
    const r = await page.evaluate(st.eval);
    console.log('eval:', JSON.stringify(r));
  }
  if (st.wait) await new Promise((r) => setTimeout(r, st.wait));
  if (st.shot) {
    const file = path.join(out, `${st.shot}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
    console.log('shot', file);
  }
}

if (logs.length) console.log(logs.slice(0, 40).join('\n'));
await browser.close();
