/* 3D models: chess pieces, castles, walls, gates (all built from lathes / boxes / prisms). */
import { lathe, sphere, cyl, cone, box, prism, quad, tf, merge, rgb } from './mesh.js';

export const REALM_HEX = ['#2f86e6', '#35a247', '#e3a82a', '#d9432f'];
export const REALM_ROOF = ['#1b4f9e', '#1f6b2c', '#a97410', '#8e2216'];
const GOLD = rgb('#f3c44c');
const STONE = [168, 170, 180], STONE_D = [120, 124, 138], STONE_L = [196, 198, 206];

const KNIGHT = [[-0.22, 0.1], [0.22, 0.1], [0.2, 0.3], [0.1, 0.46], [0.2, 0.52], [0.34, 0.54], [0.36, 0.62], [0.26, 0.72], [0.14, 0.8], [0.1, 0.96], [0.02, 0.82], [-0.1, 0.74], [-0.2, 0.5], [-0.24, 0.3]];

function base(col) {
  return lathe([[0, 0], [0.37, 0], [0.39, 0.04], [0.37, 0.09], [0.3, 0.12], [0, 0.12]], col, { gold: [[0, 0.1]], gloss: 0.5 });
}

function rawPiece(kind, hex) {
  const c = rgb(hex), dark = c.map(v => v * 0.72);
  const o = { gold: [], gloss: 0.45 };
  switch (kind) {
    case 'P':
      return merge(base(c),
        lathe([[0, 0.1], [0.21, 0.1], [0.14, 0.26], [0.18, 0.29], [0.18, 0.33], [0.11, 0.36], [0, 0.36]], c, { gold: [[0.27, 0.34]], gloss: 0.5 }),
        tf(sphere(0.15, c), { y: 0.34 }));
    case 'R':
      return merge(base(c),
        lathe([[0, 0.1], [0.24, 0.1], [0.2, 0.2], [0.2, 0.5], [0.29, 0.54], [0.29, 0.66], [0, 0.66]], c, { gold: [[0.5, 0.56]], gloss: 0.45 }),
        ...[0, 1, 2, 3].map(i => tf(box(0.14, 0.13, 0.14, c), { x: Math.cos(i * 1.5708 + 0.785) * 0.2, z: Math.sin(i * 1.5708 + 0.785) * 0.2, y: 0.66 })));
    case 'B':
      return merge(base(c),
        lathe([[0, 0.1], [0.23, 0.1], [0.13, 0.32], [0.18, 0.35], [0.18, 0.39], [0.11, 0.41], [0, 0.41]], c, { gold: [[0.33, 0.4]] }),
        tf(sphere(0.16, c), { y: 0.38, sy: 1.5 }),
        tf(sphere(0.05, GOLD), { y: 0.96 }),
        tf(box(0.34, 0.025, 0.04, dark), { y: 0.68, ry: 0.5 }));
    case 'N':
      return merge(base(c),
        lathe([[0, 0.1], [0.25, 0.1], [0.2, 0.2], [0, 0.2]], c, { gold: [[0.1, 0.18]] }),
        tf(prism(KNIGHT, 0.24, c), { y: 0 }),
        tf(prism([[0.3, 0.7], [0.34, 0.76], [0.32, 0.68]], 0.02, dark), { y: 0 }));
    case 'Q':
      return merge(base(c),
        lathe([[0, 0.1], [0.26, 0.1], [0.14, 0.4], [0.19, 0.46], [0.19, 0.5], [0.27, 0.66], [0.2, 0.7], [0, 0.7]], c, { gold: [[0.43, 0.52]], gloss: 0.5 }),
        ...[0, 1, 2, 3, 4, 5].map(i => tf(cone(0.045, 0.14, GOLD), { x: Math.cos(i * 1.0472) * 0.22, z: Math.sin(i * 1.0472) * 0.22, y: 0.66 })),
        ...[0, 1, 2, 3, 4, 5].map(i => tf(sphere(0.035, GOLD), { x: Math.cos(i * 1.0472) * 0.22, z: Math.sin(i * 1.0472) * 0.22, y: 0.8 })),
        tf(sphere(0.07, GOLD), { y: 0.68 }));
    case 'K':
      return merge(base(c),
        lathe([[0, 0.1], [0.27, 0.1], [0.15, 0.45], [0.2, 0.52], [0.2, 0.56], [0.28, 0.76], [0.22, 0.8], [0, 0.8]], c, { gold: [[0.48, 0.58]], gloss: 0.5 }),
        tf(box(0.07, 0.26, 0.07, GOLD, { gloss: 0.7 }), { y: 0.78 }),
        tf(box(0.2, 0.07, 0.07, GOLD, { gloss: 0.7 }), { y: 0.93 }));
  }
  return [];
}

export const pieceMesh = (kind, hex) => tf(rawPiece(kind, hex), { s: 0.86, sy: 1.22 });

