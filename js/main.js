/* Ludo Realms: Siege — game controller / UI wiring */
import { Game, NAMES, KN, home } from './engine.js';
import { Board3D } from './render.js';
import { REALM_HEX } from './models.js';
import { sfx, setMuted, isMuted } from './audio.js';
import { emblem, pieceIcon, dieFace } from './icons.js';

const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let game = null, busy = false, sel = null, np = 4, toastT = 0;

const board = new Board3D($('#cv'), { move: () => sfx.move(), capture: () => sfx.capture(), bomb: () => sfx.bomb(), haven: () => sfx.haven(), promote: () => sfx.promote(), fall: () => sfx.fall() });
window.__board = board;

/* ---------- static UI ---------- */
$('#faces').innerHTML = [1, 2, 3, 4, 5, 6].map(v => dieFace(v)).join('');
const LEG = [['K', 'King', 'Stays in the palace, only watches'], ['Q', 'Queen', 'Any direction'], ['R', 'Rook', 'Straight lines'], ['B', 'Bishop', 'Diagonals'], ['N', 'Knight', 'L-jump over walls'], ['P', 'Pawn', '1–2 forward · promotes']];
$('#legend').innerHTML = LEG.map(([k, n, d]) => `<li>${pieceIcon(k, '#6a4a1c', 24)}<div><b>${n}</b><small>${d}</small></div></li>`).join('');

/* ---------- helpers ---------- */
function toast(msg) {
  if (!msg) return; const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
}
function modal(title, bodyHtml, buttons) {
  $('#mt').textContent = title; $('#mb').innerHTML = bodyHtml; const bx = $('#mbtn'); bx.innerHTML = '';
  for (const b of buttons) {
    const e = document.createElement('button'); e.className = 'act ' + (b.cls || 'slate'); e.textContent = b.t;
    e.onclick = () => { $('#modal').hidden = true; b.f && b.f(); }; bx.append(e);
  }
  $('#modal').hidden = false;
}
const RULES = `<ul>
<li><b>Your army:</b> Queen on your corner, Rook, Bishop, Knight and 4 Pawns around her. Your <b>King</b> waits in the castle outside the board and only watches.</li>
<li><b>Roll 1–4:</b> move one piece. Queen, Rook and Bishop slide up to that many squares, the Knight jumps in an L (over walls too), Pawns go 1–2 squares forward and capture diagonally.</li>
<li><b>Roll 5 💣 Breaker:</b> blast a wall open, or destroy an enemy piece inside a Haven.</li>
<li><b>Roll 6 🛡️ Haven:</b> shield one of your pieces from normal attacks until it moves.</li>
<li><b>Walls:</b> each realm is walled in. Only the two 2-square gates let pieces through.</li>
<li><b>Storm the castle:</b> land on an enemy's corner square and that kingdom falls.</li>
<li><b>Promotion:</b> a Pawn reaching one of the 3 crowned squares beside an enemy castle becomes a Queen, Rook, Bishop or Knight.</li>
<li><b>Surrender:</b> demand it from a kingdom with 3 pieces or fewer. If it yields, its army becomes your Pawns.</li>
<li><b>Win</b> by being the last kingdom standing.</li></ul>`;

