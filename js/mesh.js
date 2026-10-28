/* Tiny mesh toolkit: faces with explicit normals, for the software 3D renderer. */
export const rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function face(pts, c, o = {}) {
  const n = o.n ? norm(o.n) : norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
  const m = [0, 0, 0];
  for (const p of pts) { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; }
  return { p: pts, c, n, m: m.map(v => v / pts.length), g: o.g ?? 0.3, a: o.a ?? 1, ds: !!o.ds };
}

/* Lathe: profile = [[radius,y],...] from the bottom centre outwards and up to the top centre. */
export function lathe(profile, color, o = {}) {
  const N = o.N || 16, out = [], gold = o.gold || [], gc = o.goldColor || [240, 192, 72];
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i], [r1, y1] = profile[i + 1];
    const dr = r1 - r0, dy = y1 - y0, len = Math.hypot(dr, dy);
    if (len < 1e-6) continue;
    const nr = dy / len, ny = -dr / len, ym = (y0 + y1) / 2;
    const col = gold.some(([a, b]) => ym >= a && ym <= b) ? gc : color;
    for (let j = 0; j < N; j++) {
      const a0 = (j / N) * Math.PI * 2, a1 = ((j + 1) / N) * Math.PI * 2, am = (a0 + a1) / 2;
      out.push(face([
        [r0 * Math.cos(a0), y0, r0 * Math.sin(a0)], [r0 * Math.cos(a1), y0, r0 * Math.sin(a1)],
        [r1 * Math.cos(a1), y1, r1 * Math.sin(a1)], [r1 * Math.cos(a0), y1, r1 * Math.sin(a0)]],
      col, { n: [nr * Math.cos(am), ny, nr * Math.sin(am)], g: o.gloss }));
    }
  }
  return out;
}
export function sphere(r, color, o = {}) {
  const M = o.M || 8, pr = [];
  for (let i = 0; i <= M; i++) { const t = -Math.PI / 2 + (i / M) * Math.PI; pr.push([Math.max(0, r * Math.cos(t)), r * Math.sin(t) + r]); }
  return lathe(pr, color, { N: o.N || 14, gloss: o.gloss ?? 0.6 });
}
export const cyl = (r, h, color, o) => lathe([[0, 0], [r, 0], [r, h], [0, h]], color, o);
export const cone = (r, h, color, o) => lathe([[0, 0], [r, 0], [0, h]], color, { N: 12, ...o });
export function box(w, h, d, color, o = {}) {
  const x = w / 2, z = d / 2, c = color, g = o.gloss ?? 0.15;
  const P = (a, b, cc) => [a * x, b * h, cc * z];
  return [
    face([P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1)], c, { n: [0, 1, 0], g }),
    face([P(-1, 0, 1), P(1, 0, 1), P(1, 1, 1), P(-1, 1, 1)], c, { n: [0, 0, 1], g }),
    face([P(-1, 0, -1), P(1, 0, -1), P(1, 1, -1), P(-1, 1, -1)], c, { n: [0, 0, -1], g }),
    face([P(1, 0, -1), P(1, 0, 1), P(1, 1, 1), P(1, 1, -1)], c, { n: [1, 0, 0], g }),
    face([P(-1, 0, -1), P(-1, 0, 1), P(-1, 1, 1), P(-1, 1, -1)], c, { n: [-1, 0, 0], g }),
  ];
}
/* Extrude a 2D outline (x,y) along z. */
export function prism(poly, depth, color, o = {}) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) { const p = poly[i], q = poly[(i + 1) % poly.length]; a += p[0] * q[1] - q[0] * p[1]; }
  const pl = a < 0 ? poly.slice().reverse() : poly, z = depth / 2, out = [], g = o.gloss ?? 0.5;
  out.push(face(pl.map(p => [p[0], p[1], z]), color, { n: [0, 0, 1], g }));
  out.push(face(pl.map(p => [p[0], p[1], -z]), color, { n: [0, 0, -1], g }));
  for (let i = 0; i < pl.length; i++) {
    const p = pl[i], q = pl[(i + 1) % pl.length], dx = q[0] - p[0], dy = q[1] - p[1];
    out.push(face([[p[0], p[1], z], [q[0], q[1], z], [q[0], q[1], -z], [p[0], p[1], -z]], color, { n: [dy, -dx, 0], g }));
  }
  return out;
}
export function quad(pts, color, o = {}) { return [face(pts, color, { ds: true, ...o })]; }

/* transforms */
export function tf(mesh, { x = 0, y = 0, z = 0, ry = 0, s = 1, sy = null } = {}) {
  const c = Math.cos(ry), sn = Math.sin(ry), syy = sy ?? s;
  const T = p => { const X = p[0] * s, Y = p[1] * syy, Z = p[2] * s; return [X * c + Z * sn + x, Y + y, -X * sn + Z * c + z]; };
  return mesh.map(f => {
    const n = [f.n[0] / s, f.n[1] / syy, f.n[2] / s]; const nn = norm(n);
    const nr = [nn[0] * c + nn[2] * sn, nn[1], -nn[0] * sn + nn[2] * c];
    const p = f.p.map(T), m = T(f.m);
    return { ...f, p, m, n: nr };
  });
}
export const merge = (...ms) => ms.flat();