/* a translucent dome for Havens */
export function havenMesh() {
  return tf(sphere(0.5, [90, 220, 255], { M: 8, N: 16, gloss: 0.9 }), { y: -0.05, sy: 1.25 }).map(f => ({ ...f, a: 0.22 }));
}

/* ---------- walls & gates ---------- */
export function wallMesh(horizontal, alt) {
  const col = alt ? STONE : [158, 160, 172];
  const body = box(1.0, 0.42, 0.2, col, { gloss: 0.08 });
  const cap = tf(box(1.0, 0.05, 0.26, STONE_L, { gloss: 0.15 }), { y: 0.42 });
  const mer = [-0.3, 0, 0.3].map(x => tf(box(0.2, 0.12, 0.2, STONE_L), { x, y: 0.47 }));
  const m = merge(body, cap, ...mer);
  return horizontal ? m : tf(m, { ry: Math.PI / 2 });
}
export function pillarMesh() {
  return merge(cyl(0.2, 0.95, STONE, { N: 10, gloss: 0.1 }), tf(cyl(0.25, 0.1, GOLD, { N: 10, gloss: 0.6 }), { y: 0.95 }), tf(cone(0.2, 0.3, [214, 160, 40], { gloss: 0.6 }), { y: 1.05 }), cyl(0.27, 0.1, STONE_D, { N: 10 }));
}
export function lintelMesh(len, vertical) {
  const m = merge(box(len, 0.16, 0.3, GOLD, { gloss: 0.6 }), tf(box(len - 0.1, 0.1, 0.34, [190, 140, 36], { gloss: 0.5 }), { y: 0.16 }));
  return tf(vertical ? tf(m, { ry: Math.PI / 2 }) : m, { y: 0.88 });
}
export function hubMesh() {
  return merge(cyl(0.4, 0.2, STONE_D, { N: 12 }), tf(cyl(0.3, 0.8, STONE, { N: 12, gloss: 0.12 }), { y: 0.2 }), tf(cyl(0.36, 0.1, GOLD, { N: 12, gloss: 0.6 }), { y: 1.0 }), tf(cone(0.3, 0.42, [214, 160, 40], { gloss: 0.6 }), { y: 1.1 }));
}

/* ---------- castles (list of parts so the painter can sort them individually) ---------- */
export function castleParts(r) {
  const roof = rgb(REALM_ROOF[r]), real = rgb(REALM_HEX[r]), parts = [];
  const add = (mesh, x, y, z, tag) => parts.push({ mesh, x, y, z, tag });
  add(box(3.0, 0.4, 3.0, [96, 80, 64], { gloss: 0.1 }), 0, -0.4, 0, 'platform');
  add(box(2.6, 0.06, 2.6, [150, 134, 108], { gloss: 0.1 }), 0, 0, 0, 'floor');
  // low curtain walls with merlons
  const wall = (w, d) => {
    const n = 4, long = Math.max(w, d), out = [box(w, 0.55, d, STONE, { gloss: 0.08 })];
    for (let i = 0; i < n; i++) {
      const o = -long / 2 + 0.25 + i * (long - 0.5) / (n - 1);
      out.push(tf(box(w > d ? 0.3 : w, 0.13, w > d ? d : 0.3, STONE_L), w > d ? { x: o, y: 0.55 } : { z: o, y: 0.55 }));
    }
    return merge(...out);
  };
  add(wall(2.0, 0.22), 0, 0.06, -1.1, 'wallN');
  add(wall(2.0, 0.22), 0, 0.06, 1.1, 'wallS');
  add(wall(0.22, 2.0), -1.1, 0.06, 0, 'wallW');
  add(wall(0.22, 2.0), 1.1, 0.06, 0, 'wallE');
  // towers with coloured roofs and banners
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const t = merge(cyl(0.34, 1.25, STONE, { N: 12, gloss: 0.1 }), tf(cyl(0.44, 0.1, STONE_L, { N: 12 }), { y: 1.25 }), tf(cone(0.46, 0.8, roof, { gloss: 0.55 }), { y: 1.35 }),
      tf(cyl(0.025, 0.55, [90, 70, 40], { N: 5 }), { y: 2.05 }), tf(quad([[0, 2.45, 0], [0.5, 2.38, 0], [0.5, 2.12, 0], [0, 2.2, 0]], real), { x: 0.0, z: 0 }));
    add(t, sx * 1.15, 0.06, sz * 1.15, 'tower');
  }
  // inner keep + pedestal for the king
  add(merge(cyl(0.5, 0.28, [196, 170, 110], { N: 14, gloss: 0.3 }), tf(cyl(0.44, 0.06, GOLD, { N: 14, gloss: 0.7 }), { y: 0.28 })), 0, 0.06, 0, 'dais');
  return parts;
}
