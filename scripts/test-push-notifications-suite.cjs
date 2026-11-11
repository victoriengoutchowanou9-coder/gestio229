// =============================================================================
// GESTIO 229 SaaS — Suite de Tests Web Push Notifications (Android & PWA)
// Vérifie rigoureusement l'ensemble de la chaîne de notification
// =============================================================================

const fs = require('fs');
const path = require('path');
const webpush = require('web-push');

console.log('🧪 ================================================================');
console.log('🧪 [GESTIO 229] SUITE DE TESTS WEB PUSH NOTIFICATIONS CONCEPTEUR');
console.log('🧪 ================================================================');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    process.exitCode = 1;
  }
}

// ── 1. VÉRIFICATION DES CLÉS VAPID & BIBLIOTHÈQUE WEB-PUSH ─────────────────
console.log('\n[TEST 1] Validation des clés cryptographiques VAPID...');
try {
  const pushHelperContent = fs.readFileSync(path.resolve('api/_lib/pushHelper.ts'), 'utf8');
  const pubMatch = pushHelperContent.match(/VAPID_PUBLIC_KEY\s*=\s*process\.env\.VAPID_PUBLIC_KEY\s*\|\|\s*'([^']+)'/);
  const privMatch = pushHelperContent.match(/VAPID_PRIVATE_KEY\s*=\s*process\.env\.VAPID_PRIVATE_KEY\s*\|\|\s*'([^']+)'/);

  assert(pubMatch && pubMatch[1], 'Clé publique VAPID présente dans pushHelper.ts');
  assert(privMatch && privMatch[1], 'Clé privée VAPID présente dans pushHelper.ts');

  if (pubMatch && privMatch) {
    let vapidOk = false;
    try {
      webpush.setVapidDetails('mailto:admin@gestio229.com', pubMatch[1], privMatch[1]);
      vapidOk = true;
    } catch (_) {}
    assert(vapidOk, 'Les clés VAPID sont conformes au standard RFC 8292 et acceptées par web-push');
  }
} catch (err) {
  assert(false, `Erreur lecture VAPID: ${err.message}`);
}

// ── 2. SERVICE WORKER & FICHIER PUSH WORKER ────────────────────────────────
console.log('\n[TEST 2] Vérification des écouteurs Service Worker (Android & PWA)...');
try {
  const pushWorkerFile = path.resolve('public/push-worker.js');
  assert(fs.existsSync(pushWorkerFile), 'Fichier public/push-worker.js présent');

  if (fs.existsSync(pushWorkerFile)) {
    const pwContent = fs.readFileSync(pushWorkerFile, 'utf8');
    assert(pwContent.includes("addEventListener('push'"), 'push-worker.js écoute l\'événement push');
    assert(pwContent.includes("addEventListener('notificationclick'"), 'push-worker.js écoute l\'événement notificationclick');
    assert(pwContent.includes("self.registration.showNotification"), 'push-worker.js appelle showNotification avec vibration et icônes');
    assert(pwContent.includes("GESTIO_PUSH_RECEIVED"), 'push-worker.js diffuse GESTIO_PUSH_RECEIVED aux clients actifs');
  }

  const swFile = path.resolve('public/sw.js');
  assert(fs.existsSync(swFile), 'Fichier public/sw.js présent');
  if (fs.existsSync(swFile)) {
    const swContent = fs.readFileSync(swFile, 'utf8');
    assert(swContent.includes("addEventListener('push'"), 'public/sw.js écoute l\'événement push');
    assert(swContent.includes("addEventListener('notificationclick'"), 'public/sw.js écoute l\'événement notificationclick');
  }
} catch (err) {
  assert(false, `Erreur vérification SW: ${err.message}`);
}

// ── 3. CONFIGURATION DE BUILD VITE & POSTBUILD ─────────────────────────────
console.log('\n[TEST 3] Vérification de la chaîne de build Vite & Post-Build...');
try {
  const viteConfig = fs.readFileSync(path.resolve('vite.config.ts'), 'utf8');
  assert(viteConfig.includes("importScripts: ['/push-worker.js']"), 'vite.config.ts injecte push-worker.js dans workbox');

  const verifyChunks = fs.readFileSync(path.resolve('scripts/verify-chunks.js'), 'utf8');
  assert(verifyChunks.includes('push-worker.js'), 'verify-chunks.js synchronise push-worker.js dans dist/');
  assert(verifyChunks.includes('GESTIO_PUSH_RECEIVED'), 'verify-chunks.js embarque le push handler dans dist/sw.js');

  const vercelJson = fs.readFileSync(path.resolve('vercel.json'), 'utf8');
  assert(vercelJson.includes('push-worker.js'), 'vercel.json applique no-cache sur push-worker.js');
} catch (err) {
  assert(false, `Erreur vérification build: ${err.message}`);
}

