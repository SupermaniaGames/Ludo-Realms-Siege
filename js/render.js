/* Software 3D renderer on a 2D canvas: real perspective projection, rotatable camera,
   lit & shaded 3D meshes, painter's-algorithm sorting, tweened animations, picking. */
import { SZ, GATES, home, promoTiles, realmAt } from './engine.js';
import { tf, box, rgb } from './mesh.js';
import { pieceMesh, havenMesh, wallMesh, pillarMesh, lintelMesh, hubMesh, castleParts, REALM_HEX } from './models.js';
import { terrainFor, wood, CELL_PX } from './textures.js';

const L = (() => { const v = [-0.5, 0.82, 0.42], l = Math.hypot(...v); return v.map(a => a / l); })();
const wc = (x, y) => [x - 5.5, y - 5.5];            // cell -> world centre (x,z)
const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function tri(g, img, s0, s1, s2, d0, d1, d2) {
  const det = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
  if (!det) return;
  const a = ((d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1])) / det;
  const b = ((d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0])) / det;
  const c = ((d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1])) / det;
  const d = ((d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0])) / det;
  const e = d0[0] - a * s0[0] - b * s0[1], f = d0[1] - c * s0[0] - d * s0[1];
  const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3, grow = p => [p[0] + (p[0] - cx) * 0.03 + Math.sign(p[0] - cx) * 0.4, p[1] + (p[1] - cy) * 0.03 + Math.sign(p[1] - cy) * 0.4];
  const q0 = grow(d0), q1 = grow(d1), q2 = grow(d2);
  g.save(); g.beginPath(); g.moveTo(q0[0], q0[1]); g.lineTo(q1[0], q1[1]); g.lineTo(q2[0], q2[1]); g.closePath(); g.clip();
  g.transform(a, c, b, d, e, f); g.drawImage(img, 0, 0); g.restore();
}
function texQuad(g, img, sx, sy, sw, sh, P) {
  // draw only the needed source rect: translate source into a tiny offscreen cache for speed
  const k = img._sub || (img._sub = new Map()), key = sx + ',' + sy + ',' + sw + ',' + sh;
  let sub = k.get(key);
  if (!sub) { sub = document.createElement('canvas'); sub.width = sw; sub.height = sh; sub.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh); k.set(key, sub); }
  tri(g, sub, [0, 0], [sw, 0], [sw, sh], P[0], P[1], P[2]);
  tri(g, sub, [0, 0], [sw, sh], [0, sh], P[0], P[2], P[3]);
}

