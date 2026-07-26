const CACHE_NAME = "walkie-talkie-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  // App-Shell aus dem Cache, Netzwerk als Fallback (die Verbindungsvermittlung
  // selbst braucht trotzdem eine aktive Internetverbindung).
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
