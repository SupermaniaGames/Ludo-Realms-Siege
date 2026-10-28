/* Ludo Realms: Siege — rules engine (no DOM, no rendering). */
export const SZ = 12;
export const NAMES = ['Aqua', 'Forest', 'Desert', 'Mountain'];
export const KN = { Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn', K: 'King' };
export const GATES = [2, 3, 8, 9]; // the two 2-tile gates: rows 2-3 / 8-9 in the vertical wall, columns likewise in the horizontal wall
export const home = r => ({ dx: r & 1 ? -1 : 1, dy: r > 1 ? -1 : 1, cx: r & 1 ? 11 : 0, cy: r > 1 ? 11 : 0 });
export const realmAt = (x, y) => (x > 5 ? 1 : 0) + (y > 5 ? 2 : 0);
export const promoTiles = r => { const h = home(r); return [[h.cx + h.dx, h.cy], [h.cx, h.cy + h.dy], [h.cx + h.dx, h.cy + h.dy]]; };
/** the 4 squares "next to the castle": the entrance square + the 3 crowned squares */
export const castleSquares = r => { const h = home(r); return [[h.cx, h.cy], ...promoTiles(r)]; };

const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KJ = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];
const inB = (x, y) => x >= 0 && y >= 0 && x < SZ && y < SZ;
const pk = (a, b) => (a < b ? a + '-' + b : b + '-' + a);

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
    this.dead = new Set(); this.fallen = {}; this.allies = new Set(); this.diploUsed = false;
    this.promoId = null; this.winner = null; this.winners = []; this.moveNo = 0; this.rollSeq = 0;
  }
  _mk(r, k, lx, ly) {
    const h = home(r);
    return { id: this.uid++, k, o: r, x: h.cx + h.dx * lx, y: h.cy + h.dy * ly, dx: h.dx, dy: h.dy, haven: false };
  }
  at(x, y) { return this.pieces.find(p => p.x === x && p.y === y); }
  get cur() { return this.players[this.turn]; }
  alive(r) { return this.players.includes(r) && !this.dead.has(r); }
  count(r) { return this.pieces.filter(p => p.o === r).length; }
  allied(a, b) { return a !== b && this.allies.has(pk(a, b)); }
  alliesOf(r) { return this.players.filter(q => this.allied(q, r)); }
  /** can piece p capture piece o? (enemy, not an ally, not inside a Haven) */
  canTake(p, o) { return o.o !== p.o && !this.allied(o.o, p.o) && !o.haven; }

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
  /* a knight leaps over pieces, but NOT through walls: one of its two L-routes must be wall-free */
  _lRoute(x, y, a, b, xFirst) {
    let cx = x, cy = y;
    const seg = (dx, dy, n) => { for (let i = 0; i < n; i++) { const nx = cx + dx, ny = cy + dy; if (!this.edgeOpen(cx, cy, nx, ny)) return false; cx = nx; cy = ny; } return true; };
    const sx = Math.sign(a), sy = Math.sign(b), ax = Math.abs(a), ay = Math.abs(b);
    return xFirst ? seg(sx, 0, ax) && seg(0, sy, ay) : seg(0, sy, ay) && seg(sx, 0, ax);
  }
  /** the Knight always makes exactly one classic L-jump; any roll 1-4 just gives it permission */
  static knightHops(roll) { return 1; }
  /** every legal destination with the route the piece takes: [{to:[x,y], path:[[x,y],...]}] (path starts at the piece) */
  routes(p, roll) {
    const out = [], n = Math.min(roll, 4), start = [p.x, p.y];
    const slide = (dirs, max, cap) => {
      for (const [dx, dy] of dirs) {
        let x = p.x, y = p.y; const path = [start];
        for (let s = 1; s <= max; s++) {
          const nx = x + dx, ny = y + dy;
          if (!inB(nx, ny) || !this.stepOpen(x, y, nx, ny)) break;
          path.push([nx, ny]);
          const o = this.at(nx, ny);
          if (o) { if (cap && this.canTake(p, o)) out.push({ to: [nx, ny], path: path.slice() }); break; }
          out.push({ to: [nx, ny], path: path.slice() });
          x = nx; y = ny;
        }
      }
    };
    if (p.k === 'Q') slide(ORTH.concat(DIAG), n, true);
    else if (p.k === 'R') slide(ORTH, n, true);
    else if (p.k === 'B') slide(DIAG, n, true);
    else if (p.k === 'N') {
      const hops = Game.knightHops(roll), seen = new Set([p.x + ',' + p.y]);
      let frontier = [{ x: p.x, y: p.y, pts: [start] }];
      for (let h = 0; h < hops; h++) {
        const next = [];
        for (const { x, y, pts } of frontier) for (const [a, b] of KJ) {
          const nx = x + a, ny = y + b, key = nx + ',' + ny;
          if (!inB(nx, ny) || seen.has(key)) continue;
          const xf = this._lRoute(x, y, a, b, true);
          if (!(xf || this._lRoute(x, y, a, b, false))) continue;
          const path = pts.concat([xf ? [x + a, y] : [x, y + b]], [[nx, ny]]);
          const o = this.at(nx, ny);
          if (o) { if (this.canTake(p, o)) { out.push({ to: [nx, ny], path }); seen.add(key); } continue; }  // lands to capture; cannot hop on from there
          seen.add(key); out.push({ to: [nx, ny], path }); next.push({ x: nx, y: ny, pts: path });
        }
        frontier = next;
      }
    } else if (p.k === 'P') {
      slide([[p.dx, 0], [0, p.dy]], Math.min(n, 2), false);
      const nx = p.x + p.dx, ny = p.y + p.dy;
      if (inB(nx, ny) && this.stepOpen(p.x, p.y, nx, ny)) { const o = this.at(nx, ny); if (o && this.canTake(p, o)) out.push({ to: [nx, ny], path: [start, [nx, ny]] }); }
    }
    return out;
  }
  moves(p, roll) { return this.routes(p, roll).map(r => r.to); }
  movable(roll = this.roll) { return this.pieces.filter(p => p.o === this.cur && this.moves(p, roll).length); }

  /* ---- Breaker (dice 5): only things right NEXT to one of your pieces ---- */
  bombTargets() {
    const me = this.cur, mine = this.pieces.filter(p => p.o === me);
    const adj = (m, x, y) => Math.max(Math.abs(m.x - x), Math.abs(m.y - y)) === 1;
    const havens = this.pieces.filter(p => p.haven && p.o !== me && !this.allied(p.o, me) && mine.some(m => adj(m, p.x, p.y)));
    const walls = [...this.walls].filter(key => {
      const [t, i] = key.split(','), n = +i;
      const cells = t === 'v' ? [[5, n], [6, n]] : [[n, 5], [n, 6]];
      return mine.some(m => cells.some(([a, b]) => m.x === a && m.y === b));
    });
    const castles = this.players.filter(r => this.alive(r) && r !== me && !this.allied(r, me) && mine.some(m => castleSquares(r).some(([a, b]) => m.x === a && m.y === b)));
    return { havens, walls, castles };
  }
  hasBombTarget() { const t = this.bombTargets(); return !!(t.havens.length || t.walls.length || t.castles.length); }

  /* ---- dice ---- */
  rollDice(r) {
    this.roll = r; this.msg = ''; this.rollSeq++;
    if (r <= 4) this.phase = this.movable(r).length ? 'pick' : 'wait';
    else if (r === 5) this.phase = this.hasBombTarget() ? 'bomb' : 'wait';
    else this.phase = this.pieces.some(p => p.o === this.cur && !p.haven) ? 'haven' : 'wait';
    if (this.phase === 'wait') this.msg = NAMES[this.cur] + ' rolled ' + r + (r === 5 ? ': nothing in reach to blast' : ': no move');
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
    if (o && this.alive(o.o) && !this.count(o.o)) ev.push(...this._fall(o.o, 'army destroyed'));
    if (p.k === 'P' && this.players.some(r => this.alive(r) && r !== p.o && !this.allied(r, p.o) && promoTiles(r).some(([a, b]) => a === x && b === y))) {
      this.phase = 'promo'; this.promoId = p.id;
    } else this.phase = 'resolved';
    return ev;
  }
  _fall(r, why) {
    const ids = this.pieces.filter(q => q.o === r).map(q => q.id);
    this.dead.add(r); this.fallen[r] = { how: 'destroyed' }; this.pieces = this.pieces.filter(q => q.o !== r);
    this._dropAllies(r);
    this.msg = NAMES[r] + ' falls: ' + why + '!';
    return [{ t: 'fall', realm: r, ids }];
  }
  _dropAllies(r) { for (const k of [...this.allies]) if (k.split('-').includes(String(r))) this.allies.delete(k); }
  /** the captor takes control of a kingdom: every piece becomes one of his Pawns */
  _conquer(t, by, how) {
    const h = home(t);
    this.pieces.forEach(p => { if (p.o !== t) return; p.o = by; p.haven = false; if (p.k !== 'P') { p.k = 'P'; p.dx = h.dx; p.dy = h.dy; } });
    this.dead.add(t); this.fallen[t] = { how, by }; this._dropAllies(t);
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
  /** blast an enemy castle: that kingdom is conquered and its army serves the captor */
  bombCastle(r) {
    const by = this.cur;
    this._conquer(r, by, 'conquered');
    this.msg = NAMES[by] + ' blasted the castle of ' + NAMES[r] + ' and took control of the kingdom!';
    this.phase = 'resolved';
    return [{ t: 'bombCastle', realm: r, by }];
  }
  skip() { this.msg = NAMES[this.cur] + ' skipped the turn'; this.phase = 'resolved'; return []; }
  _checkOver() {
    const al = this.players.filter(r => this.alive(r));
    const teamOnly = al.every((a, i) => al.every((b, j) => i === j || this.allied(a, b)));
    if (al.length <= 1 || teamOnly) { this.phase = 'over'; this.winner = al[0]; this.winners = al; return true; }
    return false;
  }
  endTurn() {
    this.diploUsed = false;
    if (this._checkOver()) return;
    let i = this.turn;
    do { i = (i + 1) % this.players.length; } while (!this.alive(this.players[i]));
    this.turn = i; this.phase = 'roll'; this.roll = null;
  }

  /* ---- diplomacy: alliance & surrender (asked before you roll, once per turn) ---- */
  canDiplomacy() { return this.phase === 'roll' && !this.diploUsed; }
  diploTargets() { return this.players.filter(r => this.alive(r) && r !== this.cur); }
  ally(a, b) { this.allies.add(pk(a, b)); this.msg = NAMES[a] + ' and ' + NAMES[b] + ' are now allies!'; this._checkOver(); }
  breakAlly(a, b) { this.allies.delete(pk(a, b)); this.msg = NAMES[a] + ' broke the alliance with ' + NAMES[b] + '!'; }
  surrender(t) {
    const by = this.cur;
    this._conquer(t, by, 'surrender');
    this.msg = NAMES[t] + ' surrendered to ' + NAMES[by] + '!';
    this._checkOver();
    return [{ t: 'surrender', target: t, by }];
  }

  /* ---- (de)serialisation for online play ---- */
  toJSON() {
    return { players: this.players, uid: this.uid, walls: [...this.walls], pieces: this.pieces, turn: this.turn, phase: this.phase, roll: this.roll, msg: this.msg, last: this.last, dead: [...this.dead], fallen: this.fallen, allies: [...this.allies], diploUsed: this.diploUsed, promoId: this.promoId, winner: this.winner, winners: this.winners, moveNo: this.moveNo, rollSeq: this.rollSeq };
  }
  static from(o) {
    const g = Object.create(Game.prototype);
    Object.assign(g, o, { walls: new Set(o.walls), dead: new Set(o.dead), allies: new Set(o.allies) });
    return g;
  }
}