export class Board3D {
  constructor(canvas, fx = {}) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.fx = fx;
    this.panX = 0; this.panY = 0; this.yaw = 0; this.yawT = 0; this.elev = 1.0; this.elevT = 1.0; this.zoom = 1; this.zoomT = 1;
    this.D = 48; this.k = 40; this.kT = 40; this.ox = 0; this.oy = 0;
    this.vp = new Map(); this.busy = new Set(); this.dying = new Set();
    this.tweens = []; this.effects = []; this.hl = {}; this.hits = []; this.g = null;
    this.mesh = new Map(); this.walls = new Map(); this.static = null; this.staticKey = '';
    this.woodTex = wood(); this.terr = [0, 1, 2, 3].map(terrainFor);
    this.t0 = performance.now(); this.t = 0;
    this._buildScenery();
    this._bindInput();
    this.resize();
    const loop = now => { this.t = (now - this.t0) / 1000; this._frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  /* ------------ setup ------------ */
  _mesh(k, o) { const key = k + o; if (!this.mesh.has(key)) this.mesh.set(key, pieceMesh(k, REALM_HEX[o])); return this.mesh.get(key); }
  _buildScenery() {
    this.scenery = [];            // always drawn through the painter
    const push = (mesh, x, y, z, tag, extra = {}) => this.scenery.push({ mesh, x, y, z, tag, ...extra });
    for (let i = 0; i < SZ; i++) {
      const z = i - 5.5;
      for (const hz of [false, true]) {
        const key = (hz ? 'h,' : 'v,') + i;
        if (GATES.includes(i)) continue;
        const it = { mesh: wallMesh(hz, i % 2), x: hz ? z : 0, y: 0, z: hz ? 0 : z, tag: 'wall', key, alive: true };
        this.scenery.push(it); this.walls.set(key, it);
      }
    }
    // gates: pillars + lintel
    for (const a of [2, 8]) {
      const lo = a - 6, hi = a + 2 - 6;
      for (const p of [lo, hi]) { push(pillarMesh(), 0, 0, p, 'pillar'); push(pillarMesh(), p, 0, 0, 'pillar'); }
      push(lintelMesh(2.3, true), 0, 0, (lo + hi) / 2, 'lintel');
      push(lintelMesh(2.3, false), (lo + hi) / 2, 0, 0, 'lintel');
    }
    push(hubMesh(), 0, 0, 0, 'hub');
    this.castles = [0, 1, 2, 3].map(r => {
      const h = home(r), [hx, hz] = wc(h.cx, h.cy), cx = hx - h.dx * 2.1, cz = hz - h.dy * 2.1;
      for (const p of castleParts(r)) push(p.mesh, cx + p.x, p.y, cz + p.z, 'castle', { realm: r });
      push(tf(pieceMesh('K', REALM_HEX[r]), { s: 1.45, y: 0.34 }), cx, 0.06, cz, 'king', { realm: r });
      return { cx, cz };
    });
  }

  /* ------------ camera ------------ */
  _sync_cam() {
    const e = this.elev, ce = Math.cos(e), se = Math.sin(e), cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    this.ce = ce; this.se = se; this.cyw = cy; this.syw = sy;
    const Cx = 0, Cy = this.D * se, Cz = this.D * ce;           // camera in yawed space
    this.cam = [Cx * cy - Cz * sy, Cy, Cx * sy + Cz * cy];        // un-yawed world position
  }
  project(x, y, z) {
    const X = x * this.cyw + z * this.syw, Z = -x * this.syw + z * this.cyw;
    const yu = y * this.ce - Z * this.se, df = -y * this.se - Z * this.ce, w = this.D + df, s = this.k / w;
    return [this.ox + X * s, this.oy - yu * s, w];
  }
  unproject(px, py, h = 0) {
    const xs = (px - this.ox) / this.k, ys = (this.oy - py) / this.k;
    const d = [xs, ys * this.ce - this.se, -ys * this.se - this.ce], C = [0, this.D * this.se, this.D * this.ce];
    const t = (h - C[1]) / d[1], X = C[0] + t * d[0], Z = C[2] + t * d[2];
    return [X * this.cyw - Z * this.syw, X * this.syw + Z * this.cyw];
  }
  _fit() {
    const sv = [this.k, this.ox, this.oy]; this.k = 1; this.ox = 0; this.oy = 0;
    let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
    for (const [x, y, z] of [[-9.5, -0.4, -9.5], [9.5, -0.4, -9.5], [-9.5, -0.4, 9.5], [9.5, -0.4, 9.5], [-8, 2.7, -8], [8, 2.7, -8], [-8, 2.7, 8], [8, 2.7, 8]]) {
      const [sx, sy] = this.project(x, y, z); mnx = Math.min(mnx, sx); mxx = Math.max(mxx, sx); mny = Math.min(mny, sy); mxy = Math.max(mxy, sy);
    }
    const W = this.W, H = this.H, pad = 0.97;
    const kT = Math.min(W * pad / (mxx - mnx), H * pad / (mxy - mny));
    this.kT = kT * this.zoom;
    this.k = sv[0]; this.ox = sv[1]; this.oy = sv[2];
    this._ext = [mnx, mxx, mny, mxy];
  }
  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = Math.max(50, r.width); this.H = Math.max(50, r.height); this.dpr = dpr;
    this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
    this.staticKey = ''; this._first = true;
  }
  rotate(dir) { this.yawT += dir * Math.PI / 2; }
  resetView() { this.yawT = Math.round(this.yaw / (Math.PI * 2)) * Math.PI * 2; this.elevT = 1.0; this.zoomT = 1; this.panX = 0; this.panY = 0; }

  /* ------------ game state sync ------------ */
  setGame(g) { this.g = g; this.vp.clear(); this.busy.clear(); this.dying.clear(); for (const w of this.walls.values()) { w.alive = true; w.fall = 0; } this.effects = []; this.staticKey = ''; this.sync(); }
  sync() {
    const g = this.g; if (!g) return;
    const seen = new Set();
    for (const p of g.pieces) {
      seen.add(p.id);
      let e = this.vp.get(p.id);
      if (!e) { e = { x: 0, z: 0, y: 0, s: 1, a: 1, halo: 0, lift: 0 }; this.vp.set(p.id, e); [e.x, e.z] = wc(p.x, p.y); }
      Object.assign(e, { k: p.k, o: p.o, dx: p.dx, dy: p.dy, haven: p.haven });
      if (!this.busy.has(p.id)) { [e.x, e.z] = wc(p.x, p.y); e.y = 0; e.s = 1; e.a = 1; }
    }
    for (const id of [...this.vp.keys()]) if (!seen.has(id) && !this.dying.has(id)) this.vp.delete(id);
    for (const [key, w] of this.walls) w.alive = g.walls.has(key) || (w.fall > 0 && w.fall < 1);
    this.staticKey = '';
  }
  setHighlights(h) { this.hl = h || {}; }

