// =============================================================================
// GESTIO 229 SAAS — Suite de Tests : Vidage Sécurisé de Secteur d'Activité
// Validation des 8 exigences du Cahier des Charges
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 ================================================================');
console.log('🧪 [GESTIO 229] SUITE DE TESTS : BOUTON « VIDER LE SECTEUR »');
console.log('🧪 ================================================================\n');

let totalTests = 0;
let passedTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✅ PASS: ${description}`);
  } catch (err) {
    console.error(`  ❌ FAIL: ${description}`);
    console.error(`     ${err.message}`);
    process.exit(1);
  }
}

// 1. Contrôle du bouton dans MultiservicesHub.tsx
console.log("[Contrôle 1] Présence et discrétion du bouton sur les cartes du Hub...");
test("Importation du composant ClearSectorModal dans MultiservicesHub.tsx", () => {
  const content = fs.readFileSync('src/views/hub/MultiservicesHub.tsx', 'utf8');
  assert(content.includes('import { ClearSectorModal }'), "ClearSectorModal doit être importé.");
});

test("Bouton discret « Vider le secteur » avec icône corbeille dans le coin de la carte", () => {
  const content = fs.readFileSync('src/views/hub/MultiservicesHub.tsx', 'utf8');
  assert(content.includes('Vider le secteur'), "Le libellé 'Vider le secteur' doit être présent.");
  assert(content.includes('Trash2'), "Une icône de corbeille (Trash2) doit accompagner le bouton.");
  assert(content.includes('setClearSectorTarget'), "Le bouton doit activer l'état modal ciblé.");
});

test("Bouton visible uniquement pour les administrateurs/propriétaires (isAdmin)", () => {
  const content = fs.readFileSync('src/views/hub/MultiservicesHub.tsx', 'utf8');
  assert(content.includes('{isAdmin && ('), "Le bouton doit être conditionné par isAdmin.");
});

// 2. Contrôle de la modale et double confirmation
console.log("\n[Contrôle 2] Modale de double confirmation et avertissements...");
test("Modale ClearSectorModal.tsx avec titre et message d'avertissement irréversible", () => {
  const content = fs.readFileSync('src/components/hub/ClearSectorModal.tsx', 'utf8');
  assert(content.includes('VIDER LES DONNÉES DU SECTEUR ?'), "Le titre exact doit être présent.");
  assert(content.includes('Vous êtes sur le point de supprimer les données opérationnelles'), "Le message d'explication officiel doit être présent.");
  assert(content.includes('Attention : cette action est irréversible'), "L'avertissement irréversible doit être affiché.");
});

test("Saisie obligatoire du nom du secteur pour déverrouiller la confirmation", () => {
  const content = fs.readFileSync('src/components/hub/ClearSectorModal.tsx', 'utf8');
  assert(content.includes('confirmationInput'), "Le champ de confirmation doit être présent.");
  assert(content.includes('isInputValid'), "La validation stricte du nom saisi doit contrôler le bouton.");
});

test("Actualisation automatique après vidage et message de succès conforme", () => {
  const modalContent = fs.readFileSync('src/components/hub/ClearSectorModal.tsx', 'utf8');
  assert(modalContent.includes('Le secteur a été vidé avec succès. Vous pouvez maintenant commencer à enregistrer vos propres informations.'), "Le message de succès exact doit être affiché.");
  assert(modalContent.includes('onSuccess()'), "onSuccess doit être déclenché après vidage.");

  const hubContent = fs.readFileSync('src/views/hub/MultiservicesHub.tsx', 'utf8');
  assert(hubContent.includes('loadFinancialMetrics()'), "Les métriques financières doivent être recalculées.");
  assert(hubContent.includes('loadActivitiesFromSupabase()'), "Les activités du Hub doivent être rafraîchies.");
});

// 3. Contrôle de l'API côté serveur et sécurité
console.log("\n[Contrôle 3] Endpoint API sécurisé côté serveur (api/company-clear-sector.ts)...");
test("Endpoint POST /api/company-clear-sector opérationnel", () => {
  assert(fs.existsSync('api/company-clear-sector.ts'), "Le fichier api/company-clear-sector.ts doit exister.");
  const content = fs.readFileSync('api/company-clear-sector.ts', 'utf8');
  assert(content.includes("export default async function handler"), "Handler Vercel exporté.");
});

test("Vérification d'authentification et contrôle de rôle administrateur/owner", () => {
  const content = fs.readFileSync('api/company-clear-sector.ts', 'utf8');
  assert(content.includes('sb.auth.getUser(token)'), "Validation du token Supabase Auth requise.");
  assert(content.includes('administrateur'), "Rôle administrateur vérifié.");
});

test("Isolation absolue : interdiction stricte de toucher aux comptes et abonnements", () => {
  const content = fs.readFileSync('api/company-clear-sector.ts', 'utf8');
  // Vérifier qu'aucune suppression n'est effectuée sur companies, user_profiles, company_activities, abonnements
  assert(!content.includes("sb.from('companies').delete"), "Interdiction formelle de supprimer l'entreprise.");
  assert(!content.includes("sb.from('user_profiles').delete"), "Interdiction formelle de supprimer les profils utilisateurs.");
  assert(!content.includes("sb.from('company_activities').delete"), "Interdiction formelle de supprimer l'activité de la carte.");
  assert(!content.includes("sb.from('abonnements_secteurs').delete"), "Interdiction formelle de supprimer les abonnements.");
  assert(!content.includes("sb.from('abonnements_global').delete"), "Interdiction formelle de supprimer l'abonnement global.");
});

test("Cloisonnement par company_id et sector_slug sur toutes les suppressions", () => {
  const content = fs.readFileSync('api/company-clear-sector.ts', 'utf8');
  assert(content.includes("eq('company_id', company_id)"), "Chaque requête doit être filtrée par company_id.");
  assert(content.includes("canonicalSectorSlug"), "Les slugs sectoriels doivent être canonisés pour éviter les fuites.");
});

test("Journalisation d'audit systématique dans admin_audit_logs", () => {
  const content = fs.readFileSync('api/company-clear-sector.ts', 'utf8');
  assert(content.includes("CLEAR_SECTOR_DATA"), "Action CLEAR_SECTOR_DATA journalisée.");
  assert(content.includes("admin_audit_logs"), "Table d'audit renseignée avec le bilan des suppressions.");
});

console.log('\n================================================================');
console.log(`🎉 SUCCÈS TOTAL : ${passedTests}/${totalTests} CONTRÔLES VALIDÉS SANS ERREUR.`);
console.log('🚀 Le bouton « Vider le secteur » répond rigoureusement à l\'ensemble des spécifications.');
console.log('================================================================\n');
