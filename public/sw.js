self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (e) => {
  // network-first for basics
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});