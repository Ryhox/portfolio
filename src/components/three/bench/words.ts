import * as THREE from 'three';

/**
 * The landing's words, in the scene: flat, hanging in the air between the camera and the machine,
 * so the camera flies past them on its way into the tube. They are the page's own words (the h1 and
 * the cue), read letter by letter from where the browser lays them out and painted with the
 * same fonts and colours, so at rest they sit exactly where the page would have put them.
 */

/** How far in front of the camera the words hang, as a share of its distance to the glass. */
export const WORDS_DEPTH = 0.5;

const BORDER = 'rgba(235, 225, 203, 0.35)';
const NEEDLE = '#ecc98a';

/** CSS's cubic-bezier(), solved by bisection. */
function bezier(x1: number, y1: number, x2: number, y2: number) {
  const at = (a: number, b: number, t: number) => 3 * a * t * (1 - t) ** 2 + 3 * b * t * t * (1 - t) + t ** 3;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (at(x1, x2, mid) < x) lo = mid;
      else hi = mid;
    }
    return at(y1, y2, (lo + hi) / 2);
  };
}
const easeOut = bezier(0.16, 1, 0.3, 1);
const easeInOut = bezier(0.76, 0, 0.24, 1);

/** How a part arrives once the page is ready (the CSS transitions of .letter and .reveal). */
type Rise = { kind: 'letter' | 'reveal'; delay: number; height: number };
type Rect = { x: number; y: number; w: number; h: number };
type Glyph = { ch: string; x: number; base: number; font: string; stretch: string; color: string; grad: [number, number] | null; rise: Rise | null; clip: Rect | null };
type Block = {
  x: number;
  y: number;
  w: number;
  h: number;
  glyphs: Glyph[];
  deco: 'needle' | null;
  decoRect: Rect | null;
  decoRise: Rise | null;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  settleAt: number;
  painted: number;
};

function riseOf(el: Element | null): Rise | null {
  const r = el?.closest<HTMLElement>('[data-rise]');
  if (!r) return null;
  const delay = parseFloat(getComputedStyle(r).getPropertyValue('--d')) || 0;
  return { kind: r.dataset.rise === 'letter' ? 'letter' : 'reveal', delay, height: r.getBoundingClientRect().height };
}

/** Opacity and drop (px) of a part `t` seconds after the page became ready (t < 0: not yet). */
function rising(r: Rise | null, t: number): [number, number] {
  if (!r) return [t < 0 ? 0 : 1, 0];
  if (t < 0) return [0, 0];
  const e = t - r.delay;
  if (r.kind === 'letter') return [easeOut(e / 0.9), (1 - easeOut(e / 1.4)) * r.height];
  return [easeOut(e / 1.2), (1 - easeOut(e / 1.5)) * 26];
}
const settles = (r: Rise | null) => (r ? r.delay + (r.kind === 'letter' ? 1.4 : 1.5) : 0);

const STRETCH: [number, CanvasFontStretch][] = [
  [75, 'condensed'],
  [87.5, 'semi-condensed'],
  [100, 'normal'],
  [112.5, 'semi-expanded'],
  [125, 'expanded'],
];

export class HeroWords {
  readonly scene = new THREE.Scene();
  private blocks: Block[] = [];
  private title: HTMLElement | null = null;
  private stale = true;
  private readyAt = -1;
  private dpr = 1;
  private _v = new THREE.Vector3();
  private _fwd = new THREE.Vector3();
  private _c = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private onResize = () => {
    this.stale = true;
  };

  constructor() {
    window.addEventListener('resize', this.onResize);
    document.fonts?.ready.then(this.onResize);
  }

  dispose() {
    window.removeEventListener('resize', this.onResize);
    this.clear();
  }

  private clear() {
    for (const b of this.blocks) {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      b.mesh.material.dispose();
      b.tex.dispose();
    }
    this.blocks = [];
  }

