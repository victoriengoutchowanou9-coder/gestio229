// =============================================================================
// GESTIO 229 ERP — Service Worker PWA (Offline Shell & Caching)
// =============================================================================

const CACHE_NAME = 'gestio229-pwa-v3.0.2';
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/favicon.png',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/images/port-cotonou.jpg'
];

// Installation : mise en cache du shell initial
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Pré-cache partiel :', err);
      });
    })
  );
});

// Activation : suppression des anciens caches et prise de contrôle immédiate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch : Stratégie hybride réseau / cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Ne JAMAIS intercepter les requêtes API Supabase ou non-GET
  if (request.method !== 'GET' || url.hostname.includes('supabase.co')) {
    return;
  }

  // 2. Requêtes de navigation (HTML) : Network-First avec fallback index.html en cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/index.html');
          return fallback || Response.error();
        })
    );
    return;
  }

  // 3. Chunks JS & bundles Vite : Network-First systématique
  // Évite d'exécuter d'anciens chunks mis en cache pointant vers des hashes inexistants post-déploiement
  if (url.pathname.endsWith('.js') || url.pathname.includes('/assets/')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 4. Médias & assets statiques (images, polices) : Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

// =============================================================================
// Push Notifications Web (Super Admin & Alertes Inscriptions Temps Réel)
// Compatible téléphones Android & navigateurs PWA en tâche de fond
// =============================================================================
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = {
        title: 'GESTIO 229 ERP',
        body: event.data.text() || 'Nouvelle notification plateforme'
      };
    }
  }

  const title = data.title || 'GESTIO 229 : Nouvelle entreprise inscrite !';
  const tag = data.tag || `gestio229-push-${Date.now()}`;
  const targetUrl = data.data?.url || '/admin/companies';

  const options = {
    body: data.body || 'Une nouvelle entreprise a finalisé son inscription sur GESTIO 229.',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icons/favicon.png',
    vibrate: [300, 100, 300, 100, 300],
    data: {
      url: targetUrl,
      ...(data.data || {}),
      receivedAt: Date.now()
    },
    tag: tag,
    renotify: true,
    requireInteraction: true,
    actions: [
      { action: 'open_admin', title: 'Ouvrir Super Admin' }
    ]
  };

  const showPromise = self.registration.showNotification(title, options).then(() => {
    if (self.clients && self.clients.matchAll) {
      return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        windowClients.forEach((client) => {
          try {
            client.postMessage({
              type: 'GESTIO_PUSH_RECEIVED',
              title,
              body: options.body,
              tag,
              timestamp: Date.now()
            });
          } catch (_) {}
        });
      });
    }
  });

  event.waitUntil(showPromise);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || '/admin/companies';
  const fullTargetUrl = new URL(rawUrl, self.location.origin).href;

  const clickPromise = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    for (const client of windowClients) {
      if (client.url && client.url.includes('/admin') && 'focus' in client) {
        if ('navigate' in client && fullTargetUrl) {
          client.navigate(fullTargetUrl);
        }
        return client.focus();
      }
    }
    for (const client of windowClients) {
      if ('focus' in client) {
        if ('navigate' in client && fullTargetUrl) {
          client.navigate(fullTargetUrl);
        }
        return client.focus();
      }
    }
    if (self.clients && self.clients.openWindow) {
      return self.clients.openWindow(fullTargetUrl);
    }
  });

  event.waitUntil(clickPromise);
});

