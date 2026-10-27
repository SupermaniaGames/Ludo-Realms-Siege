// Network-first: always fetch the latest files from GitHub Pages.
// The cache is only an offline fallback, never served when online.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',e=>{
  const r=e.request;
  if(r.method!=='GET'||!r.url.startsWith(self.location.origin))return;
  e.respondWith(
    fetch(r,{cache:'no-store'}).then(res=>{
      const copy=res.clone();
      caches.open('offline').then(c=>c.put(r,copy));
      return res;
    }).catch(()=>caches.match(r))
  );
});
