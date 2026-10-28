// Ludo Realms: Siege — service worker.
// Network-first: always fetch the newest files from the server.
// The cache is only an offline fallback and is never served while you are online.
const CACHE = 'ludo-realms-siege-offline-v1';   // unique to this game
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('ludo-realms-siege-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || !r.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(r, { cache: 'no-store' }).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }))
  );
});
