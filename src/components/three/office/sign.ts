import * as THREE from 'three';
import { Font, type FontData } from 'three/examples/jsm/loaders/FontLoader.js';
import typeface from './shoulders.typeface.json';

/**
 * The word hanging in the middle of the office, in the site's display face: enamelled letters on
 * brass, set wide, so the view can fly through between two of them on its way to the camera.
 * Built at a cap height of 1; the office scales and places it (see Office).
 */
export const SIGN = {
  text: 'PROJECTS',
  /** the pair of letters the view passes between */
  gapAfter: 3,
  /** letter spacing, in cap heights */
  track: 0.5,
  depth: 0.2,
  bevel: 0.03,
};

export function buildSign() {
  const data = typeface as unknown as FontData & { capHeight: number; glyphs: Record<string, { ha: number; x_min: number; x_max: number }> };
  const font = new Font(data);
  // the font's size is its em; the cap height is a fraction of it
  const em = data.resolution / data.capHeight;
  const unit = em / data.resolution;
  const enamel = new THREE.MeshStandardMaterial({ color: '#efe3c8', roughness: 0.38, metalness: 0, name: 'enamel' });
  const brass = new THREE.MeshStandardMaterial({ color: '#c08c4c', roughness: 0.28, metalness: 1, name: 'brass' });
  const group = new THREE.Group();
  let x = 0;
  let gap = 0;
  const chars = Array.from(SIGN.text);
  chars.forEach((ch, i) => {
    const g = data.glyphs[ch];
    const geo = new THREE.ExtrudeGeometry(font.generateShapes(ch, em), {
      depth: SIGN.depth,
      bevelEnabled: true,
      bevelThickness: SIGN.bevel,
      bevelSize: SIGN.bevel * 0.8,
      bevelOffset: 0,
      bevelSegments: 3,
      curveSegments: 7,
    });
    // the extrusion centred on the letter's plane, the caps' middle on its line
    geo.translate(0, -0.5, -SIGN.depth / 2);
    const mesh = new THREE.Mesh(geo, [enamel, brass]);
    mesh.position.x = x;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (i === SIGN.gapAfter) gap = x + g.x_max * unit;
    if (i === SIGN.gapAfter + 1) gap = (gap + x + g.x_min * unit) / 2;
    x += g.ha * unit + SIGN.track;
  });
  // the gap the view flies through is the sign's origin
  group.children.forEach((m) => (m.position.x -= gap));
  const width = x - SIGN.track;
  const outer = new THREE.Group();
  outer.add(group);
  return { group: outer, width, left: -gap, right: width - gap };
}