/* ---------- state → UI ---------- */
const HINT = { roll: 'Roll the dice', pick: 'Tap a glowing piece, then a spot', bomb: 'Breaker! Tap a wall or an enemy Haven', haven: 'Haven! Tap one of your pieces', wait: '', promo: 'Choose a promotion', over: 'Game over', resolved: '' };
function refresh() {
  if (!game) return;
  const g = game, me = g.cur, over = g.phase === 'over';
  $('#ribbon').style.setProperty('--rc', over ? '#6b4a1c' : REALM_HEX[me]);
  $('#ribIcon').innerHTML = over ? '🏆' : emblem(me, 22);
  $('#ribText').textContent = over ? NAMES[g.winner] + ' wins!' : NAMES[me] + "'s Turn";
  $('#plist').innerHTML = g.players.map(r => `<li class="${r === me && !over ? 'cur' : ''} ${g.dead.has(r) ? 'out' : ''}">${emblem(r, 30)}<div><b>${NAMES[r]}</b><small>${g.dead.has(r) ? 'fallen' : g.count(r) + ' pieces'}</small></div></li>`).join('');
  $('#kingdoms').innerHTML = [0, 1, 2, 3].map(r => {
    const on = g.players.includes(r), c = g.count(r);
    return `<div class="kc ${on ? '' : 'off'} ${r === me && !over && on ? 'cur' : ''} ${g.dead.has(r) ? 'out' : ''}" style="--c:${REALM_HEX[r]}">${emblem(r, 30)}<div class="meta"><div class="nm">${NAMES[r]}</div><div class="cnt">${on ? (g.dead.has(r) ? 'fallen' : c + ' pieces') : '—'}</div><div class="bar">${Array.from({ length: 8 }, (_, i) => `<i class="${on && i < Math.min(c, 8) ? 'on' : ''}"></i>`).join('')}</div></div>${pieceIcon('K', REALM_HEX[r], 26)}</div>`;
  }).join('');
  const can = !busy && g.phase === 'roll';
  $('#roll').disabled = !can; $('#roll').classList.toggle('glow', can);
  $('#surr').disabled = !can || !g.surrenderCandidates().length;
  $('#skip').disabled = busy || !['pick', 'bomb', 'haven'].includes(g.phase);
  if (g.roll != null && !$('#die').classList.contains('roll')) $('#die').innerHTML = dieFace(g.roll);
  $('#hint').textContent = busy && g.phase === 'roll' ? '' : (HINT[g.phase] || '');
  highlights();
}
function highlights() {
  const g = game, h = {};
  if (!busy) {
    if (g.phase === 'pick') {
      const sp = sel && g.pieces.find(p => p.id === sel);
      h.movable = g.movable().filter(p => !sp || p.id !== sp.id).map(p => ({ x: p.x, y: p.y }));
      if (sp) { h.sel = { x: sp.x, y: sp.y }; h.dots = g.moves(sp, g.roll).map(([x, y]) => ({ x, y, cap: !!g.at(x, y) })); }
    } else if (g.phase === 'haven') h.haven = g.pieces.filter(p => p.o === g.cur && !p.haven).map(p => ({ x: p.x, y: p.y }));
    else if (g.phase === 'bomb') { const t = g.bombTargets(); h.walls = new Set(t.walls); h.bombs = t.havens.map(p => ({ x: p.x, y: p.y })); }
  }
  board.setHighlights(h);
}

/* ---------- turn flow ---------- */
async function act(events) {
  busy = true; sel = null; board.setHighlights({}); refresh();
  await board.play(events);
  if (game.phase === 'promo') { busy = false; refresh(); promoDialog(); return; }
  await finish();
}
async function finish() {
  game.endTurn(); busy = false;
  if (game.msg) toast(game.msg);
  refresh();
  if (game.phase === 'over') { sfx.win(); await sleep(700); winDialog(); }
}
async function roll() {
  if (busy || !game || game.phase !== 'roll') return;
  busy = true; sfx.dice(); $('#roll').disabled = true; $('#hint').textContent = '';
  const d = $('#die'); d.classList.add('roll');
  const t0 = performance.now(); while (performance.now() - t0 < 750) { d.innerHTML = dieFace(1 + (Math.random() * 6 | 0)); await sleep(70); }
  d.classList.remove('roll');
  const r = 1 + (Math.random() * 6 | 0), ph = game.rollDice(r);
  d.innerHTML = dieFace(r);
  if (ph === 'wait') { toast(game.msg); refresh(); await sleep(1300); await finish(); return; }
  busy = false; refresh();
}
function onTap(px, py) {
  if (!game || busy || !$('#modal').hidden || !$('#menu').hidden) return;
  const g = game, hit = board.pick(px, py, g.phase === 'bomb');
  if (!hit) return;
  if (g.phase === 'pick' && hit.type === 'cell') {
    const p = g.at(hit.x, hit.y), sp = sel && g.pieces.find(q => q.id === sel);
    if (sp && g.moves(sp, g.roll).some(([x, y]) => x === hit.x && y === hit.y)) return act(g.doMove(sp, hit.x, hit.y));
    if (p && p.o === g.cur && g.moves(p, g.roll).length) { sel = sel === p.id ? null : p.id; sfx.click(); refresh(); }
    else if (sel) { sel = null; refresh(); }
  } else if (g.phase === 'haven' && hit.type === 'cell') {
    const p = g.at(hit.x, hit.y); if (p && p.o === g.cur && !p.haven) act(g.useHaven(p));
  } else if (g.phase === 'bomb') {
    if (hit.type === 'wall') act(g.bombWall(hit.key));
    else { const p = g.at(hit.x, hit.y); if (p && p.haven && p.o !== g.cur) act(g.bombPiece(p)); }
  }
}
board.onTap = onTap;

