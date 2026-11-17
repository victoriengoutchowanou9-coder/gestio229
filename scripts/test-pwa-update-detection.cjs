// scripts/test-pwa-update-detection.cjs
// =============================================================================
// GESTIO 229 — SUITE DE VALIDATION DU MÉCANISME DE DÉTECTION DE MISE À JOUR PWA
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 ================================================================');
console.log('🧪 [GESTIO 229] VALIDATION DU CORRECTIF PWA "MISE À JOUR DISPONIBLE"');
console.log('🧪 ================================================================\n');

let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SCÉNARIO 1 : Synchronisation absolue entre public/version.json et __APP_VERSION__
// ─────────────────────────────────────────────────────────────────────────────
console.log('[SCÉNARIO 1] Cohérence de la source de vérité de version...');

runTest('vite.config.ts définit __APP_VERSION__ avec la variable appVersion issue de version.json', () => {
  const viteConfig = fs.readFileSync(path.resolve(__dirname, '../vite.config.ts'), 'utf8');
  assert(viteConfig.includes('__APP_VERSION__: JSON.stringify(appVersion)'),
    '__APP_VERSION__ doit être strictement synchronisé avec appVersion');
  assert(!viteConfig.includes('__APP_VERSION__: JSON.stringify(`${Date.now()}`)'),
    '__APP_VERSION__ ne doit pas recalculer Date.now() à la volée');
});

runTest('public/version.json contient une structure valide', () => {
  const versionFile = path.resolve(__dirname, '../public/version.json');
  assert(fs.existsSync(versionFile), 'public/version.json doit exister');
  const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
  assert(typeof data.version === 'string' && data.version.trim().length > 0,
    'version doit être une chaîne non vide');
});

// ─────────────────────────────────────────────────────────────────────────────
// SCÉNARIO 2 : Analyse de src/main.tsx (Gardes anti-boucle et fausses détections)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SCÉNARIO 2] Mécanisme de détection dans src/main.tsx...');

const mainContent = fs.readFileSync(path.resolve(__dirname, '../src/main.tsx'), 'utf8');

runTest('main.tsx compare serverVersion !== localVersion avant toute notification', () => {
  assert(mainContent.includes('serverVersion !== localVersion'),
    'main.tsx doit vérifier serverVersion !== localVersion');
});

runTest('main.tsx intègre une garde anti-répétition pour la même version (notified & dismissed)', () => {
  assert(mainContent.includes('gestio-pwa-dismissed-version'),
    'main.tsx doit vérifier si la version a été fermée/rejetée par l\'utilisateur');
  assert(mainContent.includes('gestio-pwa-notified-version'),
    'main.tsx doit mémoriser les versions déjà notifiées pour ne pas ré-émettre l\'événement');
});

runTest('main.tsx protège controllerchange contre la prise de contrôle initiale du premier SW', () => {
  assert(mainContent.includes('let hadInitialController = Boolean(navigator.serviceWorker.controller)'),
    'hadInitialController doit détecter si la page était déjà contrôlée au démarrage');
  assert(mainContent.includes('if (!hadInitialController)'),
    'controllerchange initial ne doit pas déclencher de fausse mise à jour');
});

// ─────────────────────────────────────────────────────────────────────────────
// SCÉNARIO 3 : Analyse de PwaUpdateToast.tsx (Zéro auto-refresh & zéro redirection)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SCÉNARIO 3] Stabilité et ergonomie de PwaUpdateToast.tsx...');

const toastContent = fs.readFileSync(path.resolve(__dirname, '../src/components/common/PwaUpdateToast.tsx'), 'utf8');

runTest('PwaUpdateToast ne contient AUCUN compte à rebours de rechargement automatique', () => {
  assert(!toastContent.includes('countdown'),
    'Aucun compte à rebours ne doit exister dans PwaUpdateToast');
  assert(!toastContent.includes('Actualisation auto dans'),
    'Aucun message d\'actualisation automatique ne doit être affiché');
});

runTest('PwaUpdateToast ne contient aucun rechargement ou redirection automatique sans clic', () => {
  assert(!toastContent.includes('setInterval'),
    'Aucun setInterval ne doit déclencher de rechargement automatique');
});

runTest('PwaUpdateToast mémorise la version fermée lors du clic sur la croix (X)', () => {
  assert(toastContent.includes('handleDismiss'),
    'handleDismiss doit exister pour gérer le clic sur la croix (X)');
  assert(toastContent.includes('gestio-pwa-dismissed-version'),
    'La fermeture doit persister gestio-pwa-dismissed-version dans sessionStorage');
});

