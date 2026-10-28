/* Online rooms. Backend = Firebase Firestore when firebase-config.js is filled in,
 * otherwise a local fallback (localStorage + BroadcastChannel) that links tabs of one browser. */
const COL = 'realmsRooms';
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } } };

/* per-tab id (sessionStorage) so two tabs of one browser count as two players */
export const uid = (() => { let u = null; try { u = sessionStorage.getItem('lrs.uid'); } catch { } if (!u) { u = Math.random().toString(36).slice(2, 10) + Date.now().toString(36); try { sessionStorage.setItem('lrs.uid', u); } catch { } } return u; })();
const mkCode = () => Array.from({ length: 5 }, () => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.random() * 31 | 0]).join('');

/* ---------- local fallback ---------- */
function localBackend() {
  const key = c => 'lrs.room.' + c, bc = 'BroadcastChannel' in self ? new BroadcastChannel('lrs-rooms') : null, subs = new Map();
  const read = c => { try { return JSON.parse(store.get(key(c))); } catch { return null; } };
  const emit = c => (subs.get(c) || []).forEach(f => f(read(c)));
  bc && (bc.onmessage = e => emit(e.data));
  addEventListener('storage', e => { if (e.key && e.key.startsWith('lrs.room.')) emit(e.key.slice(9)); });
  return {
    kind: 'local',
    async get(c) { return read(c); },
    async tx(c, fn) { const nd = fn(read(c)); if (nd) { store.set(key(c), JSON.stringify(nd)); bc && bc.postMessage(c); emit(c); } return nd; },
    watch(c, cb) { const l = subs.get(c) || []; l.push(cb); subs.set(c, l); return () => subs.set(c, (subs.get(c) || []).filter(f => f !== cb)); },
  };
}

/* ---------- Firebase ---------- */
async function firebaseBackend(cfg) {
  const V = '10.12.2';
  const [{ initializeApp }, fs] = await Promise.all([import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`), import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)]);
  const db = fs.getFirestore(initializeApp(cfg)), ref = c => fs.doc(db, COL, c);
  return {
    kind: 'firebase',
    async get(c) { const s = await fs.getDoc(ref(c)); return s.exists() ? s.data() : null; },
    async tx(c, fn) { return fs.runTransaction(db, async t => { const s = await t.get(ref(c)), nd = fn(s.exists() ? s.data() : null); if (nd) t.set(ref(c), nd); return nd; }); },
    watch(c, cb) { return fs.onSnapshot(ref(c), s => cb(s.exists() ? s.data() : null)); },
  };
}

let be = null;
export async function backend() {
  if (be) return be;
  try {
    const m = await import('../firebase-config.js');
    if (m.firebaseEnabled && m.firebaseConfig && m.firebaseConfig.apiKey && m.firebaseConfig.projectId) be = await firebaseBackend(m.firebaseConfig);
  } catch (e) { console.warn('Firebase unavailable, using local mode', e); }
  return be || (be = localBackend());
}

/* ---------- room API ---------- */
export const room = {
  code: null, unsub: null,
  async create(name, n) {
    const b = await backend();
    for (let i = 0; i < 6; i++) {
      const code = mkCode(); let ok = false;
      await b.tx(code, cur => { if (cur) return null; ok = true; return { code, n, host: uid, status: 'lobby', seats: [{ uid, name }], state: '', ev: '[]', seq: 0, by: '', prop: '', ans: '', t: Date.now() }; });
      if (ok) { this.code = code; return code; }
    }
    throw new Error('Could not create a room');
  },
  async join(code, name) {
    const b = await backend(); code = code.trim().toUpperCase(); let err = '';
    await b.tx(code, cur => {
      if (!cur) { err = 'Room not found'; return null; }
      if (cur.seats.some(s => s && s.uid === uid)) return null;
      if (cur.status !== 'lobby') { err = 'That game already started'; return null; }
      if (cur.seats.length >= cur.n) { err = 'Room is full'; return null; }
      return { ...cur, seats: [...cur.seats, { uid, name }] };
    });
    if (err) throw new Error(err);
    this.code = code; return code;
  },
  async watch(cb) { const b = await backend(); this.unsub && this.unsub(); this.unsub = b.watch(this.code, cb); const d = await b.get(this.code); d && cb(d); },
  async patch(fn) { return (await backend()).tx(this.code, cur => cur && fn(cur)); },
  start(game) { return this.patch(d => ({ ...d, status: 'playing', n: d.seats.length, state: JSON.stringify(game.toJSON()), ev: '[]', seq: d.seq + 1, by: uid })); },
  push(game, ev, status) { return this.patch(d => ({ ...d, state: JSON.stringify(game.toJSON()), ev: JSON.stringify(ev || []), seq: d.seq + 1, by: uid, status: status || d.status })); },
  propose(p) { return this.patch(d => ({ ...d, prop: JSON.stringify({ ...p, id: Date.now() + Math.random(), by: uid }), ans: '' })); },
  answer(id, ok) { return this.patch(d => ({ ...d, ans: JSON.stringify({ id, ok }) })); },
  leave() { this.unsub && this.unsub(); this.unsub = null; this.code = null; },
};
