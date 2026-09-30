/**
 * Characters the tube's typeface (VT323, latin subset) does not have, drawn by hand so they sit
 * exactly on the cell grid: box drawing, blocks and shades, and a few shapes. Anything else falls
 * back to whatever font the browser finds.
 */

// arms: up, right, down, left. 1 light, 2 heavy, 3 double
const BOX: Record<string, [number, number, number, number]> = {
  '─': [0, 1, 0, 1], '│': [1, 0, 1, 0], '┌': [0, 1, 1, 0], '┐': [0, 0, 1, 1], '└': [1, 1, 0, 0], '┘': [1, 0, 0, 1],
  '├': [1, 1, 1, 0], '┤': [1, 0, 1, 1], '┬': [0, 1, 1, 1], '┴': [1, 1, 0, 1], '┼': [1, 1, 1, 1],
  '╭': [0, 1, 1, 0], '╮': [0, 0, 1, 1], '╰': [1, 1, 0, 0], '╯': [1, 0, 0, 1],
  '━': [0, 2, 0, 2], '┃': [2, 0, 2, 0], '┏': [0, 2, 2, 0], '┓': [0, 0, 2, 2], '┗': [2, 2, 0, 0], '┛': [2, 0, 0, 2],
  '┣': [2, 2, 2, 0], '┫': [2, 0, 2, 2], '┳': [0, 2, 2, 2], '┻': [2, 2, 0, 2], '╋': [2, 2, 2, 2],
  '═': [0, 3, 0, 3], '║': [3, 0, 3, 0], '╔': [0, 3, 3, 0], '╗': [0, 0, 3, 3], '╚': [3, 3, 0, 0], '╝': [3, 0, 0, 3],
  '╠': [3, 3, 3, 0], '╣': [3, 0, 3, 3], '╦': [0, 3, 3, 3], '╩': [3, 3, 0, 3], '╬': [3, 3, 3, 3],
};

// quadrants: top-left, top-right, bottom-left, bottom-right
const QUAD: Record<string, number> = { '▘': 0b1000, '▝': 0b0100, '▖': 0b0010, '▗': 0b0001, '▚': 0b1001, '▞': 0b0110, '▙': 0b1011, '▛': 0b1110, '▜': 0b1101, '▟': 0b0111 };

const SHADE: Record<string, number> = { '░': 0.25, '▒': 0.5, '▓': 0.75 };

/** Whether the tube's own typeface has this character. */
export function inFont(ch: string) {
  const c = ch.codePointAt(0)!;
  return c <= 0xff || (c >= 0x2000 && c <= 0x206f) || c === 0x20ac || c === 0x2122 || c === 0x2212 || c === 0x131 || c === 0x152 || c === 0x153;
}

export function isGlyph(ch: string) {
  return ch in BOX || ch in QUAD || ch in SHADE || '█▀▄▌▐▮▯●○■□◆◇▲▼◀▶♥'.includes(ch);
}