  /* ------------ animation ------------ */
  tween(dur, fn) { return new Promise(res => this.tweens.push({ t0: this.t, dur, fn, res })); }
  async play(events) {
    for (const e of events) {
      if (e.t === 'move') {
        const v = this.vp.get(e.id); if (!v) continue;
        this.busy.add(e.id);
        const [fx, fz] = wc(...e.from), [tx, tz] = wc(...e.to), dist = Math.hypot(tx - fx, tz - fz);
        this.fx.move && this.fx.move(e);
        await this.tween(Math.min(0.75, 0.25 + dist * 0.09), t => { const q = ease(t); v.x = fx + (tx - fx) * q; v.z = fz + (tz - fz) * q; v.y = Math.sin(t * Math.PI) * (e.hop ? 0.95 : 0.22); });
        v.y = 0; this.busy.delete(e.id);
      } else if (e.t === 'capture') {
        this.dying.add(e.id); this.busy.add(e.id);
        const v = this.vp.get(e.id); this.fx.capture && this.fx.capture(e); const [x, z] = wc(e.x, e.y); this.burst(x, 0.4, z, 'puff');
        if (v) await this.tween(0.32, t => { v.s = 1 - t * 0.6; v.a = 1 - t; v.y = t * 0.5; });
        this.vp.delete(e.id); this.dying.delete(e.id); this.busy.delete(e.id);
      } else if (e.t === 'fall') {
        this.fx.fall && this.fx.fall(e); this.burnt = this.burnt || new Set(); this.burnt.add(e.realm);
        const [cx, cz] = [this.castles[e.realm].cx, this.castles[e.realm].cz]; this.burst(cx, 1, cz, 'boom');
        for (const id of e.ids) { const v = this.vp.get(id); if (v) { this.dying.add(id); this.busy.add(id); } }
        await this.tween(0.5, t => { for (const id of e.ids) { const v = this.vp.get(id); if (v) { v.a = 1 - t; v.s = 1 - t * 0.5; } } });
        for (const id of e.ids) { this.vp.delete(id); this.dying.delete(id); this.busy.delete(id); }
        this.staticKey = '';
      } else if (e.t === 'promote') {
        const v = this.vp.get(e.id); if (v) { v.k = e.k; this.burst(v.x, 0.6, v.z, 'sparkle'); this.fx.promote && this.fx.promote(e); await this.tween(0.45, t => { v.y = Math.sin(t * Math.PI) * 0.35; }); v.y = 0; }
      } else if (e.t === 'haven') {
        const v = this.vp.get(e.id); if (v) { this.fx.haven && this.fx.haven(e); v.haven = true; this.burst(v.x, 0.5, v.z, 'sparkle'); await this.tween(0.4, t => { v.halo = t; }); v.halo = 1; }
      } else if (e.t === 'bombWall') {
        const w = this.walls.get(e.key); if (w) { w.fall = 0.001; this.fx.bomb && this.fx.bomb(e); this.burst(w.x, 0.3, w.z, 'boom'); await this.tween(0.55, t => { w.fall = Math.max(0.001, t); }); w.alive = false; w.fall = 1; }
      } else if (e.t === 'bombPiece') {
        const v = this.vp.get(e.id); this.dying.add(e.id); this.busy.add(e.id);
        this.fx.bomb && this.fx.bomb(e); if (v) { this.burst(v.x, 0.4, v.z, 'boom'); await this.tween(0.4, t => { v.a = 1 - t; v.s = 1 + t * 0.3; v.y = t * 0.6; }); }
        this.vp.delete(e.id); this.dying.delete(e.id); this.busy.delete(e.id);
      } else if (e.t === 'surrender') {
        this.fx.fall && this.fx.fall(e); const c = this.castles[e.target]; this.burst(c.cx, 1.2, c.cz, 'sparkle'); await this.tween(0.4, () => { });
      }
    }
    this.sync();
  }
  burst(x, y, z, type) { this.effects.push({ x, y, z, t0: this.t, type, seed: Math.random() * 99 }); }

