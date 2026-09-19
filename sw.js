/* Tabak-Tracker – Service Worker
   Legt die App-Dateien im Cache ab, damit sie auch offline startet.
   Nach Änderungen an den Dateien die Versionsnummer erhöhen (v3 -> v4),
   dann laden alle Geräte die neue Version. */
const CACHE = 'tabak-tracker-v6';

// Diese Dateien braucht die App zum Starten.
const CORE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

// Icons werden mitgelegt, blockieren die Installation aber nicht, falls eines fehlt.
const ICONS = [
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon.png'
];

self.addEventListener('install', (event) => {
  // { cache: 'reload' } zwingt den Browser, die Dateien wirklich frisch vom
  // Server zu holen statt eine evtl. alte Kopie aus dem HTTP-Cache zu nehmen.
  const fetchFresh = (url) => fetch(url, { cache: 'reload' });
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => Promise.all(CORE.map((url) => fetchFresh(url).then((res) => {
        if (res && res.ok) return cache.put(url, res);
        return null;
      }))).then(() => Promise.allSettled(ICONS.map((url) => fetchFresh(url).then((res) => {
        if (res && res.ok) return cache.put(url, res);
        return null;
      })))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Aus dem Cache antworten (schnell, offline) und im Hintergrund aktualisieren.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(network);
        return cached;
      }

      const res = await network;
      if (res) return res;
      if (req.mode === 'navigate') return cache.match('./index.html');
      return Response.error();
    })
  );
});
