/* Computer opponent: greedy 1-ply search with a small danger check. */
import { Game, KN, castleSquares, promoTiles } from './engine.js';

const VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
const rnd = a => a[Math.random() * a.length | 0];

function enemyCastles(g, me) { return g.players.filter(r => g.alive(r) && r !== me && !g.allied(r, me)); }

function danger(g, p, x, y) {
  const ox = p.x, oy = p.y; p.x = x; p.y = y; let hit = false;
  const old = g.at.bind(g);
  for (const e of g.pieces) {
    if (e.o === p.o || g.allied(e.o, p.o) || e.k === 'K') continue;
    if (Math.abs(e.x - x) > 5 || Math.abs(e.y - y) > 5) continue;
    if (g.routes(e, 4).some(r => r.to[0] === x && r.to[1] === y)) { hit = true; break; }
  }
  p.x = ox; p.y = oy; return hit;
}

function advance(g, p, x, y) {
  let best = 99;
  for (const r of enemyCastles(g, p.o)) for (const [a, b] of promoTiles(r)) best = Math.min(best, Math.abs(a - x) + Math.abs(b - y));
  return best;
}

export function chooseMove(g) {
  const me = g.cur, list = [];
  for (const p of g.movable()) for (const r of g.routes(p, g.roll)) {
    const [x, y] = r.to, t = g.at(x, y);
    let s = Math.random() * 0.6;
    if (t) s += 3 + VAL[t.k] * 2 - (t.haven ? 99 : 0);
    const d0 = advance(g, p, p.x, p.y), d1 = advance(g, p, x, y);
    s += (d0 - d1) * (p.k === 'P' ? 0.9 : 0.35);
    if (p.k === 'P' && d1 === 0) s += 6;
    if (danger(g, p, x, y)) s -= VAL[p.k] * 1.6 + (t ? VAL[t.k] * 0.6 : 0);
    if (danger(g, p, p.x, p.y)) s += VAL[p.k] * 0.8;
    if (p.k === 'Q' && g.moveNo < 8) s -= 0.8;
    list.push({ p, to: r.to, s });
  }
  list.sort((a, b) => b.s - a.s);
  return list[0];
}

/** returns {type:'castle',realm} | {type:'piece',p} | {type:'wall',key} | {type:'haven',p} | {type:'skip'} */
export function chooseSpecial(g) {
  if (g.roll === 5) {
    const t = g.bombTargets();
    if (t.castles.length) return { type: 'castle', realm: t.castles[0] };
    if (t.havens.length) return { type: 'piece', p: t.havens[0] };
    if (t.walls.length && Math.random() < 0.55) return { type: 'wall', key: rnd(t.walls) };
    return { type: 'skip' };
  }
  const mine = g.pieces.filter(p => p.o === g.cur && !p.haven && p.k !== 'K');
  if (!mine.length) return { type: 'skip' };
  mine.sort((a, b) => (danger(g, b, b.x, b.y) - danger(g, a, a.x, a.y)) || (VAL[b.k] - VAL[a.k]));
  return { type: 'haven', p: mine[0] };
}

export const choosePromo = () => 'Q';

/** does the bot accept a request from `from` to `to`? kind: 'ally' | 'surrender' */
export function answer(g, kind, from, to) {
  const a = g.count(from), b = g.count(to);
  if (kind === 'surrender') return b <= 2 && a >= b * 3;
  if (kind === 'ally') return !g.allied(from, to) && a <= b * 1.4 && Math.random() < 0.55;
  return true;
}
