/* Tabak-Tracker – Service Worker
   Legt die App-Dateien im Cache ab, damit sie auch offline startet.
   Nach Änderungen an den Dateien die Versionsnummer erhöhen (v2 -> v3),
   dann laden alle Geräte die neue Version. */
const CACHE = 'tabak-tracker-v2';

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
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(CORE).then(() => Promise.allSettled(ICONS.map((url) => cache.add(url)))))
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
