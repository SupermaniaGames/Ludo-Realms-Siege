/* Ludo Realms: Siege — rules engine (no DOM, no rendering). */
export const SZ = 12;
export const NAMES = ['Aqua', 'Forest', 'Desert', 'Mountain'];
export const KN = { Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn', K: 'King' };
export const GATES = [2, 3, 8, 9]; // the two 2-tile gates: rows 2-3 / 8-9 in the vertical wall, columns likewise in the horizontal wall
export const home = r => ({ dx: r & 1 ? -1 : 1, dy: r > 1 ? -1 : 1, cx: r & 1 ? 11 : 0, cy: r > 1 ? 11 : 0 });
export const realmAt = (x, y) => (x > 5 ? 1 : 0) + (y > 5 ? 2 : 0);
export const promoTiles = r => { const h = home(r); return [[h.cx + h.dx, h.cy], [h.cx, h.cy + h.dy], [h.cx + h.dx, h.cy + h.dy]]; };

const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KJ = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const inB = (x, y) => x >= 0 && y >= 0 && x < SZ && y < SZ;

export class Game {
  constructor(np) {
    this.players = np === 2 ? [0, 3] : np === 3 ? [0, 1, 3] : [0, 1, 2, 3];
    this.uid = 1;
    this.walls = new Set();
    for (let i = 0; i < SZ; i++) if (!GATES.includes(i)) { this.walls.add('v,' + i); this.walls.add('h,' + i); }
    this.pieces = [];
    // Queen on the corner, Rook below, Bishop beside, Knight at C1, Pawns at C2, C3, A3, B3
    const set = [['Q', 0, 0], ['R', 0, 1], ['B', 1, 0], ['N', 2, 0], ['P', 2, 1], ['P', 2, 2], ['P', 0, 2], ['P', 1, 2]];
    this.players.forEach(r => set.forEach(([k, a, b]) => this.pieces.push(this._mk(r, k, a, b))));
    this.turn = 0; this.phase = 'roll'; this.roll = null; this.msg = ''; this.last = null;
    this.dead = new Set(); this.promoId = null; this.winner = null; this.moveNo = 0;
  }
  _mk(r, k, lx, ly) {
    const h = home(r);
    return { id: this.uid++, k, o: r, x: h.cx + h.dx * lx, y: h.cy + h.dy * ly, dx: h.dx, dy: h.dy, haven: false };
  }
  at(x, y) { return this.pieces.find(p => p.x === x && p.y === y); }
  get cur() { return this.players[this.turn]; }
  alive(r) { return this.players.includes(r) && !this.dead.has(r); }
  count(r) { return this.pieces.filter(p => p.o === r).length; }

  /* ---- walls & movement ---- */
  edgeOpen(x1, y1, x2, y2) {
    if (y1 === y2 && ((x1 === 5 && x2 === 6) || (x1 === 6 && x2 === 5))) return !this.walls.has('v,' + y1);
    if (x1 === x2 && ((y1 === 5 && y2 === 6) || (y1 === 6 && y2 === 5))) return !this.walls.has('h,' + x1);
    return true;
  }
  stepOpen(x, y, nx, ny) {
    if (x === nx || y === ny) return this.edgeOpen(x, y, nx, ny);
    return (this.edgeOpen(x, y, nx, y) && this.edgeOpen(nx, y, nx, ny)) || (this.edgeOpen(x, y, x, ny) && this.edgeOpen(x, ny, nx, ny));
  }
  moves(p, roll) {
    const out = [], n = Math.min(roll, 4);
    const slide = (dirs, max, cap) => {
      for (const [dx, dy] of dirs) {
        let x = p.x, y = p.y;
        for (let s = 1; s <= max; s++) {
          const nx = x + dx, ny = y + dy;
          if (!inB(nx, ny) || !this.stepOpen(x, y, nx, ny)) break;
          const o = this.at(nx, ny);
          if (o) { if (cap && o.o !== p.o && !o.haven) out.push([nx, ny]); break; }
          if (!cap) out.push([nx, ny]); else out.push([nx, ny]);
          x = nx; y = ny;
        }
      }
    };
    if (p.k === 'Q') slide(ORTH.concat(DIAG), n, true);
    else if (p.k === 'R') slide(ORTH, n, true);
    else if (p.k === 'B') slide(DIAG, n, true);
    else if (p.k === 'N') {
      for (const [a, b] of KJ) {
        const nx = p.x + a, ny = p.y + b;
        if (!inB(nx, ny)) continue;
        const o = this.at(nx, ny);
        if (o && (o.o === p.o || o.haven)) continue;
        out.push([nx, ny]);
      }
    } else if (p.k === 'P') {
      slide([[p.dx, 0], [0, p.dy]], Math.min(n, 2), false);
      const nx = p.x + p.dx, ny = p.y + p.dy;
      if (inB(nx, ny) && this.stepOpen(p.x, p.y, nx, ny)) { const o = this.at(nx, ny); if (o && o.o !== p.o && !o.haven) out.push([nx, ny]); }
    }
    return out;
  }
  movable(roll = this.roll) { return this.pieces.filter(p => p.o === this.cur && this.moves(p, roll).length); }
  bombTargets() { return { walls: [...this.walls], havens: this.pieces.filter(p => p.haven && p.o !== this.cur) }; }

  /* ---- dice ---- */
  rollDice(r) {
    this.roll = r; this.msg = '';
    if (r <= 4) this.phase = this.movable(r).length ? 'pick' : 'wait';
    else if (r === 5) { const t = this.bombTargets(); this.phase = t.walls.length || t.havens.length ? 'bomb' : 'wait'; }
    else this.phase = this.pieces.some(p => p.o === this.cur && !p.haven) ? 'haven' : 'wait';
    if (this.phase === 'wait') this.msg = NAMES[this.cur] + ' rolled ' + r + ': no move';
    return this.phase;
  }

  /* ---- actions (each returns a list of events for the renderer) ---- */
  doMove(p, x, y) {
    const ev = [], o = this.at(x, y), from = [p.x, p.y];
    this.last = [from, [x, y]]; this.msg = ''; this.moveNo++;
    ev.push({ t: 'move', id: p.id, from, to: [x, y], hop: p.k === 'N' });
    if (o) {
      this.pieces.splice(this.pieces.indexOf(o), 1);
      ev.push({ t: 'capture', id: o.id, x, y });
      this.msg = NAMES[p.o] + ' captured a ' + KN[o.k];
    }
    p.x = x; p.y = y; p.haven = false;
    for (const r of this.players) {
      const h = home(r);
      if (this.alive(r) && r !== p.o && x === h.cx && y === h.cy) ev.push(...this._fall(r, 'palace stormed'));
    }
    if (o && this.alive(o.o) && !this.count(o.o)) ev.push(...this._fall(o.o, 'army destroyed'));
    if (p.k === 'P' && this.players.some(r => this.alive(r) && r !== p.o && promoTiles(r).some(([a, b]) => a === x && b === y))) {
      this.phase = 'promo'; this.promoId = p.id;
    } else this.phase = 'resolved';
    return ev;
  }
  _fall(r, why) {
    const ids = this.pieces.filter(q => q.o === r).map(q => q.id);
    this.dead.add(r); this.pieces = this.pieces.filter(q => q.o !== r);
    this.msg = NAMES[r] + ' falls: ' + why + '!';
    return [{ t: 'fall', realm: r, ids }];
  }
  promote(k) {
    const p = this.pieces.find(q => q.id === this.promoId);
    p.k = k; this.msg = NAMES[p.o] + ' promoted a Pawn to ' + KN[k] + '!'; this.phase = 'resolved'; this.promoId = null;
    return [{ t: 'promote', id: p.id, k }];
  }
  useHaven(p) {
    p.haven = true; this.msg = NAMES[this.cur] + ' raised a Haven on a ' + KN[p.k]; this.phase = 'resolved';
    return [{ t: 'haven', id: p.id }];
  }
  bombWall(key) {
    this.walls.delete(key); this.msg = NAMES[this.cur] + ' blasted a wall open'; this.phase = 'resolved';
    return [{ t: 'bombWall', key }];
  }
  bombPiece(p) {
    const ev = [{ t: 'bombPiece', id: p.id, x: p.x, y: p.y }], o = p.o;
    this.pieces.splice(this.pieces.indexOf(p), 1);
    this.msg = 'Bomb! ' + NAMES[o] + "'s " + KN[p.k] + ' destroyed';
    if (this.alive(o) && !this.count(o)) ev.push(...this._fall(o, 'army destroyed'));
    this.phase = 'resolved';
    return ev;
  }
  skip() { this.msg = NAMES[this.cur] + ' skipped the turn'; this.phase = 'resolved'; return []; }
  endTurn() {
    const al = this.players.filter(r => this.alive(r));
    if (al.length <= 1) { this.phase = 'over'; this.winner = al[0]; return; }
    let i = this.turn;
    do { i = (i + 1) % this.players.length; } while (!this.alive(this.players[i]));
    this.turn = i; this.phase = 'roll'; this.roll = null;
  }

  /* ---- surrender & vassalage ---- */
  surrenderCandidates() { return this.players.filter(r => this.alive(r) && r !== this.cur && this.count(r) <= 3); }
  surrender(t) {
    const by = this.cur, h = home(t);
    this.pieces.forEach(p => { if (p.o !== t) return; p.o = by; p.haven = false; if (p.k !== 'P') { p.k = 'P'; p.dx = h.dx; p.dy = h.dy; } });
    this.dead.add(t); this.msg = NAMES[t] + ' surrendered to ' + NAMES[by] + '!';
    const ev = [{ t: 'surrender', target: t, by }];
    if (this.players.filter(r => this.alive(r)).length <= 1) { this.phase = 'over'; this.winner = by; }
    return ev;
  }
}