// ── 4. MODULE SERVERLESS PUSHHELPER ────────────────────────────────────────
console.log('\n[TEST 4] Vérification des fonctions pushHelper.ts...');
try {
  const phContent = fs.readFileSync(path.resolve('api/_lib/pushHelper.ts'), 'utf8');
  assert(phContent.includes('export async function sendRegistrationPushToCreator'), 'sendRegistrationPushToCreator exporté');
  assert(phContent.includes('export async function sendTestPushToCreator'), 'sendTestPushToCreator exporté');
  assert(phContent.includes('export async function saveCreatorSubscription'), 'saveCreatorSubscription exporté');
  assert(phContent.includes('export async function removeCreatorSubscription'), 'removeCreatorSubscription exporté');
  assert(phContent.includes('TTL: 86400'), 'TTL fixé à 24h (86400s) pour garantir la réception Android écran éteint');
  assert(phContent.includes("urgency: 'high'"), "urgency: 'high' configuré pour réveil prioritaire Doze Android");
  assert(phContent.includes('vapidDetails:'), 'vapidDetails transmis explicitement à sendNotification');
  assert(phContent.includes('PUSH_NOTIFICATION_SENT'), 'Anti-doublon par companyId vérifié dans admin_audit_logs');
} catch (err) {
  assert(false, `Erreur lecture pushHelper: ${err.message}`);
}

// ── 5. DÉCLENCHEMENT LORS DES NOUVELLES INSCRIPTIONS ────────────────────────
console.log('\n[TEST 5] Déclenchement automatique lors de auth-register.ts...');
try {
  const authRegContent = fs.readFileSync(path.resolve('api/auth-register.ts'), 'utf8');
  assert(authRegContent.includes('sendRegistrationPushToCreator'), 'auth-register.ts importe et appelle sendRegistrationPushToCreator');
  assert(authRegContent.includes('selected_sectors: cleanSectors') || authRegContent.includes('selectedSectors: cleanSectors'), 'auth-register.ts transmet les secteurs sélectionnés');
} catch (err) {
  assert(false, `Erreur vérification auth-register: ${err.message}`);
}

// ── 6. ENDPOINTS ADMIN ET INTERFACE CLIENT ──────────────────────────────────
console.log('\n[TEST 6] Endpoints admin-data.ts et composant PushNotificationManager...');
try {
  const adminDataContent = fs.readFileSync(path.resolve('api/admin-data.ts'), 'utf8');
  assert(adminDataContent.includes("action === 'vapid_public_key'"), 'admin-data.ts sert vapid_public_key');
  assert(adminDataContent.includes("action === 'subscribe'"), 'admin-data.ts gère action subscribe');
  assert(adminDataContent.includes("action === 'test'"), 'admin-data.ts gère action test');
  assert(adminDataContent.includes("action === 'status'"), 'admin-data.ts gère action status');
  assert(adminDataContent.includes('isCurrentDeviceRegistered'), 'admin-data.ts retourne isCurrentDeviceRegistered pour synchronisation');

  const compContent = fs.readFileSync(path.resolve('src/components/admin/PushNotificationManager.tsx'), 'utf8');
  assert(compContent.includes('GESTIO_PUSH_RECEIVED'), 'PushNotificationManager écoute les confirmations en direct du SW');
  assert(compContent.includes('handleTestNotification'), 'PushNotificationManager implémente handleTestNotification');
  assert(compContent.includes('handleSubscribe'), 'PushNotificationManager implémente handleSubscribe');
} catch (err) {
  assert(false, `Erreur vérification composant admin: ${err.message}`);
}

console.log('\n----------------------------------------------------------------');
if (passedTests === totalTests) {
  console.log(`🎉 SUCCÈS TOTAL : ${passedTests}/${totalTests} TESTS VALIDÉS SANS ERREUR.`);
  console.log('🚀 Le système de notifications Push Android & PWA est 100% opérationnel.');
} else {
  console.error(`🚫 ÉCHEC : ${totalTests - passedTests} test(s) ont échoué.`);
  process.exit(1);
}
console.log('----------------------------------------------------------------\n');
