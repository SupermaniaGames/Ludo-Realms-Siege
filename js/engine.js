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

export const COST = { train: 3, haven: 4, N: 5, B: 5, R: 7, Q: 12 };
export const LOOT = { P: 1, N: 2, B: 2, R: 3, Q: 5, K: 0 };
const TRAIN_ORDER = [[0, 0], [1, 0], [0, 1], [1, 1], [2, 0], [0, 2], [2, 1], [1, 2], [2, 2]];
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
    for (let i = 0; i < SZ; i++) { this.walls.add('v,' + i); this.walls.add('h,' + i); }   // gate rows hold barred DOORS (2 tiles wide)
    this.pieces = [];
    // Queen on the corner, Rook below, Bishop beside, Knight at C1, Pawns at C2, C3, A3, B3
    const set = [['Q', 0, 0], ['R', 0, 1], ['B', 1, 0], ['N', 2, 0], ['P', 2, 1], ['P', 2, 2], ['P', 0, 2], ['P', 1, 2]];
    this.players.forEach(r => set.forEach(([k, a, b]) => this.pieces.push(this._mk(r, k, a, b))));
    this.turn = 0; this.phase = 'roll'; this.roll = null; this.msg = ''; this.last = null;
    this.dead = new Set(); this.fallen = {}; this.allies = new Set(); this.diploUsed = false;
    this.promoId = null; this.winner = null; this.winners = []; this.moveNo = 0; this.rollSeq = 0;
    // economy: gold, mines (2 per kingdom + 4 contested vaults in the centre), one barracks action per turn
    this.gold = {}; this.players.forEach(r => { this.gold[r] = 3; }); this.shopUsed = false; this.income = null;
    this.mines = [];
    this.players.forEach(r => { const h = home(r); [[4, 1], [1, 4]].forEach(([a, b]) => this.mines.push({ x: h.cx + h.dx * a, y: h.cy + h.dy * b, realm: r })); });
    [[5, 5], [6, 5], [5, 6], [6, 6]].forEach(([x, y]) => this.mines.push({ x, y, realm: -1 }));
  }
  /** gold a kingdom earns at the start of its turn: 2 base + its mines (not while an enemy stands on them) + enemy mines / vaults it occupies */
  incomeFor(r) {
    let g = 2;
    for (const m of this.mines) {
      const occ = this.at(m.x, m.y);
      if (m.realm === r) { if (!occ || occ.o === r || this.allied(occ.o, r)) g += 1; }
      else if (occ && occ.o === r) g += m.realm === -1 ? 2 : 1;
    }
    return g;
  }
  canShop() { return this.phase === 'roll' && !this.shopUsed; }
  trainCell() {
    const r = this.cur, h = home(r);
    for (const [a, b] of TRAIN_ORDER) { const x = h.cx + h.dx * a, y = h.cy + h.dy * b; if (!this.at(x, y)) return [x, y]; }
    return null;
  }
  train() {
    const r = this.cur, c = this.trainCell();
    if (this.gold[r] < COST.train || !c || this.count(r) >= 16) return null;
    const h = home(r), p = { id: this.uid++, k: 'P', o: r, x: c[0], y: c[1], dx: h.dx, dy: h.dy, haven: false };
    this.pieces.push(p); this.gold[r] -= COST.train; this.shopUsed = true; this.msg = NAMES[r] + ' trained a Pawn';
    return [{ t: 'train', id: p.id, x: p.x, y: p.y }];
  }
  upgrade(p, k) {
    const r = this.cur;
    if (p.o !== r || p.k !== 'P' || !COST[k] || this.gold[r] < COST[k]) return null;
    this.gold[r] -= COST[k]; p.k = k; this.shopUsed = true; this.msg = NAMES[r] + ' upgraded a Pawn to ' + KN[k];
    return [{ t: 'promote', id: p.id, k }];
  }
  buyHaven(p) {
    const r = this.cur;
    if (p.o !== r || p.haven || this.gold[r] < COST.haven) return null;
    this.gold[r] -= COST.haven; p.haven = true; this.shopUsed = true; this.msg = NAMES[r] + ' bought a Haven';
    return [{ t: 'haven', id: p.id }];
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
      this.gold[p.o] = (this.gold[p.o] || 0) + LOOT[o.k];
      this.msg = NAMES[p.o] + ' captured a ' + KN[o.k] + ' (+' + LOOT[o.k] + ' gold)';
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
    this.mines.forEach(m => { if (m.realm === r) m.realm = -1; }); this.gold[r] = 0;
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
    this.gold[by] += this.gold[t] || 0; this.gold[t] = 0; this.mines.forEach(m => { if (m.realm === t) m.realm = by; });
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
    const [t, i] = key.split(','), n = +i, door = GATES.includes(n), keys = door ? [key, t + ',' + (n ^ 1)] : [key];
    keys.forEach(k => this.walls.delete(k));
    this.msg = NAMES[this.cur] + (door ? ' smashed a gate door open!' : ' blasted a wall open'); this.phase = 'resolved';
    return keys.map(k => ({ t: 'bombWall', key: k }));
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
    this.turn = i; this.phase = 'roll'; this.roll = null; this.shopUsed = false;
    const inc = this.incomeFor(this.cur); this.gold[this.cur] += inc; this.income = { realm: this.cur, amt: inc };
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
    return { players: this.players, uid: this.uid, walls: [...this.walls], pieces: this.pieces, turn: this.turn, phase: this.phase, roll: this.roll, msg: this.msg, last: this.last, dead: [...this.dead], fallen: this.fallen, allies: [...this.allies], diploUsed: this.diploUsed, promoId: this.promoId, winner: this.winner, winners: this.winners, moveNo: this.moveNo, rollSeq: this.rollSeq, gold: this.gold, mines: this.mines, shopUsed: this.shopUsed, income: this.income };
  }
  static from(o) {
    const g = Object.create(Game.prototype);
    Object.assign(g, o, { walls: new Set(o.walls), dead: new Set(o.dead), allies: new Set(o.allies) });
    return g;
  }
}
