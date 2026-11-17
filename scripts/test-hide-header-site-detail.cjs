// scripts/test-hide-header-site-detail.cjs
// =============================================================================
// GESTIO 229 — VALIDATION DU MASQUAGE DE L'EN-TÊTE DANS LA VUE DÉTAIL D'UN SITE
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 ================================================================');
console.log('🧪 [GESTIO 229] TEST : MASQUAGE EN-TÊTE GLOBAL VUE DÉTAILLÉE SITE');
console.log('🧪 ================================================================\n');

const hubPath = path.resolve(__dirname, '../src/views/hub/MultiservicesHub.tsx');
assert(fs.existsSync(hubPath), 'Le fichier MultiservicesHub.tsx doit exister');
const hubContent = fs.readFileSync(hubPath, 'utf8');

// Test 1 : Vérification de la présence de la condition !selectedSiteId sur l'en-tête global
console.log('[Test 1] Contrôle de la condition d\'affichage conditionnel...');
const hasConditionalHeader = hubContent.includes('{!selectedSiteId && (\n        <div className="w-full max-w-none px-3 lg:px-4 mb-8">') ||
  hubContent.includes('{!selectedSiteId && (') && hubContent.includes('HUB CENTRAL MULTISERVICES — GESTIO 229');

assert(hasConditionalHeader, 'L\'en-tête global du Hub doit être conditionné par !selectedSiteId');
console.log('  ✅ PASS: En-tête global correctement enveloppé dans {!selectedSiteId && (...)}');

// Test 2 : Préservation de tous les éléments d'en-tête (non supprimés définitivement)
console.log('\n[Test 2] Contrôle de l\'intégrité des éléments de l\'en-tête...');
assert(hubContent.includes('HUB CENTRAL MULTISERVICES — GESTIO 229'), 'Badge Hub préservé');
assert(hubContent.includes('globalBadgeText'), 'Badge statut abonnement/essai préservé');
assert(hubContent.includes('companyName'), 'Nom de l\'entreprise préservé');
assert(hubContent.includes('companyIfu'), 'Numéro IFU préservé');
assert(hubContent.includes('companyRegime'), 'Régime fiscal préservé');
assert(hubContent.includes('Entreprise'), 'Bouton Entreprise préservé');
assert(hubContent.includes('Mon Abonnement'), 'Bouton Mon Abonnement préservé');
assert(hubContent.includes('Ajouter une activité'), 'Bouton Ajouter une activité préservé');
assert(hubContent.includes('Déconnexion'), 'Bouton Déconnexion préservé');
console.log('  ✅ PASS: Tous les éléments d\'en-tête sont intégralement préservés pour la vue Hub');

// Test 3 : Intégrité de SiteDetailView
console.log('\n[Test 3] Contrôle de l\'affichage de SiteDetailView...');
assert(hubContent.includes('<SiteDetailView'), 'SiteDetailView est bien monté');
assert(hubContent.includes('selectedSiteId && (() => {'), 'SiteDetailView activé quand selectedSiteId est présent');
console.log('  ✅ PASS: SiteDetailView est affiché directement sans interférence');

console.log('\n================================================================');
console.log('🎉 TOUS LES TESTS DE MASQUAGE DE L\'EN-TÊTE SITE SONT VALIDÉS (0 ÉCHEC) !');
console.log('================================================================\n');
process.exit(0);
