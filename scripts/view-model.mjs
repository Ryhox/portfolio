// Renders a GLB from a few angles in headless Chrome, without the site: for looking at models while building.
// Usage: node scripts/view-model.mjs <public/models/x.glb> <outDir> [views.json]
// views: [{ name, az, el, dist?, focus?: "nodeName", hide?: ["nodeName"], mark?: ["nodeName"] }]
// az/el in degrees around the model (az 0 = looking at its front, +Z); dist is a multiple of the framing distance.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const [modelArg, outArg, viewsArg] = process.argv.slice(2);
const root = process.cwd();
const views = viewsArg
  ? JSON.parse(await fs.readFile(viewsArg, 'utf8'))
  : [
      { name: 'front', az: 0, el: 8 },
      { name: 'three-quarter', az: 35, el: 18 },
      { name: 'side', az: 90, el: 5 },
      { name: 'top', az: 0, el: 80 },
    ];

const html = `<!doctype html><html><body style="margin:0;background:#111">
<script type="importmap">{"imports":{"three":"/node_modules/three/build/three.module.js","three/addons/":"/node_modules/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(1200, 800);
r.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#1b1714');
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture;
const cam = new THREE.PerspectiveCamera(30, 1.5, 0.01, 1000);
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.loadAsync('/${modelArg.replace(/\\/g, '/')}');
scene.add(gltf.scene);
gltf.scene.updateMatrixWorld(true);
window.view = (v) => {
  gltf.scene.traverse((o) => { if (o.userData.hidden !== undefined) { o.visible = o.userData.hidden; delete o.userData.hidden; } if (o.userData.mat) { o.material = o.userData.mat; delete o.userData.mat; } });
  for (const n of v.hide ?? []) { const o = gltf.scene.getObjectByName(n); if (o) { o.userData.hidden = o.visible; o.visible = false; } }
  for (const n of v.mark ?? []) { const o = gltf.scene.getObjectByName(n); o?.traverse((m) => { if (m.isMesh) { m.userData.mat = m.material; m.material = new THREE.MeshBasicMaterial({ color: '#ff2bd6' }); } }); }
  const target = v.focus ? gltf.scene.getObjectByName(v.focus) : gltf.scene;
  const box = new THREE.Box3().setFromObject(target);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3()).length();
  const d = (size / 2 / Math.tan(THREE.MathUtils.degToRad(15))) * (v.dist ?? 1);
  const az = THREE.MathUtils.degToRad(v.az ?? 0), el = THREE.MathUtils.degToRad(v.el ?? 0);
  cam.position.set(c.x + Math.sin(az) * Math.cos(el) * d, c.y + Math.sin(el) * d, c.z + Math.cos(az) * Math.cos(el) * d);
  cam.near = d / 100; cam.far = d * 10; cam.updateProjectionMatrix();
  cam.lookAt(c);
  r.render(scene, cam);
  return { center: c.toArray().map((x) => +x.toFixed(3)), size: +size.toFixed(3) };
};
window.ready = true;
</script></body></html>`;

const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(html);
  }
  try {
    const file = path.join(root, url.startsWith('/node_modules/') ? '' : 'public', url.replace(/^\/public\//, '/'));
    const body = await fs.readFile(url.startsWith('/public/') || url.startsWith('/node_modules/') ? path.join(root, url) : file);
    res.writeHead(200, { 'content-type': types[path.extname(url)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((ok) => server.listen(0, ok));
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--window-size=1200,800'],
  defaultViewport: { width: 1200, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
page.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction('window.ready === true', { timeout: 60000 });
await fs.mkdir(outArg, { recursive: true });
for (const v of views) {
  const info = await page.evaluate((v) => window.view(v), v);
  await page.screenshot({ path: path.join(outArg, `${v.name}.png`) });
  console.log(v.name, JSON.stringify(info));
}
await browser.close();
server.close();
