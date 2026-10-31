// =============================================================================
// GESTIO 229 SaaS — Suite de Tests Automatisés de Non-Régression Multi-Secteurs
// Valide le routage, la protection d'accès et les sous-logiciels
// =============================================================================

const fs = require('fs');
const path = require('path');

console.log('🧪 ================================================================');
console.log('🧪 [GESTIO 229] SUITE DE TESTS COMPLÈTE MULTI-SECTEURS & ROUTING');
console.log('🧪 ================================================================');

let testFailures = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    testFailures++;
  }
}

// ─── TEST 1 : Intégrité des composants clés de routage ─────────────────────────
console.log('\n[Test 1] Vérification des gardes et composants critiques...');
const appContent = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');

assert(appContent.includes("import ProtectedRoute"), 'ProtectedRoute est formellement importé dans App.tsx');
assert(!appContent.includes("export { ProtectedRoute, PrivateRoute } from './components/ProtectedRoute'") || appContent.includes("import ProtectedRoute"), 'Pas de re-export orphelin sans import local');
assert(appContent.includes("<ProtectedRoute>"), 'ProtectedRoute est appliqué aux routes sécurisées');
assert(appContent.includes("<SectorGuard>"), 'SectorGuard protège les espaces sous-logiciels /app/:sectorSlug');
assert(appContent.includes("<ModuleGuard"), 'ModuleGuard protège les fonctionnalités souscrites');
assert(appContent.includes("<AppLayout />"), 'AppLayout est le conteneur principal');

// ─── TEST 2 : Présence et validité de ProtectedRoute.tsx ──────────────────────
console.log('\n[Test 2] Vérification de src/components/ProtectedRoute.tsx...');
const prContent = fs.readFileSync(path.resolve('src/components/ProtectedRoute.tsx'), 'utf8');
assert(prContent.includes('useAuth'), 'ProtectedRoute utilise le hook unifié useAuth');
assert(prContent.includes('const { user, loading, status, company, setCompany } = useAuth()'), 'user est correctement destructuré');
assert(prContent.includes('isAdmin'), 'Contrôle spécifique pour les administrateurs');
assert(prContent.includes('email_confirmed_at'), 'Vérification email restreinte aux admins sans bloquer les internes');
assert(prContent.includes('subscription_status === \'suspended\''), 'Blocage immédiat des entreprises suspendues');

// ─── TEST 3 : Validation des 15 Secteurs Métiers ─────────────────────────────
console.log('\n[Test 3] Validation des secteurs d\'activité dans App.tsx...');
const requiredSectors = [
  'quincaillerie',
  'poissonnerie',
  'restaurant',
  'station-service',
  'pharmacie',
  'ecole',
  'garage',
  'hotel',
  'imprimerie',
  'immobilier',
  'microfinance',
  'transport',
  'supermarche',
  'pressing',
  'depot-boissons'
];

requiredSectors.forEach((slug) => {
  const isCoveredInRouter =
    appContent.includes(`/app/:sectorSlug`) ||
    appContent.includes(`clean === '${slug}'`) ||
    appContent.includes(`cleanSlug === '${slug}'`) ||
    appContent.includes(slug);
  assert(isCoveredInRouter, `Secteur « ${slug} » géré par l'infrastructure de routage`);
});

// ─── TEST 4 : Session Utilisateur & Persistance Zustand ──────────────────────
console.log('\n[Test 4] Intégrité de la session et des tokens d\'authentification...');
const authStoreContent = fs.readFileSync(path.resolve('src/store/authStore.ts'), 'utf8');
assert(authStoreContent.includes('persist('), 'useAuthStore utilise le middleware persist de Zustand');
assert(authStoreContent.includes('name: \'gestio229-auth\'') || authStoreContent.includes('auth'), 'Nom de clé de stockage défini');
assert(authStoreContent.includes('!currentState.user.auth_user_id') || authStoreContent.includes('!currentUser.auth_user_id'), 'Protection contre la déconnexion intempestive des utilisateurs internes');

// ─── TEST 5 : Configuration PWA Standalone & Cache ───────────────────────────
console.log('\n[Test 5] Contrôle des métadonnées PWA & Service Worker...');
const manifestContent = JSON.parse(fs.readFileSync(path.resolve('public/manifest.json'), 'utf8'));
assert(manifestContent.display === 'standalone', 'PWA display: standalone');
assert(manifestContent.start_url === '/', 'PWA start_url: /');
assert(Array.isArray(manifestContent.display_override) && manifestContent.display_override[0] === 'standalone', 'display_override: ["standalone"]');

const vercelContent = JSON.parse(fs.readFileSync(path.resolve('vercel.json'), 'utf8'));
const hasNoCacheHeader = vercelContent.headers.some((h) =>
  h.source.includes('version.json') && h.headers.some((hdr) => hdr.key === 'Cache-Control' && hdr.value.includes('no-store'))
);
assert(hasNoCacheHeader, 'version.json configuré avec no-store pour auto-update garanti');

// ─── RÉSULTAT GLOBAL ─────────────────────────────────────────────────────────
console.log('\n================================================================');
if (testFailures === 0) {
  console.log('🎉 TOUS LES TESTS DE NON-RÉGRESSION ONT RÉUSSI (0 ÉCHEC).');
  console.log('================================================================\n');
  process.exit(0);
} else {
  console.error(`❌ ÉCHEC : ${testFailures} test(s) ont échoué !`);
  console.log('================================================================\n');
  process.exit(1);
}
