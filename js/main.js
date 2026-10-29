/* Ludo Realms: Siege — game controller / UI wiring */
import { Game, NAMES, KN, home, COST } from './engine.js';
import { Board3D } from './render.js';
import { REALM_HEX } from './models.js';
import { sfx, setMuted, isMuted } from './audio.js';
import { emblem, pieceIcon, dieFace } from './icons.js';
import { room, uid, backend } from './net.js';
import * as bot from './bot.js';

const $ = s => document.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LS = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } } };

let pend = null, game = null, mode = 'pass', busy = false, sel = null, toastT = 0, human = 0, autoView = true, myRealm = -1, lobby = null, lastPropId = 0, seenSeq = 0, queue = Promise.resolve();

const board = new Board3D($('#cv'), { move: () => sfx.move(), capture: () => sfx.capture(), bomb: () => sfx.bomb(), haven: () => sfx.haven(), promote: () => sfx.promote(), fall: () => sfx.fall() });
window.__board = board; window.__game = () => game;

/* ---------- static UI ---------- */
const FACE = { 1: 'front', 2: 'right', 3: 'top', 4: 'bottom', 5: 'left', 6: 'back' };
$('#cube').innerHTML = [1, 2, 3, 4, 5, 6].map(v => `<div class="f ${FACE[v]}">${dieFace(v)}</div>`).join('');
const SHOW = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
let cubeRot = [-18, 24];
function setCube(v, spin) {
  const c = $('#cube'), [x, y] = SHOW[v];
  c.style.transition = spin ? 'transform .38s ease-out' : 'none';
  c.style.transform = `rotateX(${x + (spin ? 360 : 0)}deg) rotateY(${y + (spin ? 360 : 0)}deg)`;
  if (spin) setTimeout(() => { c.style.transition = 'none'; c.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`; }, 420);
}
setCube(1, false);

const LEG = [['K', 'King', 'Waits in the palace and only watches'], ['Q', 'Queen', 'Slides any direction, up to the roll'], ['R', 'Rook', 'Slides straight, up to the roll'], ['B', 'Bishop', 'Slides diagonally, up to the roll'], ['N', 'Knight', 'Classic L-jump on any roll 1–4. Cannot jump walls'], ['P', 'Pawn', '1–2 forward, captures diagonally, promotes']];
const RULES = `<div class="legend">${LEG.map(([k, n, d]) => `<div>${pieceIcon(k, '#6a4a1c', 24)}<span><b>${n}</b><small>${d}</small></span></div>`).join('')}</div><ul>
<li><b>🎲 Tap the dice</b> on your turn. <b>1–4</b> move a piece that far.</li>
<li><b>💣 5 Breaker:</b> only works on things <b>right next to one of your pieces</b> — a wall you stand beside, an enemy piece in a Haven, or (from the corner of an enemy palace) the palace itself, which hands you the whole kingdom.</li>
<li><b>🛡️ 6 Haven:</b> shield one of your pieces from normal captures until it moves.</li>
<li><b>Walls &amp; gates:</b> every realm is walled; only the 2-square gates let pieces through. Blast a wall to open a new road.</li>
<li><b>Promotion:</b> a Pawn reaching the 3 crowned squares beside an enemy palace becomes a Queen, Rook, Bishop or Knight.</li>
<li><b>Diplomacy:</b> before you roll, tap an enemy <b>palace</b> to propose an <b>alliance</b> (allies win together) or demand <b>surrender</b> (their army becomes your Pawns).</li>
<li><b>Win</b> by being the last kingdom standing — or the last alliance.</li></ul>`;

/* ---------- helpers ---------- */
function toast(msg) {
  if (!msg) return; const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
}
function modal(title, bodyHtml, buttons = []) {
  $('#mt').innerHTML = title; $('#mb').innerHTML = bodyHtml; $('#mb').onclick = null; const bx = $('#mbtn'); bx.innerHTML = '';
  for (const b of buttons) {
    const e = document.createElement('button'); e.className = 'act ' + (b.cls || 'slate'); e.textContent = b.t;
    e.onclick = () => { $('#modal').hidden = true; b.f && b.f(); }; bx.append(e);
  }
  $('#modal').hidden = false;
}
const modalOpen = () => !$('#modal').hidden || !$('#menu').hidden;
const online = () => mode === 'online';
const mine = () => mode === 'pass' || (mode === 'bot' && game.cur === human) || (mode === 'online' && game.cur === myRealm);
const canAct = () => !!game && !busy && game.phase !== 'over' && mine();

/* ---------- state → UI ---------- */
const HINT = { roll: 'Tap the dice to roll (or visit the Barracks)', pick: 'Tap a glowing piece, then a spot', bomb: 'Breaker! Tap a glowing target', haven: 'Haven! Tap one of your pieces', wait: '', promo: 'Choose a promotion', over: 'Game over', resolved: '' };
function who(r) { return mode === 'online' && lobby ? ((lobby.seats[game.players.indexOf(r)] || {}).name || NAMES[r]) : mode === 'bot' && r !== human ? NAMES[r] + ' (AI)' : NAMES[r]; }
function refresh() {
  if (!game) return;
  const g = game, me = g.cur, over = g.phase === 'over';
  $('#ribbon').style.setProperty('--rc', over ? '#6b4a1c' : REALM_HEX[me]);
  $('#ribIcon').innerHTML = over ? '🏆' : emblem(me, 22);
  $('#ribText').textContent = over ? (g.winners.length > 1 ? 'Alliance wins!' : NAMES[g.winner] + ' wins!') : (mode === 'online' && g.cur === myRealm ? 'Your turn' : who(me) + (mode === 'bot' && me !== human ? ' is thinking…' : "'s turn"));
  $('#chips').innerHTML = [0, 1, 2, 3].map(r => {
    const on = g.players.includes(r), c = g.count(r), dead = g.dead.has(r), al = on && !dead && g.alliesOf(r).length;
    const f = g.fallen[r];
    return `<div class="kc ${on ? '' : 'off'} ${r === me && !over && on && !dead ? 'cur' : ''} ${dead ? 'out' : ''}" style="--c:${REALM_HEX[r]}">${emblem(r, 28)}<div class="meta"><div class="nm">${on ? who(r) : NAMES[r]}${al ? ' 🤝' : ''}${r === myRealm && online() ? ' ★' : ''}</div><div class="cnt">${on ? (dead ? (f && f.how === 'surrender' ? 'surrendered' : f && f.how === 'conquered' ? 'conquered' : 'fallen') : c + ' pieces · 🪙' + (g.gold[r] || 0)) : '—'}</div><div class="bar">${Array.from({ length: 8 }, (_, i) => `<i class="${on && !dead && i < Math.min(c, 8) ? 'on' : ''}"></i>`).join('')}</div></div></div>`;
  }).join('');
  const can = canAct() && g.phase === 'roll';
  $('#dice').disabled = !can; $('#dice').classList.toggle('glow', can);
  $('#dip').disabled = !(canAct() && g.canDiplomacy());
  $('#shop').disabled = !(canAct() && g.canShop());
  $('#skip').disabled = !(canAct() && ['pick', 'bomb', 'haven'].includes(g.phase));
  $('#hint').textContent = pend && !busy ? (pend.kind === 'upgrade' ? 'Tap a Pawn to upgrade it' : 'Tap a piece to shield it') : busy && g.phase === 'roll' ? '' : (!mine() && !over && g.phase === 'roll' ? '' : HINT[g.phase] || '');
  if (g.roll != null && !diceSpinning) setCube(g.roll, false);
  highlights();
}
let diceSpinning = false;
function highlights() {
  const g = game, h = {};
  if (canAct() && pend && g.phase === 'roll') h.haven = g.pieces.filter(p => p.o === g.cur && (pend.kind === 'upgrade' ? p.k === 'P' : !p.haven && p.k !== 'K')).map(p => ({ x: p.x, y: p.y }));
  else if (canAct()) {
    if (g.phase === 'pick') {
      const sp = sel && g.pieces.find(p => p.id === sel);
      h.movable = g.movable().filter(p => !sp || p.id !== sp.id).map(p => ({ x: p.x, y: p.y }));
      if (sp) {
        const rs = g.routes(sp, g.roll);
        h.sel = { x: sp.x, y: sp.y };
        h.paths = rs.map(r => { const land = []; if (sp.k === 'N') for (let i = 2; i < r.path.length; i += 2) land.push(i); return { pts: r.path, cap: !!g.at(r.to[0], r.to[1]), knight: sp.k === 'N', land }; });
        h.dots = rs.filter(r => g.at(r.to[0], r.to[1])).map(r => ({ x: r.to[0], y: r.to[1], cap: true }));
      }
    } else if (g.phase === 'haven') h.haven = g.pieces.filter(p => p.o === g.cur && !p.haven).map(p => ({ x: p.x, y: p.y }));
    else if (g.phase === 'bomb') { const t = g.bombTargets(); h.walls = new Set(t.walls); h.bombs = t.havens.map(p => ({ x: p.x, y: p.y })); h.castles = t.castles; }
  }
  board.setHighlights(h);
}

/* ---------- online sync ---------- */
function push(ev, status) { if (online()) room.push(game, ev, status).catch(e => toast('Connection problem: ' + e.message)); }

/* ---------- turn flow ---------- */
async function act(events) {
  busy = true; sel = null; board.setHighlights({}); refresh();
  push(events);
  await board.play(events);
  if (game.phase === 'promo') { busy = false; refresh(); if (mode === 'bot' && game.cur !== human) { busy = true; await sleep(300); await board.play(game.promote(bot.choosePromo())); return finish(); } promoDialog(); return; }
  await finish();
}
async function finish() {
  game.endTurn(); busy = false;
  if (game.msg) toast(game.msg);
  push([], game.phase === 'over' ? 'over' : undefined);
  refresh();
  if (game.phase === 'over') { sfx.win(); await sleep(700); winDialog(); return; }
  nextTurn();
}
function nextTurn() {
  if (!game || game.phase !== 'roll') return;
  if (game.income && game.phase === 'roll' && game.moveNo > 0 || (game.income && game.turn > 0)) toast('🪙 ' + who(game.income.realm) + ' collects ' + game.income.amt + ' gold');
  if (mode === 'bot' && game.cur !== human) botTurn();
}
async function spin(v) {
  diceSpinning = true; sfx.dice(); setCube(v, true); await sleep(430); diceSpinning = false;
}
async function roll() {
  if (!canAct() || game.phase !== 'roll') return;
  busy = true; $('#dice').disabled = true; $('#hint').textContent = '';
  const r = 1 + (Math.random() * 6 | 0);
  await spin(r);
  const ph = game.rollDice(r); push([]);
  if (ph === 'wait') { toast(game.msg); busy = true; refresh(); await sleep(1300); return finish(); }
  busy = false; refresh();
  if (ph === 'bomb') toast('💣 Breaker — blast a glowing target next to your piece');
}

/* ---------- computer turn ---------- */
async function botShop() {
  const g = game, r = g.cur; let ev = null;
  const pawn = g.pieces.filter(p => p.o === r && p.k === 'P').sort((a, b) => Math.abs(b.x - b.dx * 0) - 0)[0];
  if (pawn && g.gold[r] >= 12) ev = g.upgrade(pawn, 'Q');
  else if (pawn && g.gold[r] >= 7) ev = g.upgrade(pawn, 'R');
  else if (g.gold[r] >= 3 && g.count(r) < 14 && g.trainCell()) ev = g.train();
  if (ev) { busy = true; await board.play(ev); }
}
async function botTurn() {
  busy = true; refresh(); await sleep(700);
  if (!game || mode !== 'bot') return;
  await botShop(); refresh();
  if (!game || mode !== 'bot') return;
  const r = 1 + (Math.random() * 6 | 0); await spin(r);
  const ph = game.rollDice(r);
  if (ph === 'wait') { toast(game.msg); refresh(); await sleep(1100); return finish(); }
  refresh(); await sleep(450);
  if (ph === 'pick') {
    const m = bot.chooseMove(game);
    if (!m) return finish();
    sel = m.p.id; busy = false; refresh(); busy = true; await sleep(650);
    return act(game.doMove(m.p, m.to[0], m.to[1]));
  }
  const s = bot.chooseSpecial(game);
  if (s.type === 'castle') return act(game.bombCastle(s.realm));
  if (s.type === 'piece') return act(game.bombPiece(s.p));
  if (s.type === 'wall') return act(game.bombWall(s.key));
  if (s.type === 'haven') return act(game.useHaven(s.p));
  return act(game.skip());
}

/* ---------- tapping the board ---------- */
function onTap(px, py) {
  if (!game || modalOpen()) return;
  const g = game, hit = board.pick(px, py, g.phase === 'bomb');
  if (!hit) { if (sel) { sel = null; refresh(); } return; }
  if (hit.type === 'castle') return castleTap(hit.realm);
  if (!canAct()) return;
  if (pend && g.phase === 'roll') return shopTap(hit);
  if (g.phase === 'pick' && hit.type === 'cell') {
    const p = g.at(hit.x, hit.y), sp = sel && g.pieces.find(q => q.id === sel);
    if (sp && g.moves(sp, g.roll).some(([x, y]) => x === hit.x && y === hit.y)) return act(g.doMove(sp, hit.x, hit.y));
    if (p && p.o === g.cur && g.moves(p, g.roll).length) { sel = sel === p.id ? null : p.id; sfx.click(); refresh(); }
    else if (p && p.o === g.cur) toast('That piece has no move with a ' + g.roll);
    else if (sel) { sel = null; refresh(); }
  } else if (g.phase === 'haven' && hit.type === 'cell') {
    const p = g.at(hit.x, hit.y); if (p && p.o === g.cur && !p.haven) act(g.useHaven(p));
  } else if (g.phase === 'bomb') {
    const t = g.bombTargets();
    if (hit.type === 'wall') {
      if (t.walls.includes(hit.key)) act(g.bombWall(hit.key));
      else toast('Too far! Stand a piece right beside that wall to blast it.');
    } else if (hit.type === 'cell') {
      const p = g.at(hit.x, hit.y);
      if (p && p.haven && p.o !== g.cur) { if (t.havens.includes(p)) act(g.bombPiece(p)); else toast('Too far! One of your pieces must be next to it.'); }
    }
  }
}
board.onTap = onTap;

function shopTap(hit) {
  const g = game, p = hit.type === 'cell' && g.at(hit.x, hit.y), k = pend.kind;
  if (!p) { pend = null; refresh(); return; }
  const ev = k === 'upgrade' ? g.upgrade(p, pend.k) : g.buyHaven(p);
  if (!ev) return toast(k === 'upgrade' ? 'Pick one of your Pawns' : 'Pick one of your pieces');
  pend = null; shopDone(ev);
}
async function shopDone(ev) {
  busy = true; board.setHighlights({}); refresh(); push(ev); await board.play(ev); busy = false; toast(game.msg); refresh();
}
function shopDialog() {
  const g = game, gold = g.gold[g.cur], has = (n) => gold >= n, pawns = g.pieces.some(p => p.o === g.cur && p.k === 'P');
  const it = (t, cost, ok, f, cls = 'blue') => ({ t: `${t} · 🪙${cost}`, cls: ok ? cls : 'slate', f: ok ? f : () => toast('Not enough gold, or nothing to use it on.') });
  modal('🏰 Barracks — you have 🪙' + gold, `<p>One purchase per turn. Earn gold from <b>mines 🪙</b> (an enemy standing on yours steals it), the <b>centre vaults 💎</b> (+2 for whoever holds one) and by capturing pieces.</p>`, [
    it('Train a Pawn', COST.train, has(COST.train) && !!g.trainCell() && g.count(g.cur) < 16, async () => { const ev = g.train(); shopDone(ev); }),
    it('Pawn → Knight', COST.N, has(COST.N) && pawns, () => { pend = { kind: 'upgrade', k: 'N' }; refresh(); }),
    it('Pawn → Bishop', COST.B, has(COST.B) && pawns, () => { pend = { kind: 'upgrade', k: 'B' }; refresh(); }),
    it('Pawn → Rook', COST.R, has(COST.R) && pawns, () => { pend = { kind: 'upgrade', k: 'R' }; refresh(); }),
    it('Pawn → Queen', COST.Q, has(COST.Q) && pawns, () => { pend = { kind: 'upgrade', k: 'Q' }; refresh(); }, 'gold'),
    it('Buy a Haven', COST.haven, has(COST.haven), () => { pend = { kind: 'haven' }; refresh(); }),
    { t: 'Close' }]);
}
function castleTap(r) {
  const g = game; if (!g.players.includes(r)) return;
  if (g.phase === 'bomb' && canAct()) {
    if (g.bombTargets().castles.includes(r)) return confirmBombCastle(r);
    if (r !== g.cur) return toast('To blast a palace, stand a piece on its corner squares first.');
  }
  if (r === g.cur) return toast('That is your own palace.');
  if (g.dead.has(r)) return toast(NAMES[r] + ' has already fallen.');
  if (!canAct()) return toast(mine() ? 'Wait for the animation…' : 'It is not your turn.');
  if (g.phase !== 'roll') return toast('Diplomacy is only possible before you roll.');
  if (!g.canDiplomacy()) return toast('You already made a request this turn.');
  diploDialog(r);
}
function confirmBombCastle(r) {
  modal('💣 Blast the palace?', `<p>Destroying <b>${NAMES[r]}</b>'s palace gives you control of the whole kingdom: its army becomes your Pawns.</p>`, [{ t: 'Cancel' }, { t: 'Blast it!', cls: 'red', f: () => act(game.bombCastle(r)) }]);
}

/* ---------- diplomacy ---------- */
function diploDialog(r) {
  const g = game, me = g.cur, al = g.allied(me, r);
  const btns = [];
  if (al) btns.push({ t: '💔 Break alliance', cls: 'red', f: async () => { g.breakAlly(me, r); g.diploUsed = true; toast(g.msg); push([]); refresh(); } });
  else {
    btns.push({ t: '🤝 Propose alliance', cls: 'blue', f: () => request('ally', me, r) });
    btns.push({ t: '🏳 Demand surrender', cls: 'red', f: () => request('surrender', me, r) });
  }
  btns.push({ t: 'Cancel' });
  modal(`${emblemInline(r)} ${NAMES[r]} palace`, `<p>${al ? `You are allied with <b>${NAMES[r]}</b>. Allies win together.` : `<b>${NAMES[r]}</b> has ${g.count(r)} pieces. What do you want to say to them?`}</p>`, btns);
}
const emblemInline = r => `<span class="inl" style="background:${REALM_HEX[r]}"></span>`;
function diploMenu() {
  const g = game, ts = g.diploTargets(); if (!ts.length) return;
  modal('🤝 Diplomacy', '<p>Choose a kingdom to talk to, or tap its palace on the board.</p>', ts.map(r => ({ t: NAMES[r], cls: 'blue', f: () => diploDialog(r) })).concat([{ t: 'Cancel' }]));
}
async function request(kind, from, to) {
  const g = game; g.diploUsed = true; refresh();
  const ask = kind === 'ally' ? `${who(from)} proposes an alliance` : `${who(from)} demands your surrender`;
  if (mode === 'bot') {
    busy = true; refresh(); toast(`${ask}…`); await sleep(900);
    const ok = bot.answer(g, kind, from, to); busy = false; return resolve(kind, from, to, ok);
  }
  if (online()) {
    busy = true; refresh(); toast('Request sent to ' + who(to) + '…');
    await room.propose({ kind, from, to });
    return;                                              // answer arrives through the room watcher
  }
  askHuman(kind, from, to, ok => resolve(kind, from, to, ok));
}
function askHuman(kind, from, to, cb) {
  const body = kind === 'ally' ? `<p><b>${who(from)}</b> offers you an <b>alliance</b>. Allies share one victory and cannot attack each other.</p>` : `<p><b>${who(from)}</b> demands your <b>surrender</b>. If you yield, your whole army becomes ${who(from)}'s Pawns and your kingdom is theirs.</p>`;
  modal(`${emblemInline(to)} ${who(to)}, your answer?`, body, kind === 'ally' ? [{ t: 'Decline' , f: () => cb(false) }, { t: 'Accept', cls: 'gold', f: () => cb(true) }] : [{ t: 'Fight on', cls: 'gold', f: () => cb(false) }, { t: 'Surrender', cls: 'red', f: () => cb(true) }]);
}
async function resolve(kind, from, to, ok) {
  const g = game; busy = false;
  if (!ok) { toast(kind === 'ally' ? `${who(to)} declined the alliance` : `${who(to)} refuses to surrender`); push([]); return refresh(); }
  if (kind === 'ally') { g.ally(from, to); sfx.promote(); toast(g.msg); push([]); refresh(); return g.phase === 'over' ? finish() : undefined; }
  busy = true; const ev = g.surrender(to); push(ev); await board.play(ev); busy = false; toast(g.msg); refresh();
  if (g.phase === 'over') return finish();
}

/* ---------- dialogs ---------- */
function promoDialog() {
  const p = game.pieces.find(q => q.id === game.promoId);
  modal('♟ Pawn promotion', `<p>Your Pawn reached an enemy palace. Choose its new rank:</p><div class="pick">${['Q', 'R', 'B', 'N'].map(k => `<button data-k="${k}">${pieceIcon(k, REALM_HEX[p.o], 40)}${KN[k]}</button>`).join('')}</div>`);
  $('#mb').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    $('#modal').hidden = true; $('#mb').onclick = null; busy = true;
    const ev = game.promote(b.dataset.k); push(ev); await board.play(ev); await finish();
  };
}
function winDialog() {
  const g = game, team = g.winners.length > 1;
  modal('🏆 ' + (team ? 'The alliance wins!' : NAMES[g.winner] + ' wins!'), `<p style="text-align:center">${team ? g.winners.map(who).join(' & ') + ' stand together.' : 'The last kingdom standing.'}</p>`, [{ t: 'Play again', cls: 'gold', f: replay }, { t: 'Menu', f: toMenu }]);
}
const replay = () => { if (online()) return toMenu(); startLocal(mode, game.players.length); };

/* ---------- start / menu ---------- */
function begin(g, m, opts = {}) {
  mode = m; game = g; sel = null; pend = null; busy = false; diceSpinning = false; human = 0; autoView = !!opts.autoView; myRealm = opts.myRealm ?? -1;
  board.auto = false; board.setGame(g); board.resetView(); if (m === 'bot') board.viewFor(0); if (opts.myRealm != null) board.viewFor(opts.myRealm);
  $('#menu').hidden = true; setCube(1, false); sfx.promote();
  const tag = $('#modeTag'); tag.hidden = m !== 'online'; if (m === 'online') tag.textContent = 'Room ' + room.code;
  refresh(); nextTurn();
}
function startLocal(m, n) { begin(new Game(n), m, { autoView: false }); }
function toMenu() {
  if (online()) { room.leave(); lobby = null; }
  game = null; mode = 'pass'; busy = false; $('#modeTag').hidden = true; $('#chips').innerHTML = ''; $('#ribText').textContent = ''; $('#ribIcon').innerHTML = '';
  showMenu(); board.setGame(new Game(4)); board.auto = false; board.setHighlights({}); $('#hint').textContent = '';
  $('#dice').disabled = true; $('#dice').classList.remove('glow'); $('#dip').disabled = true; $('#skip').disabled = true;
}
function showMenu(p = 'home') { $('#menu').hidden = false; for (const s of document.querySelectorAll('#mpages section')) s.hidden = s.dataset.p !== p; }
const seg = id => { $(id).onclick = e => { const b = e.target.closest('button'); if (b) [...$(id).children].forEach(c => c.classList.toggle('on', c === b)); }; };
['#botN', '#passN', '#roomN'].forEach(seg);
const segv = id => +document.querySelector(id + ' .on').dataset.v;
$('#mpages').onclick = e => { const b = e.target.closest('[data-go]'); if (b) { sfx.click(); showMenu(b.dataset.go); } };
$('#startBot').onclick = () => startLocal('bot', segv('#botN'));
$('#startPass').onclick = () => startLocal('pass', segv('#passN'));
$('#howto').onclick = () => modal('How to play', RULES, [{ t: 'Got it', cls: 'gold' }]);
$('#help').onclick = () => modal('How to play', RULES, [{ t: 'Got it', cls: 'gold' }]);
$('#menuBtn').onclick = () => { if (!game) return; if (game.phase === 'over') return toMenu(); modal('Menu', '<p>Leave this game and return to the main menu?</p>', [{ t: 'Keep playing', cls: 'gold' }, { t: 'Leave game', cls: 'red', f: toMenu }]); };
$('#dice').onclick = roll;
$('#dip').onclick = diploMenu;
$('#skip').onclick = () => { if (canAct() && ['pick', 'bomb', 'haven'].includes(game.phase)) act(game.skip()); };
$('#shop').onclick = shopDialog;
const snd = () => { $('#snd').textContent = isMuted() ? '🔇' : '🔊'; };
$('#snd').onclick = () => { setMuted(!isMuted()); snd(); sfx.click(); };
snd();
addEventListener('keydown', e => { if (e.code === 'Space' && canAct() && game.phase === 'roll' && !modalOpen()) { e.preventDefault(); roll(); } });

/* ---------- online rooms ---------- */
const pname = () => ($('#pname').value.trim() || LS.get('lrs.name') || 'Knight').slice(0, 14);
$('#pname').value = LS.get('lrs.name') || '';
backend().then(b => { $('#netNote').textContent = b.kind === 'firebase' ? 'Connected to online rooms.' : 'Local test mode: rooms connect tabs of this browser only. Add your Firebase config to play across devices (see README).'; });
$('#mkRoom').onclick = async () => {
  LS.set('lrs.name', pname());
  try { await room.create(pname(), segv('#roomN')); await openLobby(); } catch (e) { toast(e.message); }
};
$('#joinRoom').onclick = async () => {
  LS.set('lrs.name', pname());
  try { await room.join($('#rcode').value, pname()); await openLobby(); } catch (e) { toast(e.message); }
};
async function openLobby() {
  $('#menu').hidden = true; lobby = null; seenSeq = 0; lastPropId = 0; game = null;
  await room.watch(onRoom);
}
function lobbyDialog(d) {
  const seats = Array.from({ length: d.n }, (_, i) => d.seats[i]);
  const link = location.origin + location.pathname + '?room=' + d.code, host = d.host === uid;
  const body = `<p style="text-align:center">Share this code with your friends</p><div class="code">${d.code}</div><p class="fine" style="text-align:center;word-break:break-all">${link}</p><ul class="seats">${seats.map((s, i) => `<li class="${s ? 'on' : ''}"><span class="inl" style="background:${REALM_HEX[new Game(Math.max(2, d.n)).players[i]]}"></span>${s ? s.name + (s.uid === d.host ? ' ♛' : '') + (s.uid === uid ? ' (you)' : '') : 'waiting…'}</li>`).join('')}</ul>`;
  const btns = [{ t: 'Copy link', cls: 'blue', f: () => { navigator.clipboard && navigator.clipboard.writeText(link).catch(() => { }); toast('Link copied'); lobbyDialog(lobby || d); } }];
  if (host) btns.push({ t: d.seats.length >= 2 ? 'Start game' : 'Need 2+ players', cls: 'gold', f: () => { if (d.seats.length >= 2) startOnline(); else lobbyDialog(lobby || d); } });
  btns.push({ t: 'Leave', cls: 'red', f: toMenu });
  modal('🌐 Room ' + d.code, body, btns);
}
async function startOnline() {
  const n = lobby.seats.length, g = new Game(n);
  await room.start(g);
}
function onRoom(d) {
  if (!d) return;
  lobby = d;
  if (d.status === 'lobby') { if (!game) { if (!$('#modal').hidden && $('#mt').textContent.includes('Room')) { /* refresh in place */ } lobbyDialog(d); } return; }
  const seat = d.seats.findIndex(s => s && s.uid === uid);
  if (seat < 0) return;
  queue = queue.then(() => applyRoom(d, seat)).catch(e => console.error(e));
}
async function applyRoom(d, seat) {
  if (!game) {                                           // first state: the game begins
    const g = Game.from(JSON.parse(d.state)); seenSeq = d.seq; $('#modal').hidden = true;
    begin(g, 'online', { myRealm: g.players[seat] }); return;
  }
  /* diplomacy handshake */
  if (d.prop) { const p = JSON.parse(d.prop); if (p.id !== lastPropId) { lastPropId = p.id; if (p.to === myRealm && p.by !== uid) askHuman(p.kind, p.from, p.to, ok => room.answer(p.id, ok)); } }
  if (d.ans) { const a = JSON.parse(d.ans), p = d.prop && JSON.parse(d.prop); if (p && p.by === uid && a.id === p.id && a.id !== applyRoom.done) { applyRoom.done = a.id; return resolve(p.kind, p.from, p.to, a.ok); } }
  if (d.seq <= seenSeq || d.by === uid) { seenSeq = Math.max(seenSeq, d.seq); return; }
  seenSeq = d.seq;
  const ng = Game.from(JSON.parse(d.state)), ev = JSON.parse(d.ev || '[]'), rolled = ng.rollSeq !== game.rollSeq && ng.roll != null;
  game = ng; board.attach(ng); busy = true; sel = null; board.setHighlights({}); refresh();
  if (rolled) await spin(ng.roll);
  if (ev.length) await board.play(ev); else board.sync();
  busy = false; if (ng.msg && ng.phase !== 'roll') toast(ng.msg); refresh();
  if (ng.phase === 'over') { sfx.win(); await sleep(600); winDialog(); }
}
/* deep link ?room=CODE */
const qroom = new URLSearchParams(location.search).get('room');
if (qroom) { showMenu('friends'); $('#rcode').value = qroom.toUpperCase().slice(0, 5); }

/* back button: ask before leaving a running game */
history.replaceState({ lrs: 0 }, '');
addEventListener('popstate', () => { history.pushState({ lrs: 1 }, ''); if (game && game.phase !== 'over' && $('#modal').hidden) modal('Leave game?', '<p>Your game will be lost.</p>', [{ t: 'Stay', cls: 'gold' }, { t: 'Leave', cls: 'red', f: toMenu }]); });
document.addEventListener('pointerdown', () => { if (!history.state || history.state.lrs !== 1) history.pushState({ lrs: 1 }, ''); }, { once: true });

/* ---------- attract mode behind the menu ---------- */
toMenu(); if (qroom) showMenu('friends');

/* ---------- service worker: always prefer the network ---------- */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('lrs-sw.js', { updateViaCache: 'none' }).then(r => {
    r.update(); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') r.update(); });
  }).catch(() => { });
  let had = !!navigator.serviceWorker.controller, reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloaded) { reloaded = true; location.reload(); } had = true; });
}

/* ---------- install button (always on the home page) ---------- */
let deferred = null;
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const syncInstall = () => { $('#install').hidden = !!standalone(); };
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; syncInstall(); });
addEventListener('appinstalled', () => { deferred = null; syncInstall(); toast('Installed! Open it from your home screen.'); });
$('#install').onclick = async () => {
  if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  modal('📲 Install Ludo Realms', ios
    ? '<ul><li>Tap the <b>Share</b> button in Safari.</li><li>Choose <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li></ul>'
    : '<ul><li><b>Android / Chrome:</b> tap the ⋮ menu → <b>Install app</b> (or Add to Home screen).</li><li><b>Desktop Chrome / Edge:</b> click the install icon in the address bar.</li><li>If it says "already installed", remove the old copy first, then reload.</li></ul>', [{ t: 'OK', cls: 'gold' }]);
};
syncInstall();
/* credits */
import('./credits.js').then(({ credits }) => {
  $('#credits').innerHTML = credits.map(c => `<div class="cr"><small>${c.role}</small><img src="${c.logo}" alt="" onerror="this.onerror=null;this.src='assets/logo-placeholder.svg'"><b>${c.name}</b></div>`).join('');
});
