// Service worker: deja la app lista para abrirse sin conexión desde la primera visita.
//  · Al instalarse guarda la página y sus recursos (la lista la escribe el build, ver vite.config.ts).
//  · Página: red primero (para recibir versiones nuevas) y, sin red, la copia guardada.
//  · Recursos: copia guardada primero; lo que no esté se guarda al pedirlo.
const VERSION = '__SW_VERSION__';
const PRECACHE = /*__SW_ASSETS__*/ [];
const FILES = /*__SW_FILES__*/ []; // todos los archivos de esta versión
const CACHE = 'nerf-arena-' + VERSION;
// Recursos pesados que se descargan solo si se usan (motor de voz propio): sobreviven a las actualizaciones
const LAZY = 'nerf-arena-lazy';
// Las cabeceras Vary del servidor (Origin, Accept-Encoding) no deben impedir usar la copia guardada
const ANY = { ignoreVary: true };

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('nerf-arena-') && k !== CACHE && k !== LAZY).map((k) => caches.delete(k))))
      // de lo descargado bajo demanda, quitar lo que ya no pertenece a esta versión
      .then(() => caches.open(LAZY))
      .then((c) =>
        c.keys().then((reqs) => {
          const keep = new Set(FILES.map((f) => new URL(f, self.registration.scope).href));
          return Promise.all(reqs.filter((r) => FILES.length && !keep.has(r.url)).map((r) => c.delete(r)));
        }),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  // El modelo de voz (40 MB) lo guarda el propio motor: no duplicarlo aquí
  if (u.pathname.endsWith('.tar.gz')) return;
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('./', copy));
          }
          return res;
        })
        // sin red: la página guardada (también para enlaces con ?sala=…)
        .catch(() => caches.match('./', ANY).then((r) => r || caches.match('index.html', ANY)).then((r) => r || Response.error())),
    );
    return;
  }
  e.respondWith(
    caches.match(req, ANY).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(LAZY).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

// ───────────── notificaciones (guerra diaria de rivales) ─────────────
self.addEventListener('push', (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { body: e.data ? e.data.text() : '' };
  }
  const show = self.registration.showNotification(d.title || 'Nerf Arena', {
    body: d.body || '',
    tag: d.tag,
    renotify: !!d.tag,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    requireInteraction: !!d.urgent,
    vibrate: d.urgent ? [300, 120, 300, 120, 700] : [120],
    data: { url: d.url },
  });
  // Si la app está abierta, que se actualice al momento
  const tell = self.clients.matchAll({ type: 'window' }).then((cs) => cs.forEach((c) => c.postMessage({ type: 'push' })));
  e.waitUntil(Promise.all([show, tell]));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || new URL('./?rivales', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
      for (const c of cs) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
          c.postMessage({ type: 'open-rivals' });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