  /**
   * Every frame on the landing: `anchor` is the camera the words were placed for (the hero framing,
   * without the dive), `depth` how far in front of it they hang. Returns whether there is anything
   * to draw.
   */
  update(anchor: THREE.PerspectiveCamera, depth: number, w: number, h: number, time: number, ready: boolean) {
    const title = document.getElementById('hero-title');
    if (title !== this.title) {
      this.title = title;
      this.stale = true;
    }
    if (!title) return false;
    if (this.stale) this.layout();
    if (ready && this.readyAt < 0) this.readyAt = time;
    const t = this.readyAt < 0 ? -1 : time - this.readyAt;
    for (const b of this.blocks) this.paint(b, t, time);
    this.place(anchor, depth, w, h);
    return this.readyAt >= 0 && this.blocks.length > 0;
  }

  /** Draw the words over the finished picture, seen by `camera`. */
  render(gl: THREE.WebGLRenderer, camera: THREE.Camera, opacity: number) {
    if (opacity <= 0.001) return;
    for (const b of this.blocks) b.mesh.material.opacity = opacity;
    const auto = gl.autoClear;
    gl.autoClear = false;
    gl.setRenderTarget(null);
    gl.render(this.scene, camera);
    gl.autoClear = auto;
  }

  /** Read the words from the page: where each letter is, in which font and colour. */
  private layout() {
    const html = document.documentElement;
    const main = document.getElementById('main');
    // nothing measures true while the picture is squeezed, or the page is swung aside
    if (html.classList.contains('crt-off') || html.classList.contains('crt-on') || main?.style.transform) return;
    this.stale = false;
    this.clear();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const sx = window.scrollX;
    const sy = window.scrollY;
    const range = document.createRange();
    const probe = document.createElement('canvas').getContext('2d')!;

    const make = (root: HTMLElement, pad: number, deco: Block['deco']) => {
      const r = root.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const x = r.left + sx - pad;
      const y = r.top + sy - pad;
      const glyphs: Glyph[] = [];
      const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walk.nextNode(); n; n = walk.nextNode()) {
        const el = n.parentElement;
        if (!el) continue;
        const cs = getComputedStyle(el);
        const font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const wdth = parseFloat(/wdth['"]?\s+([\d.]+)/.exec(cs.fontVariationSettings)?.[1] ?? '100');
        const stretch = STRETCH.reduce((a, b) => (Math.abs(b[0] - wdth) < Math.abs(a[0] - wdth) ? b : a))[1];
        probe.font = font;
        const letter = el.closest<HTMLElement>('[data-rise="letter"]');
        const lr = letter?.getBoundingClientRect();
        const clipEl = el.closest<HTMLElement>('[data-clip]')?.getBoundingClientRect();
        const rise = riseOf(el);
        const text = n.textContent ?? '';
        for (let i = 0; i < text.length; i++) {
          if (/\s/.test(text[i])) continue;
          range.setStart(n, i);
          range.setEnd(n, i + 1);
          const cr = range.getBoundingClientRect();
          if (!cr.width) continue;
          const ch = cs.textTransform === 'uppercase' ? text[i].toUpperCase() : cs.textTransform === 'lowercase' ? text[i].toLowerCase() : text[i];
          const m = probe.measureText(ch);
          const ascent = m.fontBoundingBoxAscent ?? parseFloat(cs.fontSize) * 0.8;
          glyphs.push({
            ch,
            x: cr.left + sx - x,
            base: cr.top + sy - y + ascent,
            font,
            stretch,
            color: cs.color,
            grad: lr ? [lr.top + sy - y, lr.bottom + sy - y] : null,
            rise,
            clip: clipEl ? { x: clipEl.left + sx - x, y: clipEl.top + sy - y, w: clipEl.width, h: clipEl.height } : null,
          });
        }
      }
      const w = r.width + pad * 2;
      const h = r.height + pad * 2;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(w * this.dpr);
      canvas.height = Math.ceil(h * this.dpr);
      const ctx = canvas.getContext('2d')!;
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthTest: false, depthWrite: false }),
      );
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      const decoRise = deco ? riseOf(root) : null;
      this.blocks.push({
        x,
        y,
        w,
        h,
        glyphs,
        deco,
        decoRect: deco ? { x: pad, y: pad, w: r.width, h: r.height } : null,
        decoRise,
        canvas,
        ctx,
        tex,
        mesh,
        settleAt: Math.max(settles(decoRise), ...glyphs.map((g) => settles(g.rise))),
        painted: -1,
      });
    };

    document.querySelectorAll<HTMLElement>('[data-words]').forEach((root) => make(root, 24, null));
    document.querySelectorAll<HTMLElement>('[data-words] [data-deco]').forEach((el) => make(el, 4, 'needle'));
  }

  /** Paint a block's canvas, if what it shows has changed. */
  private paint(b: Block, t: number, time: number) {
    const moving = t >= 0 && t < b.settleAt + 0.05;
    const animated = !!b.deco && t >= 0;
    if (b.painted >= 0 && !moving && !animated) return;
    if (!moving && animated && time - b.painted < 1 / 30) return;
    if (b.painted >= 0 && t < 0) return;
    b.painted = time;
    const { ctx } = b;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, b.w, b.h);
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';

    if (b.deco && b.decoRect) {
      const [op, dy] = rising(b.decoRise, t);
      const r = b.decoRect;
      ctx.globalAlpha = op;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2 + dy;
      ctx.strokeStyle = BORDER;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r.w / 2 - 0.5, 0, Math.PI * 2);
      ctx.stroke();
      // it swings from -50° to 130° and back every 2.8 s
      const k = (time % 2.8) / 1.4;
      const deg = k < 1 ? -50 + 180 * easeInOut(k) : 130 - 180 * easeInOut(k - 1);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.fillStyle = NEEDLE;
      ctx.fillRect(-0.5, -9, 1, 9);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    for (const g of b.glyphs) {
      const [op, dy] = rising(g.rise, t);
      if (op <= 0.001) continue;
      ctx.save();
      if (g.clip) {
        ctx.beginPath();
        ctx.rect(g.clip.x, g.clip.y, g.clip.w, g.clip.h);
        ctx.clip();
      }
      ctx.globalAlpha = op;
      ctx.font = g.font;
      ctx.fontStretch = g.stretch as CanvasFontStretch;
      if (g.grad) {
        // the letters' stamped-metal gradient, carried with them as they rise
        const grad = ctx.createLinearGradient(0, g.grad[0] + dy, 0, g.grad[1] + dy);
        grad.addColorStop(0, '#fff6e2');
        grad.addColorStop(0.4, '#ebe1cb');
        grad.addColorStop(1, '#c9b999');
        ctx.fillStyle = grad;
      } else ctx.fillStyle = g.color;
      ctx.fillText(g.ch, g.x, g.base + dy);
      ctx.restore();
    }
    b.tex.needsUpdate = true;
  }

  /** Hang each block where it shows in the page, `depth` in front of the anchor camera. */
  private place(cam: THREE.PerspectiveCamera, depth: number, w: number, h: number) {
    const fwd = this._fwd.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const at = (px: number, py: number, out: THREE.Vector3) => {
      const dir = this._v.set((px / w) * 2 - 1, 1 - (py / h) * 2, 0.5).unproject(cam).sub(cam.position).normalize();
      return out.copy(cam.position).addScaledVector(dir, depth / dir.dot(fwd));
    };
    const [tl, tr, bl, br] = this._c;
    for (const b of this.blocks) {
      at(b.x, b.y, tl);
      at(b.x + b.w, b.y, tr);
      at(b.x, b.y + b.h, bl);
      at(b.x + b.w, b.y + b.h, br);
      b.mesh.position.copy(tl).add(br).multiplyScalar(0.5);
      b.mesh.quaternion.copy(cam.quaternion);
      b.mesh.scale.set(tl.distanceTo(tr), tl.distanceTo(bl), 1);
    }
  }
}