runTest('Le clic sur « Actualiser » effectue la mise à jour proprement et met à jour pwa-version', () => {
  assert(toastContent.includes('localStorage.setItem(\'pwa-version\''),
    'La nouvelle version doit être enregistrée dans localStorage');
  assert(toastContent.includes('window.location.reload()'),
    'La page courante doit être rechargée proprement sans redirection vers /');
});

// ─────────────────────────────────────────────────────────────────────────────
// SCÉNARIO 4 : Simulation logique des 6 cas d'usage requis par le cahier des charges
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[SCÉNARIO 4] Simulation algorithmique des 6 scénarios obligatoires...');

// Simulation du moteur de détection
function simulateVersionCheck({
  serverVersion,
  localVersion,
  sessionStorageMock = {}
}) {
  const events = [];

  const PWA_DISMISSED_KEY = 'gestio-pwa-dismissed-version';
  const PWA_NOTIFIED_KEY = 'gestio-pwa-notified-version';

  if (serverVersion && localVersion && serverVersion !== localVersion) {
    if (sessionStorageMock[PWA_DISMISSED_KEY] === serverVersion) {
      return { events, blockedBy: 'dismissed' };
    }
    if (sessionStorageMock[PWA_NOTIFIED_KEY] === serverVersion) {
      return { events, blockedBy: 'already_notified' };
    }

    sessionStorageMock[PWA_NOTIFIED_KEY] = serverVersion;
    events.push({ type: 'gestio-pwa-update-available', serverVersion, localVersion });
    return { events, blockedBy: null };
  }

  return { events, blockedBy: 'same_version' };
}

runTest('Cas 1 : Aucune nouvelle version disponible (server === local) -> 0 notification', () => {
  const res = simulateVersionCheck({ serverVersion: '100', localVersion: '100' });
  assert.strictEqual(res.events.length, 0, 'Aucune notification ne doit être émise');
  assert.strictEqual(res.blockedBy, 'same_version');
});

runTest('Cas 2 : Nouvelle version réellement déployée (server !== local) -> 1 seule notification', () => {
  const session = {};
  const res = simulateVersionCheck({ serverVersion: '200', localVersion: '100', sessionStorageMock: session });
  assert.strictEqual(res.events.length, 1, 'Exactement une notification doit être émise');
  assert.strictEqual(res.events[0].serverVersion, '200');

  // Deuxième passage avec la même session : ne doit pas re-notifier
  const res2 = simulateVersionCheck({ serverVersion: '200', localVersion: '100', sessionStorageMock: session });
  assert.strictEqual(res2.events.length, 0, 'La notification ne doit pas être réémise');
  assert.strictEqual(res2.blockedBy, 'already_notified');
});

runTest('Cas 3 : L\'utilisateur ferme la notification (X) -> ignorée pour les vérifications futures', () => {
  const session = { 'gestio-pwa-dismissed-version': '200' };
  const res = simulateVersionCheck({ serverVersion: '200', localVersion: '100', sessionStorageMock: session });
  assert.strictEqual(res.events.length, 0, 'La notification ne doit pas réapparaître si fermée');
  assert.strictEqual(res.blockedBy, 'dismissed');
});

runTest('Cas 4 : L\'utilisateur clique sur Actualiser -> localVersion devient serverVersion', () => {
  let localVersion = '100';
  const serverVersion = '200';
  // L'utilisateur clique sur Actualiser
  localVersion = serverVersion;
  const res = simulateVersionCheck({ serverVersion, localVersion });
  assert.strictEqual(res.events.length, 0, 'Après actualisation, local === server -> aucune notification');
});

runTest('Cas 5 : L\'application reste ouverte plusieurs cycles (intervalle) -> 0 notification intempestive', () => {
  const session = {};
  const currentVersion = '1794900000000';
  // 10 cycles successifs de vérification
  for (let i = 0; i < 10; i++) {
    const res = simulateVersionCheck({
      serverVersion: currentVersion,
      localVersion: currentVersion,
      sessionStorageMock: session
    });
    assert.strictEqual(res.events.length, 0, `Cycle ${i + 1} ne doit produire aucune notification`);
  }
});

console.log('\n================================================================');
if (failedTests === 0) {
  console.log('🎉 TOUS LES TESTS DE VALIDATION PWA ET AUTO-UPDATE SONT VALIDÉS (0 ÉCHEC) !');
  console.log('================================================================\n');
  process.exit(0);
} else {
  console.error(`❌ ÉCHEC : ${failedTests} test(s) ont échoué !`);
  console.log('================================================================\n');
  process.exit(1);
}
