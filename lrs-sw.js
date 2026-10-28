// Ludo Realms: Siege — service worker (unique file name + cache name for this game only).
// Network-first: always fetch the newest files; cache is only an offline fallback.
const CACHE = 'ludo-realms-siege-offline-v2';
const SHELL = ['./', './index.html', './manifest.webmanifest', './css/style.css', './icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => { })); self.skipWaiting(); });
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
    }).catch(async () => (await caches.match(r, { ignoreSearch: true })) || (r.mode === 'navigate' ? await caches.match('./index.html') : undefined) || Response.error())
  );
});
