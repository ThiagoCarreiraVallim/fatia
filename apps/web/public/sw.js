// Service worker básico — cache de assets estáticos.
// Não cacheia requests à API (/api/*) pra evitar dados nutricionais defasados.

const CACHE = 'fatia-static-v2';
const PRECACHE = [
  '/',
  '/manifest.json',
  '/icons/icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca cachear API / autenticação.
  if (
    url.pathname.startsWith('/api/') ||
    event.request.method !== 'GET' ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  // Network-first pra HTML (precisa refletir build atual), cache-first pra static.
  if (event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request).then((m) => m ?? caches.match('/'))),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, clone));
          }
          return res;
        }),
    ),
  );
});

// Push no navegador (Fase 9g). O texto vem pronto do servidor e nunca traz dado
// de saúde; o caminho do toque passa pela mesma conferência do app
// (`notificationTarget`): só caminho interno, sem esquema, sem `//` e sem `?`.
const CAMINHO_INTERNO = /^\/(?!\/)[A-Za-z0-9/_-]*$/;

self.addEventListener('push', (event) => {
  let aviso = { title: 'Fatia', body: '', url: '/' };
  try {
    aviso = { ...aviso, ...(event.data ? event.data.json() : {}) };
  } catch {
    // Corpo que não é JSON: mostra o padrão, sem conteúdo nenhum.
  }
  event.waitUntil(
    self.registration.showNotification(aviso.title, {
      body: aviso.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: aviso.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const bruto = event.notification.data && event.notification.data.url;
  const destino = typeof bruto === 'string' && CAMINHO_INTERNO.test(bruto) ? bruto : '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abertas) => {
      for (const c of abertas) {
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
          c.navigate(destino);
          return c.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
