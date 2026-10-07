/**
 * A small tile of monochrome noise, made once: the film grain laid over the page's type (see
 * CrtGlass) and over the dark of the loader, which is the same room with the lamp still off.
 */
let tile: string | null = null;

export function noiseTile() {
  if (tile) return tile;
  const c = document.createElement('canvas');
  c.width = c.height = 180;
  const g = c.getContext('2d')!;
  const img = g.createImageData(180, 180);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v;
    img.data[i + 1] = v * 0.94;
    img.data[i + 2] = v * 0.84;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (tile = c.toDataURL('image/png'));
}
