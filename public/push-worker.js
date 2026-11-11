// =============================================================================
// GESTIO 229 ERP — Web Push Worker (Écouteur d'Événements Push Android & Web)
// Reçoit les événements push en arrière-plan, affiche les notifications et gère les clics
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
    // Diffuser aux fenêtres actives pour confirmer la réception en direct
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
    // 1. Chercher une fenêtre admin ouverte
    for (const client of windowClients) {
      if (client.url && client.url.includes('/admin') && 'focus' in client) {
        if ('navigate' in client && fullTargetUrl) {
          client.navigate(fullTargetUrl);
        }
        return client.focus();
      }
    }
    // 2. Chercher toute fenêtre de l'application
    for (const client of windowClients) {
      if ('focus' in client) {
        if ('navigate' in client && fullTargetUrl) {
          client.navigate(fullTargetUrl);
        }
        return client.focus();
      }
    }
    // 3. Ouvrir une nouvelle fenêtre
    if (self.clients && self.clients.openWindow) {
      return self.clients.openWindow(fullTargetUrl);
    }
  });

  event.waitUntil(clickPromise);
});