function promoDialog() {
  const p = game.pieces.find(q => q.id === game.promoId);
  const html = `<p>Your Pawn reached an enemy castle. Choose its new rank:</p><div class="pick">${['Q', 'R', 'B', 'N'].map(k => `<button data-k="${k}">${pieceIcon(k, REALM_HEX[p.o], 40)}${KN[k]}</button>`).join('')}</div>`;
  modal('♟ Pawn promotion', html, []);
  $('#mb').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    $('#modal').hidden = true; $('#mb').onclick = null; busy = true;
    await board.play(game.promote(b.dataset.k)); await finish();
  };
}
function winDialog() {
  modal('🏆 ' + NAMES[game.winner] + ' wins!', '<p style="text-align:center">The last kingdom standing.</p>', [{ t: 'Play again', cls: 'gold', f: () => start(np) }, { t: 'Menu', f: toMenu }]);
}
function surrenderDialog() {
  if (!game || busy || game.phase !== 'roll') return;
  const c = game.surrenderCandidates();
  if (!c.length) return modal('Not yet', '<p>You can only demand surrender from a kingdom with 3 pieces or fewer.</p>', [{ t: 'OK', cls: 'gold' }]);
  modal('🏳 Demand surrender', '<p>Choose the kingdom:</p>', c.map(r => ({ t: NAMES[r] + ' (' + game.count(r) + ')', cls: 'blue', f: () => confirmSurrender(r) })).concat([{ t: 'Cancel' }]));
}
function confirmSurrender(t) {
  const by = game.cur;
  modal('🏳 ' + NAMES[t] + ', surrender?', `<p>${NAMES[by]} demands your surrender. Your Queen, Rook, Bishop and Knight would all become Pawns serving ${NAMES[by]}.</p>`, [
    { t: 'Fight on' },
    { t: 'Surrender', cls: 'red', f: async () => { await act(game.surrender(t)); } },
  ]);
}

/* ---------- start / menu ---------- */
function start(n) {
  np = n; game = new Game(n); sel = null; busy = false;
  board.setGame(game); board.resetView(); $('#menu').hidden = true; $('#die').innerHTML = dieFace(1); refresh(); sfx.promote();
}
function toMenu() { game = null; $('#menu').hidden = false; }
$('#np').onclick = e => { const b = e.target.closest('button'); if (b) [...$('#np').children].forEach(c => c.classList.toggle('on', c === b)); };
$('#start').onclick = () => start(+document.querySelector('#np .on').dataset.v);
$('#howto').onclick = () => modal('How to play', RULES, [{ t: 'Got it', cls: 'gold' }]);
$('#roll').onclick = roll;
$('#surr').onclick = surrenderDialog;
$('#skip').onclick = () => { if (!busy && game && ['pick', 'bomb', 'haven'].includes(game.phase)) act(game.skip()).then(() => {}); };
$('#vl').onclick = () => board.rotate(-1);
$('#vr').onclick = () => board.rotate(1);
$('#vh').onclick = () => board.resetView();
const snd = () => { $('#snd').textContent = isMuted() ? '🔇' : '🔊'; };
$('#snd').onclick = () => { setMuted(!isMuted()); snd(); sfx.click(); };
snd();
addEventListener('keydown', e => { if (e.code === 'Space' && game && !busy && game.phase === 'roll' && $('#modal').hidden && $('#menu').hidden) { e.preventDefault(); roll(); } });

/* back button: ask before leaving a running game */
history.replaceState({ lrs: 0 }, '');
addEventListener('popstate', () => { history.pushState({ lrs: 1 }, ''); if (game && game.phase !== 'over' && $('#modal').hidden) modal('Leave game?', '<p>Your game will be lost.</p>', [{ t: 'Stay', cls: 'gold' }, { t: 'Leave', cls: 'red', f: toMenu }]); });
document.addEventListener('pointerdown', () => { if (!history.state || history.state.lrs !== 1) history.pushState({ lrs: 1 }, ''); }, { once: true });

/* ---------- service worker: always prefer the network ---------- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => {
    r.update(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') r.update(); });
  }).catch(() => { });
  let had = !!navigator.serviceWorker.controller, reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } had = true; });
}
