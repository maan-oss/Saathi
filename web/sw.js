// Keeps the app's own files so it opens instantly, even on a weak connection. It never stores conversations or API calls.
const CACHE = 'saathi-shell-v19';
const SHELL = ['/app', '/style.css', '/app.js', '/screens.js', '/tools.js', '/guides.js', '/screens.css', '/guides.css', '/polish.css', '/hark.css', '/welcome.css', '/hark.js', '/logo.svg', '/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/app/api/') || u.pathname.startsWith('/admin/')) return;
  // Network first, so updates arrive; the saved copy is only for when the network fails.
  e.respondWith(fetch(e.request).then((r) => { if (r.ok && SHELL.includes(u.pathname)) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('/app'))));
});