  /* ------------ drawing primitives ------------ */
  _drawMesh(g, mesh, x, y, z, ry = 0, s = 1, alpha = 1, bb = null, tint = 1, lift = 0) {
    const c = Math.cos(ry), sn = Math.sin(ry), cam = this.cam, vis = [];
    for (const f of mesh) {
      const mx = (f.m[0] * c + f.m[2] * sn) * s + x, my = f.m[1] * s + y + lift, mz = (-f.m[0] * sn + f.m[2] * c) * s + z;
      const nx = f.n[0] * c + f.n[2] * sn, ny = f.n[1], nz = -f.n[0] * sn + f.n[2] * c;
      let vx = cam[0] - mx, vy = cam[1] - my, vz = cam[2] - mz; const vl = Math.hypot(vx, vy, vz); vx /= vl; vy /= vl; vz /= vl;
      let d = nx * vx + ny * vy + nz * vz, sg = 1;
      if (d <= 0) { if (!f.ds) continue; sg = -1; d = -d; }
      vis.push([f, mx, my, mz, nx * sg, ny * sg, nz * sg, vx, vy, vz, this.project(mx, my, mz)[2]]);
    }
    vis.sort((a, b) => b[10] - a[10]);
    const A = alpha * 1;
    for (const [f, , , , nx, ny, nz, vx, vy, vz] of vis) {
      const ndl = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      let hx = L[0] + vx, hy = L[1] + vy, hz = L[2] + vz; const hl = Math.hypot(hx, hy, hz) || 1;
      const ndh = Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), spec = f.g * Math.pow(ndh, 28) * 0.9;
      const b = (0.4 + 0.66 * ndl + 0.1 * Math.max(0, ny)) * tint;
      const col = `rgb(${Math.min(255, f.c[0] * b + spec * 255) | 0},${Math.min(255, f.c[1] * b + spec * 255) | 0},${Math.min(255, f.c[2] * b + spec * 255) | 0})`;
      g.beginPath();
      for (let i = 0; i < f.p.length; i++) {
        const p = f.p[i], px = (p[0] * c + p[2] * sn) * s + x, py = p[1] * s + y + lift, pz = (-p[0] * sn + p[2] * c) * s + z, q = this.project(px, py, pz);
        if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
        if (bb) { if (q[0] < bb[0]) bb[0] = q[0]; if (q[0] > bb[2]) bb[2] = q[0]; if (q[1] < bb[1]) bb[1] = q[1]; if (q[1] > bb[3]) bb[3] = q[1]; }
      }
      g.closePath();
      g.globalAlpha = A * f.a; g.fillStyle = col; g.fill(); g.strokeStyle = col; g.lineWidth = 0.7; g.stroke();
    }
    g.globalAlpha = 1;
  }
  _gpoly(g, pts, y = 0.02) { g.beginPath(); pts.forEach(([x, z], i) => { const q = this.project(x, y, z); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.closePath(); }
  _cell(g, cx, cy, inset = 0, y = 0.02) { const [x, z] = wc(cx, cy), h = 0.5 - inset; this._gpoly(g, [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]], y); }
  _wallHull(w) {
    const hz = w.key[0] === 'h', hx = hz ? 0.5 : 0.1, hzz = hz ? 0.1 : 0.5, pts = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0, 0.6]) pts.push(this.project(w.x + sx * hx, y, w.z + sz * hzz));
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (const p of pts.slice().reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }

  /* ------------ static layer (table, base, tiles, decals, frame, labels) ------------ */
  _drawStatic() {
    const key = [this.yaw.toFixed(3), this.elev.toFixed(3), this.k.toFixed(2), this.ox.toFixed(1), this.oy.toFixed(1), this.W, this.H, this.g ? [...this.g.dead].join('') + this.g.players.join('') : ''].join('|');
    if (key === this.staticKey && this.static) return;
    this.staticKey = key;
    if (!this.static) this.static = document.createElement('canvas');
    this.static.width = this.cv.width; this.static.height = this.cv.height;
    const g = this.static.getContext('2d'); g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // base slab
    this._drawMesh(g, box(19.0, 0.5, 19.0, [58, 38, 22], { gloss: 0.2 }), 0, -0.9, 0);
    const T = 9.5, N = 6, st = (2 * T) / N;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x0 = -T + i * st, z0 = -T + j * st, P = [[x0, z0], [x0 + st, z0], [x0 + st, z0 + st], [x0, z0 + st]].map(([x, z]) => this.project(x, -0.4, z));
      texQuad(g, this.woodTex, (i * 512 / N) | 0, (j * 512 / N) | 0, (512 / N) | 0, (512 / N) | 0, P);
    }
    // gold inlay line around the slab
    g.strokeStyle = 'rgba(232,184,64,.75)'; g.lineWidth = 2; this._gpoly(g, [[-9.2, -9.2], [9.2, -9.2], [9.2, 9.2], [-9.2, 9.2]], -0.39); g.stroke();
    // realm blocks + tiles
    this._drawMesh(g, box(12, 0.4, 12, [52, 40, 32], { gloss: 0.1 }), 0, -0.4, 0);
    for (let r = 0; r < 4; r++) {
      const ox = r & 1 ? 6 : 0, oy = r > 1 ? 6 : 0;
      for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) {
        const x0 = ox + i - 6, z0 = oy + j - 6;
        const P = [[x0, z0], [x0 + 1, z0], [x0 + 1, z0 + 1], [x0, z0 + 1]].map(([x, z]) => this.project(x, 0, z));
        texQuad(g, this.terr[r], i * CELL_PX, j * CELL_PX, CELL_PX, CELL_PX, P);
      }
      if (this.g && !this.g.players.includes(r)) { g.fillStyle = 'rgba(20,14,8,.55)'; for (let j = 0; j < 6; j++) for (let i = 0; i < 6; i++) { this._cell(g, ox + i, oy + j, 0); g.fill(); } }
    }
    // gates (golden strips) and promotion / palace-entrance squares
    g.fillStyle = 'rgba(255,214,90,.30)'; g.strokeStyle = 'rgba(255,214,90,.95)'; g.lineWidth = 2; g.setLineDash([6, 4]);
    for (const a of [2, 8]) for (const side of [5, 6]) {
      for (const [cx, cy] of [[side, a], [side, a + 1], [a, side], [a + 1, side]]) { this._cell(g, cx, cy, 0.05); g.fill(); g.stroke(); }
    }
    g.setLineDash([]);
    if (this.g) for (const r of this.g.players) {
      if (this.g.dead.has(r)) continue;
      const h = home(r); g.strokeStyle = '#ffe08a'; g.lineWidth = 3; g.fillStyle = 'rgba(255,224,120,.28)'; this._cell(g, h.cx, h.cy, 0.06); g.fill(); g.stroke();
      g.setLineDash([5, 4]); g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.95)'; g.fillStyle = 'rgba(255,215,90,.30)';
      for (const [a, b] of promoTiles(r)) { this._cell(g, a, b, 0.08); g.fill(); g.stroke(); const [x, z] = wc(a, b), q = this.project(x, 0, z); g.fillStyle = 'rgba(255,255,255,.95)'; g.font = `700 ${Math.round(this.k / this.D * 0.62)}px serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♛', q[0], q[1]); g.fillStyle = 'rgba(255,215,90,.30)'; }
      g.setLineDash([]);
    }
    // gold frame
    const fr = [[0, -6.2, 12.8, 0.4], [0, 6.2, 12.8, 0.4], [-6.2, 0, 0.4, 12.8], [6.2, 0, 0.4, 12.8]]
      .map(([x, z, w, d]) => ({ x, z, w, d, dep: this.project(x, 0, z)[2] })).sort((a, b) => b.dep - a.dep);
    for (const f of fr) this._drawMesh(g, box(f.w, 0.16, f.d, [214, 164, 52], { gloss: 0.7 }), f.x, 0, f.z);
    // coordinate labels
    g.fillStyle = 'rgba(255,236,190,.9)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.max(9, Math.round(this.k / this.D * 0.5))}px Georgia,serif`;
    'ABCDEFGHIJKL'.split('').forEach((l, i) => { for (const z of [-6.75, 6.75]) { const q = this.project(i - 5.5, 0, z); g.fillText(l, q[0], q[1]); } });
    for (let i = 0; i < 12; i++) for (const x of [-6.75, 6.75]) { const q = this.project(x, 0, i - 5.5); g.fillText(String(i + 1), q[0], q[1]); }
  }

  /* ------------ frame ------------ */
  _frame() {
    const dt = 1 / 60, lerp = (a, b, f) => a + (b - a) * f;
    // tweens
    for (let i = this.tweens.length - 1; i >= 0; i--) { const w = this.tweens[i], t = Math.min(1, (this.t - w.t0) / w.dur); w.fn(t); if (t >= 1) { this.tweens.splice(i, 1); w.res(); } }
    this.yaw = lerp(this.yaw, this.yawT, 0.14); if (Math.abs(this.yaw - this.yawT) < 1e-4) this.yaw = this.yawT;
    this.elev = lerp(this.elev, this.elevT, 0.2); this.zoom = lerp(this.zoom, this.zoomT, 0.2);
    this._sync_cam(); this._fit();
    this.k = this._first ? this.kT : lerp(this.k, this.kT, 0.25);
    const e = this._ext, kk = this.k; this.ox = this.W / 2 - kk * (e[0] + e[1]) / 2 + this.panX; this.oy = this.H / 2 - kk * (e[2] + e[3]) / 2 + this.panY; this._first = false;
    this._sync_cam();

    const g = this.ctx; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, this.W, this.H);
    this._drawStatic(); g.drawImage(this.static, 0, 0, this.W, this.H);
    const G = this.g; if (!G) return;
    const pulse = 0.55 + 0.45 * Math.sin(this.t * 5);
    const hl = this.hl;

    // ground highlights
    if (G.last) { g.fillStyle = 'rgba(255,225,90,.38)'; for (const [x, y] of G.last) { this._cell(g, x, y, 0.02); g.fill(); } }
    for (const c of hl.movable || []) { g.strokeStyle = `rgba(80,255,130,${0.55 + 0.45 * pulse})`; g.lineWidth = 3; g.fillStyle = 'rgba(70,255,120,.16)'; this._cell(g, c.x, c.y, 0.04); g.fill(); g.stroke(); }
    if (hl.sel) { g.fillStyle = 'rgba(80,255,130,.38)'; g.strokeStyle = '#27d55e'; g.lineWidth = 3.5; this._cell(g, hl.sel.x, hl.sel.y, 0.02); g.fill(); g.stroke(); }
    for (const c of hl.dots || []) {
      const [x, z] = wc(c.x, c.y);
      if (c.cap) { g.fillStyle = `rgba(255,60,50,${0.22 + 0.2 * pulse})`; g.strokeStyle = '#ff3b30'; g.lineWidth = 3.5; this._cell(g, c.x, c.y, 0.04); g.fill(); g.stroke(); }
      else { this._gpoly(g, Array.from({ length: 20 }, (_, i) => [x + Math.cos(i * 0.314) * (0.17 + 0.03 * pulse), z + Math.sin(i * 0.314) * (0.17 + 0.03 * pulse)])); g.fillStyle = 'rgba(40,220,90,.92)'; g.fill(); g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 1.5; g.stroke(); }
    }
    for (const c of hl.haven || []) { g.strokeStyle = `rgba(90,220,255,${0.5 + 0.5 * pulse})`; g.lineWidth = 3; g.fillStyle = 'rgba(90,220,255,.22)'; this._cell(g, c.x, c.y, 0.04); g.fill(); g.stroke(); }
    for (const c of hl.bombs || []) { g.strokeStyle = `rgba(255,70,50,${0.5 + 0.5 * pulse})`; g.lineWidth = 3.5; g.fillStyle = 'rgba(255,60,40,.28)'; this._cell(g, c.x, c.y, 0.04); g.fill(); g.stroke(); }

    // contact shadows
    g.fillStyle = 'rgba(0,0,0,.30)';
    for (const [id, v] of this.vp) { if (v.a < 0.3) continue; this._gpoly(g, Array.from({ length: 14 }, (_, i) => [v.x + 0.07 + Math.cos(i * 0.4488) * 0.4 * v.s, v.z + 0.09 + Math.sin(i * 0.4488) * 0.4 * v.s]), 0.01); g.fill(); }
    for (const w of this.walls.values()) { if (!w.alive || w.fall) continue; const hz = w.key[0] === 'h'; g.fillStyle = 'rgba(0,0,0,.22)'; const a = hz ? 0.5 : 0.15, b = hz ? 0.15 : 0.5; this._gpoly(g, [[w.x - a + 0.1, w.z - b + 0.12], [w.x + a + 0.1, w.z - b + 0.12], [w.x + a + 0.1, w.z + b + 0.12], [w.x - a + 0.1, w.z + b + 0.12]], 0.01); g.fill(); }

    // collect & sort
    const items = [];
    for (const s of this.scenery) {
      if (s.tag === 'wall' && !s.alive) continue;
      if (s.tag === 'king' && this.burnt && this.burnt.has(s.realm)) continue;
      if (s.tag === 'wall' && s.fall) { items.push({ w: this.project(s.x, 0.3, s.z)[2], s }); continue; }
      items.push({ w: this.project(s.x, 0.3, s.z)[2] + (s.tag === 'castle' ? 0 : 0), s });
    }
    for (const [id, v] of this.vp) items.push({ w: this.project(v.x, v.y + 0.3, v.z)[2], id, v });
    items.sort((a, b) => b.w - a.w);
    this.hits = [];
    const bombW = hl.walls;
    for (const it of items) {
      if (it.s) {
        const s = it.s;
        if (s.tag === 'wall' && s.fall) {
          const f = s.fall; this._drawMesh(g, s.mesh, s.x, -f * 0.7, s.z, 0, 1 - f * 0.2, 1 - f, null, 1);
          continue;
        }
        const burnt = s.realm !== undefined && this.burnt && this.burnt.has(s.realm);
        this._drawMesh(g, s.mesh, s.x, s.y, s.z, 0, 1, 1, null, burnt ? 0.45 : 1);
        if (s.tag === 'wall' && bombW && bombW.has(s.key)) {
          const hull = this._wallHull(s); g.beginPath(); hull.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
          g.fillStyle = `rgba(255,60,40,${0.25 + 0.3 * pulse})`; g.fill(); g.strokeStyle = `rgba(255,90,60,${0.7 + 0.3 * pulse})`; g.lineWidth = 2.5; g.stroke();
        }
      } else {
        const v = it.v, bb = [1e9, 1e9, -1e9, -1e9], sel = hl.sel && this.g.at(hl.sel.x, hl.sel.y) && this.g.at(hl.sel.x, hl.sel.y).id === it.id;
        const ry = v.k === 'N' ? Math.atan2(-v.dy, v.dx) : 0;
        this._drawMesh(g, this._mesh(v.k, v.o), v.x, v.y, v.z, ry, v.s, v.a, bb, 1, sel ? 0.12 + 0.05 * Math.sin(this.t * 6) : 0);
        if (v.haven) { const hv = Math.max(v.halo || 0, 0); this._drawMesh(g, havenMesh(), v.x, v.y, v.z, 0, 1 + 0.03 * Math.sin(this.t * 3), (v.a) * (0.9 + 0.1 * pulse)); }
        if (!this.dying.has(it.id)) this.hits.push({ id: it.id, bb, w: it.w });
      }
    }
    this._drawFx(g, G);
  }
  _drawFx(g, G) {
    // flames over fallen castles
    if (this.burnt) for (const r of this.burnt) {
      const c = this.castles[r];
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9, px = c.cx + Math.cos(a) * 1.1, pz = c.cz + Math.sin(a) * 1.1, ph = this.t * 6 + i * 2, q = this.project(px, 0.8 + Math.sin(ph) * 0.1, pz), sz = this.k / this.D * (0.45 + 0.12 * Math.sin(ph));
        const gr = g.createRadialGradient(q[0], q[1] - sz * 0.4, 0, q[0], q[1] - sz * 0.4, sz); gr.addColorStop(0, 'rgba(255,240,150,.95)'); gr.addColorStop(0.4, 'rgba(255,130,30,.75)'); gr.addColorStop(1, 'rgba(120,20,0,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(q[0], q[1] - sz * 0.5, sz * 0.7, sz * 1.1, 0, 0, 7); g.fill();
      }
    }
    // bursts
    this.effects = this.effects.filter(e => this.t - e.t0 < 0.9);
    for (const e of this.effects) {
      const t = (this.t - e.t0) / 0.9, q = this.project(e.x, e.y, e.z), u = this.k / this.D;
      if (e.type === 'boom') {
        const r = u * (0.4 + t * 1.5), gr = g.createRadialGradient(q[0], q[1], 0, q[0], q[1], r); gr.addColorStop(0, `rgba(255,250,200,${1 - t})`); gr.addColorStop(0.45, `rgba(255,140,30,${0.85 * (1 - t)})`); gr.addColorStop(1, 'rgba(80,20,0,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(q[0], q[1], r, 0, 7); g.fill();
        for (let i = 0; i < 10; i++) { const a = i * 0.628 + e.seed, d = u * t * 1.8, px = q[0] + Math.cos(a) * d, py = q[1] + Math.sin(a) * d * 0.6 + t * t * u * 0.9; g.fillStyle = `rgba(90,80,70,${1 - t})`; g.fillRect(px, py, u * 0.12, u * 0.12); }
      } else if (e.type === 'puff') {
        g.fillStyle = `rgba(255,255,255,${0.7 * (1 - t)})`; for (let i = 0; i < 6; i++) { const a = i * 1.05 + e.seed, d = u * (0.2 + t * 0.7); g.beginPath(); g.arc(q[0] + Math.cos(a) * d, q[1] + Math.sin(a) * d * 0.6 - t * u * 0.4, u * 0.18 * (1 - t * 0.5), 0, 7); g.fill(); }
      } else {
        for (let i = 0; i < 12; i++) { const a = i * 0.52 + e.seed, d = u * (0.15 + t * 0.9), px = q[0] + Math.cos(a) * d, py = q[1] - t * u * 0.9 + Math.sin(a) * d * 0.5; g.fillStyle = `rgba(255,${210 + (i % 3) * 15},90,${1 - t})`; g.beginPath(); g.arc(px, py, u * 0.07, 0, 7); g.fill(); }
      }
    }
  }

  /* ------------ picking & input ------------ */
  pick(px, py, wantWalls) {
    if (wantWalls) {
      let best = null;
      for (const w of this.walls.values()) {
        if (!w.alive || w.fall) continue; const h = this._wallHull(w); let ins = false;
        for (let i = 0, j = h.length - 1; i < h.length; j = i++) { if (((h[i][1] > py) !== (h[j][1] > py)) && (px < (h[j][0] - h[i][0]) * (py - h[i][1]) / (h[j][1] - h[i][1]) + h[i][0])) ins = !ins; }
        if (ins) { const d = this.project(w.x, 0.3, w.z)[2]; if (!best || d < best.d) best = { d, key: w.key }; }
      }
      if (best) return { type: 'wall', key: best.key };
    }
    let hit = null;
    for (const h of this.hits) if (px >= h.bb[0] && px <= h.bb[2] && py >= h.bb[1] && py <= h.bb[3]) { if (!hit || h.w < hit.w) hit = h; }
    if (hit) { const p = this.g.pieces.find(q => q.id === hit.id); if (p) return { type: 'cell', x: p.x, y: p.y }; }
    const [wx, wz] = this.unproject(px, py, 0), x = Math.floor(wx + 6), y = Math.floor(wz + 6);
    if (x < 0 || y < 0 || x >= SZ || y >= SZ) return null;
    return { type: 'cell', x, y };
  }
  _bindInput() {
    const cv = this.cv, ptrs = new Map(); let moved = 0, startD = 0, startZ = 1;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; startD = Math.hypot(a[0] - b[0], a[1] - b[1]); startZ = this.zoomT; } });
    cv.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      const p = ptrs.get(e.pointerId), dx = e.clientX - p[0], dy = e.clientY - p[1];
      ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; this.zoomT = Math.max(0.7, Math.min(2.6, startZ * Math.hypot(a[0] - b[0], a[1] - b[1]) / startD)); this.panX += dx / 2; this.panY += dy / 2; moved = 99; return; }
      if (e.shiftKey || e.buttons === 2) { this.panX += dx; this.panY += dy; moved += 20; return; }
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 8) { this.yawT -= dx * 0.008; this.yaw -= dx * 0.008; this.elevT = Math.max(0.5, Math.min(1.3, this.elevT + dy * 0.004)); this.elev = this.elevT; }
    });
    const up = e => {
      if (!ptrs.has(e.pointerId)) return; const wasOne = ptrs.size === 1; ptrs.delete(e.pointerId);
      if (wasOne && moved <= 8 && e.type === 'pointerup' && this.onTap) { const r = cv.getBoundingClientRect(); this.onTap(e.clientX - r.left, e.clientY - r.top); }
    };
    cv.addEventListener('contextmenu', e => e.preventDefault()); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoomT = Math.max(0.7, Math.min(2.6, this.zoomT * (e.deltaY < 0 ? 1.1 : 0.91))); }, { passive: false });
    new ResizeObserver(() => this.resize()).observe(cv);
  }
}