/** Draw one special character into the cell at (x, top), `w` wide and `h` tall, in the current fill. */
export function drawGlyph(ctx: CanvasRenderingContext2D, ch: string, x: number, top: number, w: number, h: number) {
  const box = BOX[ch];
  if (box) {
    const cx = x + w / 2;
    const cy = top + h / 2;
    const thin = Math.max(1.5, w * 0.13);
    const thick = Math.max(2.5, w * 0.26);
    const gap = w * 0.2;
    box.forEach((k, i) => {
      if (!k) return;
      const t = k === 2 ? thick : thin;
      const offsets = k === 3 ? [-gap, gap] : [0];
      for (const o of offsets) {
        // each arm runs from the middle to its edge, a little past the middle so arms join
        if (i === 0) ctx.fillRect(cx + o - t / 2, top, t, h / 2 + t / 2 + (k === 3 ? gap : 0));
        if (i === 2) ctx.fillRect(cx + o - t / 2, cy - t / 2 - (k === 3 ? gap : 0), t, h / 2 + t / 2 + (k === 3 ? gap : 0));
        if (i === 1) ctx.fillRect(cx - t / 2 - (k === 3 ? gap : 0), cy + o - t / 2, w / 2 + t / 2 + (k === 3 ? gap : 0), t);
        if (i === 3) ctx.fillRect(x, cy + o - t / 2, w / 2 + t / 2 + (k === 3 ? gap : 0), t);
      }
    });
    return;
  }
  // blocks overlap their neighbours by a hair, so rows of them read as one solid shape
  const e = 0.6;
  switch (ch) {
    case '█':
      ctx.fillRect(x - e, top - e, w + e * 2, h + e * 2);
      return;
    case '▀':
      ctx.fillRect(x - e, top - e, w + e * 2, h / 2 + e);
      return;
    case '▄':
      ctx.fillRect(x - e, top + h / 2, w + e * 2, h / 2 + e);
      return;
    case '▌':
      ctx.fillRect(x - e, top - e, w / 2 + e, h + e * 2);
      return;
    case '▐':
      ctx.fillRect(x + w / 2, top - e, w / 2 + e, h + e * 2);
      return;
    case '▮':
      ctx.fillRect(x + w * 0.2, top + h * 0.2, w * 0.6, h * 0.62);
      return;
    case '▯':
      ctx.fillRect(x + w * 0.2, top + h * 0.2, w * 0.6, Math.max(1, w * 0.1));
      ctx.fillRect(x + w * 0.2, top + h * 0.72, w * 0.6, Math.max(1, w * 0.1));
      ctx.fillRect(x + w * 0.2, top + h * 0.2, Math.max(1, w * 0.1), h * 0.62);
      ctx.fillRect(x + w * 0.7, top + h * 0.2, Math.max(1, w * 0.1), h * 0.62);
      return;
  }
  if (ch in SHADE) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * SHADE[ch];
    ctx.fillRect(x - e, top - e, w + e * 2, h + e * 2);
    ctx.globalAlpha = a;
    return;
  }
  if (ch in QUAD) {
    const q = QUAD[ch];
    if (q & 0b1000) ctx.fillRect(x - e, top - e, w / 2 + e, h / 2 + e);
    if (q & 0b0100) ctx.fillRect(x + w / 2, top - e, w / 2 + e, h / 2 + e);
    if (q & 0b0010) ctx.fillRect(x - e, top + h / 2, w / 2 + e, h / 2 + e);
    if (q & 0b0001) ctx.fillRect(x + w / 2, top + h / 2, w / 2 + e, h / 2 + e);
    return;
  }
  // shapes, in a square in the middle of the cell
  const s = Math.min(w, h) * 0.8;
  const cx = x + w / 2;
  const cy = top + h * 0.52;
  ctx.beginPath();
  switch (ch) {
    case '●':
    case '○':
      ctx.arc(cx, cy, s / 2, 0, Math.PI * 2);
      break;
    case '■':
    case '□':
      ctx.rect(cx - s / 2, cy - s / 2, s, s);
      break;
    case '◆':
    case '◇':
      ctx.moveTo(cx, cy - s / 2);
      ctx.lineTo(cx + s / 2, cy);
      ctx.lineTo(cx, cy + s / 2);
      ctx.lineTo(cx - s / 2, cy);
      ctx.closePath();
      break;
    case '▲':
      ctx.moveTo(cx, cy - s / 2);
      ctx.lineTo(cx + s / 2, cy + s / 2);
      ctx.lineTo(cx - s / 2, cy + s / 2);
      ctx.closePath();
      break;
    case '▼':
      ctx.moveTo(cx - s / 2, cy - s / 2);
      ctx.lineTo(cx + s / 2, cy - s / 2);
      ctx.lineTo(cx, cy + s / 2);
      ctx.closePath();
      break;
    case '◀':
      ctx.moveTo(cx + s / 2, cy - s / 2);
      ctx.lineTo(cx + s / 2, cy + s / 2);
      ctx.lineTo(cx - s / 2, cy);
      ctx.closePath();
      break;
    case '▶':
      ctx.moveTo(cx - s / 2, cy - s / 2);
      ctx.lineTo(cx - s / 2, cy + s / 2);
      ctx.lineTo(cx + s / 2, cy);
      ctx.closePath();
      break;
    case '♥': {
      const r = s / 4;
      ctx.moveTo(cx, cy + s / 2);
      ctx.arc(cx - r, cy - r / 2, r, Math.PI * 0.75, Math.PI * 1.95);
      ctx.arc(cx + r, cy - r / 2, r, Math.PI * 1.05, Math.PI * 0.25);
      ctx.closePath();
      break;
    }
  }
  if (ch === '○' || ch === '□' || ch === '◇') {
    ctx.lineWidth = Math.max(1.5, w * 0.12);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke();
  } else ctx.fill();
}
