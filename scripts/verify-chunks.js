// scripts/verify-chunks.js
import fs from 'fs';
import path from 'path';

// 1. Contrôle des assets générés
const dist = path.resolve('dist/assets');
if (fs.existsSync(dist)) {
  const files = fs.readdirSync(dist);
  console.log(`✅ [GESTIO 229] Post-build vérifié : ${files.length} fichiers assets générés.`);
  
  const dashboardCore = files.find(f => f.startsWith('dashboard-core'));
  if (dashboardCore) {
    console.log(`✅ Chunk unifié présent : ${dashboardCore}`);
  }
} else {
  console.warn('⚠️ Dossier dist/assets non trouvé');
}

// 2. Garantir la présence et l'intégrité du Web Push Worker dans dist/
const distPushWorker = path.resolve('dist/push-worker.js');
const publicPushWorker = path.resolve('public/push-worker.js');

if (fs.existsSync(publicPushWorker)) {
  const pushContent = fs.readFileSync(publicPushWorker, 'utf8');
  fs.writeFileSync(distPushWorker, pushContent, 'utf8');
  console.log('✅ [GESTIO 229] push-worker.js synchronisé dans dist/.');
}

// 3. Garantir que dist/sw.js embarque impérativement le support des notifications Push Android
const distSw = path.resolve('dist/sw.js');
if (fs.existsSync(distSw)) {
  let swContent = fs.readFileSync(distSw, 'utf8');
  let modified = false;

  // S'assurer que importScripts inclut /push-worker.js
  if (!swContent.includes('push-worker.js')) {
    swContent = `importScripts('/push-worker.js');\n` + swContent;
    modified = true;
  }

  // Double sécurité : embarquer le handler d'événement push directement dans dist/sw.js
  if (!swContent.includes('GESTIO_PUSH_RECEIVED')) {
    const embeddedPushHandler = `
// =============================================================================
// GESTIO 229 ERP — Fallback Push Handler embarqué (Android & Chrome PWA)
// =============================================================================
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); } catch (_) {
      data = { title: 'GESTIO 229 ERP', body: event.data.text() || 'Nouvelle notification' };
    }
  }
  const title = data.title || 'GESTIO 229 : Nouvelle entreprise inscrite !';
  const tag = data.tag || ('gestio229-push-' + Date.now());
  const targetUrl = (data.data && data.data.url) ? data.data.url : '/admin/companies';
  const options = {
    body: data.body || 'Une nouvelle entreprise a finalisé son inscription sur GESTIO 229.',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icons/favicon.png',
    vibrate: [300, 100, 300, 100, 300],
    data: Object.assign({ url: targetUrl, receivedAt: Date.now() }, data.data || {}),
    tag: tag,
    renotify: true,
    requireInteraction: true,
    actions: [{ action: 'open_admin', title: 'Ouvrir Super Admin' }]
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
  const rawUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/admin/companies';
  const fullTargetUrl = new URL(rawUrl, self.location.origin).href;
  const clickPromise = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
    for (const client of windowClients) {
      if (client.url && client.url.includes('/admin') && 'focus' in client) {
        if ('navigate' in client && fullTargetUrl) client.navigate(fullTargetUrl);
        return client.focus();
      }
    }
    for (const client of windowClients) {
      if ('focus' in client) {
        if ('navigate' in client && fullTargetUrl) client.navigate(fullTargetUrl);
        return client.focus();
      }
    }
    if (self.clients && self.clients.openWindow) {
      return self.clients.openWindow(fullTargetUrl);
    }
  });
  event.waitUntil(clickPromise);
});
`;
    swContent += embeddedPushHandler;
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(distSw, swContent, 'utf8');
    console.log('✅ [GESTIO 229] Écouteurs Push et Clic injectés avec succès dans dist/sw.js.');
  } else {
    console.log('✅ [GESTIO 229] dist/sw.js est déjà configuré pour les notifications Push.');
  }
}
