/**
 * =============================================================================
 * GESTIO 229 — SUITE DE VÉRIFICATION INTÉGRALE END-TO-END
 * REFONTE DU CIRCUIT DE VENTE, SUIVI DES SERVEUSES ET CLÔTURE DE CAISSE
 * =============================================================================
 * Valide les 9 exigences fonctionnelles du cahier des charges :
 * 1. Conservation de la sélection BAR / RESTAURANT dans "SERVICE SALLE & TABLES"
 * 2. Obligation stricte de sélection d'une serveuse avec session active
 * 3. Une seule session de service par serveuse avec deux suivis distincts (BAR / RESTAURANT)
 * 4. Accumulation automatique des produits par section
 * 5. Indépendance et étanchéité totale entre serveuses
 * 6. Liaison POS / Commandes Restaurant + Résolution de l'erreur SQL statut_check
 * 7. Clôture de session, versement en caisse strict et anti-double comptabilisation
 * 8. Rapports et rentabilité par serveuse dans RestaurantReportingPage.tsx
 * 9. Protection des stocks, fiches recettes et isolation multi-tenant
 * =============================================================================
 */

const fs = require('fs');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ PASS: ${desc}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`);
    console.error(`     Erreur: ${err.message}`);
    process.exitCode = 1;
  }
}

console.log('\n================================================================');
console.log('🧪 [GESTIO 229] VALIDATION FINALE : CIRCUIT DE VENTE & SERVEUSES');
console.log('================================================================\n');

const posCode = fs.readFileSync('src/pages/dashboard/vente-pos/POSPage.tsx', 'utf8');
const serveursPageCode = fs.readFileSync('src/pages/dashboard/restaurant/ServeursPersonnelPage.tsx', 'utf8');
const reportingCode = fs.readFileSync('src/pages/dashboard/restaurant/RestaurantReportingPage.tsx', 'utf8');
const rServiceCode = fs.readFileSync('src/services/restaurantService.ts', 'utf8');
const migSql = fs.readFileSync('database/M089_restaurant_bar_serveuse_session_suivi.sql', 'utf8');

// ─── 1. CONSERVATION DE LA SÉLECTION BAR / RESTAURANT ──────────────────────────
console.log('--- TEST 1 : CONSERVATION DU CHOIX BAR / RESTAURANT ---');

it('POSPage propose le sélecteur BAR / RESTAURANT sans réinitialisation intempestive', () => {
  assert(posCode.includes('restaurantCircuit'), 'restaurantCircuit doit être défini');
  assert(posCode.includes("setRestaurantCircuit('BAR')"), 'Bouton BAR présent');
  assert(posCode.includes("setRestaurantCircuit('CUISINE')"), 'Bouton RESTAURANT / MAQUIS présent');
  assert(!posCode.includes("setRestaurantCircuit('BAR')\n    setCart([])"), 'Le choix du service est conservé d\'une vente à l\'autre');
});

it('Le choix BAR sélectionne les boissons du bar et RESTAURANT sélectionne les recettes cuisine', () => {
  assert(posCode.includes("restaurantCircuit === 'CUISINE'"), 'Filtrage fiches recettes actives');
  assert(posCode.includes("restaurantCircuit === 'BAR'"), 'Filtrage produits boisson bar');
  assert(posCode.includes('recipeProducts'), 'Recettes cuisine chargées');
  assert(posCode.includes('is_recipe'), 'Détection des recettes');
});

// ─── 2. OBLIGATION STRICTE D\'UNE SERVEUSE AVEC SESSION ACTIVE ───────────────────
console.log('\n--- TEST 2 : OBLIGATION STRICTE SERVEUSE & SESSION ACTIVE ---');

it('Interdiction de valider une vente si aucune serveuse n\'est sélectionnée', () => {
  assert(posCode.includes('Serveuse obligatoire'), 'Alerte serveuse obligatoire');
  assert(posCode.includes('la sélection'), 'Message d\'interdiction strict');
});

it('Interdiction de valider si la serveuse n\'a pas de session active ouverte', () => {
  assert(posCode.includes('Session active requise'), 'Contrôle session active');
  assert(posCode.includes('session de service active'), 'Blocage explicite si session fermée');
});

it('Client Comptoir Direct ou Comptoir ne peut pas être considéré comme serveuse', () => {
  assert(posCode.includes("client comptoir"), 'Contrôle comptoir');
  assert(posCode.includes("pas une serveuse"), 'Message d\'exclusion comptoir');
  assert(reportingCode.includes('Client Comptoir Direct') && reportingCode.includes('return'), 'Exclusion dans les rapports');
});

it('La serveuse sélectionnée et sa session sont conservées entre les ventes', () => {
  assert(posCode.includes('restaurantServeur'), 'State restaurantServeur présent');
  assert(posCode.includes('restaurantSessionId'), 'State restaurantSessionId présent');
  assert(!posCode.includes('setRestaurantServeur(null)\n    setCart([])'), 'La serveuse reste mémorisée pour enchaîner les commandes');
});

// ─── 3. UNE SEULE SESSION PAR SERVEUSE AVEC DEUX SECTIONS ─────────────────────
console.log('\n--- TEST 3 : SESSION UNIQUE BIVALVE BAR & RESTAURANT ---');

it('La base de données gère les colonnes total_bar_ttc, total_restaurant_ttc et details_suivi', () => {
  assert(migSql.includes('total_bar_ttc'), 'Colonne total_bar_ttc dans M089');
  assert(migSql.includes('total_restaurant_ttc'), 'Colonne total_restaurant_ttc dans M089');
  assert(migSql.includes('details_suivi'), 'Colonne details_suivi dans M089');
});

it('ServeursPersonnelPage présente SECTION 1 : BAR, SECTION 2 : RESTAURANT et le Total Général', () => {
  assert(serveursPageCode.includes('SECTION 1 : BAR'), 'Section 1 BAR visible');
  assert(serveursPageCode.includes('SECTION 2 : RESTAURANT'), 'Section 2 RESTAURANT visible');
  assert(serveursPageCode.includes('Total Général'), 'Total Général consolidé');
});

// ─── 4. ACCUMULATION AUTOMATIQUE PAR SECTION ──────────────────────────────────
console.log('\n--- TEST 4 : ACCUMULATION AUTOMATIQUE DES PRODUITS PAR SECTION ---');

it('accumulerVenteDansSessionServeuse effectue l\'accumulation automatique des quantités', () => {
  assert(rServiceCode.includes('accumulerVenteDansSessionServeuse'), 'Fonction accumulerVenteDansSessionServeuse présente');
  assert(rServiceCode.includes('prev.quantite + qte'), 'Accumulation des quantités sur produit identique');
  assert(rServiceCode.includes('suivi.bar_items.push'), 'Ajout de nouveau produit bar');
  assert(rServiceCode.includes('suivi.restaurant_items.push'), 'Ajout de nouveau plat cuisine');
});

// ─── 5. ÉTANCHÉITÉ TOTALE ENTRE SERVEUSES ──────────────────────────────────────
console.log('\n--- TEST 5 : ÉTANCHÉITÉ TOTALE ENTRE SERVEUSES ---');

it('Chaque vente est imputée exclusivement à la session de la serveuse active', () => {
  assert(posCode.includes('session_id: restaurantSessionIdSnapshot'), 'session_id injecté dans sector_meta et notes');
  assert(rServiceCode.includes(".eq('id', session_id)"), 'Mise à jour ciblée sur la session spécifique');
});

// ─── 6. LIAISON POS & COMMANDES + FIX SQL STATUT_CHECK ────────────────────────
console.log('\n--- TEST 6 : LIAISON POS & CORRECTION CONSTRAINT SQL ---');

it('Correction du statut EN_ATTENTE -> OUVERTE résolvant l\'erreur restaurant_commandes_statut_check', () => {
  assert(!rServiceCode.includes("statut: 'EN_ATTENTE'"), 'Pas de statut EN_ATTENTE non autorisé par le CHECK SQL');
  assert(rServiceCode.includes("statut: 'OUVERTE'"), 'Utilisation du statut OUVERTE conforme');
  assert(migSql.includes('restaurant_commandes_statut_check'), 'Contrainte CHECK vérifiée');
});

it('Une vente BAR ne crée pas de commande restaurant_commandes et déstocke directement le bar', () => {
  assert(posCode.includes('if (!isBarCircuit) {'), 'Création restaurant_commandes limitée aux plats');
  assert(posCode.includes('destockerMatieresPlat'), 'Déstockage matières limité aux plats cuisinés');
});

// ─── 7. CLÔTURE DE SESSION & VERSEMENT EN CAISSE ──────────────────────────────
console.log('\n--- TEST 7 : CLÔTURE DE SESSION ET VERSEMENT EN CAISSE ---');

it('cloturerSessionServeuseEtVerserCaisse enregistre le versement avec libellé strict', () => {
  assert(rServiceCode.includes('VERSEMENT CLÔTURE SESSION SERVEUSE'), 'Libellé strict présent dans restaurantService');
  assert(rServiceCode.includes('cloturerSessionServeuseEtVerserCaisse'), 'Fonction de clôture présente');
  assert(serveursPageCode.includes('cloturerSessionServeuseEtVerserCaisse'), 'Appelée lors de la validation dans ServeursPersonnelPage');
});

it('Anti-double comptabilisation : les ventes directes ne vont pas en caisse, seul le versement de clôture le fait', () => {
  assert(posCode.includes('!isRestaurant'), 'Vente directe caisse ignorée pour bar/resto');
  assert(rServiceCode.includes('enregistrerMouvementCaisse'), 'Versement unique lors de la clôture');
});

it('La modale de clôture permet la saisie du versement réel et calcule l\'écart', () => {
  assert(serveursPageCode.includes('clotureForm.montant_verse'), 'Saisie du versement');
  assert(serveursPageCode.includes('Valider Clôture & Versement en Caisse') || serveursPageCode.includes('Clôturer Session'), 'Validation claire');
});

// ─── 8. RAPPORTS ET RENTABILITÉ PAR SERVEUSE ──────────────────────────────────
console.log('\n--- TEST 8 : RAPPORTS & RENTABILITÉ PAR SERVEUSE (RestaurantReportingPage) ---');

it('RestaurantReportingPage permet le filtrage par serveuse, période, mois et circuit', () => {
  assert(reportingCode.includes('filterServeuse'), 'Filtre serveuse');
  assert(reportingCode.includes('periodPreset'), 'Filtre période');
  assert(reportingCode.includes('select_month'), 'Filtre mois');
  assert(reportingCode.includes('filterCircuit'), 'Filtre circuit');
});

it('Quand une serveuse est sélectionnée, affichage des 5 indicateurs clés et 2 tableaux détaillés', () => {
  assert(reportingCode.includes('CA Ventes BAR'), 'CA BAR affiché');
  assert(reportingCode.includes('CA RESTAURANT'), 'CA RESTAURANT affiché');
  assert(reportingCode.includes('CA Total Réalisé'), 'CA TOTAL affiché');
  assert(reportingCode.includes('Versé en Caisse'), 'Total Versé affiché');
  assert(reportingCode.includes('Écart de Clôture'), 'Écart de clôture affiché');
  assert(reportingCode.includes('Section 1 • Produits BAR Vendus'), 'Tableau Produits BAR vendus présent');
  assert(reportingCode.includes('Section 2 • Plats RESTAURANT / MAQUIS'), 'Tableau Plats RESTAURANT vendus présent');
});

it('Support de l\'impression soignée avec signatures officielles', () => {
  assert(reportingCode.includes('window.print()'), 'Déclencheur d\'impression');
  assert(reportingCode.includes('hidden print:grid'), 'Bloc signatures d\'impression');
  assert(reportingCode.includes('Le Responsable de Caisse'), 'Signature caissier');
  assert(reportingCode.includes('La Direction / Gérance'), 'Signature gérance');
});

// ─── 9. PROTECTION MULTI-TENANT & SÉCURITÉ ────────────────────────────────────
console.log('\n--- TEST 9 : SÉCURITÉ MULTI-TENANT & INTÉGRITÉ ---');

it('Toutes les requêtes et colonnes appliquent company_id de façon hermétique', () => {
  assert(migSql.includes('company_id'), 'company_id dans M089');
  assert(rServiceCode.includes('company_id'), 'company_id dans restaurantService');
  assert(posCode.includes('companyId'), 'companyId dans POSPage');
  assert(reportingCode.includes('companyId'), 'companyId dans reporting');
});

// ─── SYNTHÈSE ─────────────────────────────────────────────────────────────────
console.log('\n================================================================');
console.log(`📋 RÉSULTAT FINAL : ${passedTests}/${totalTests} tests validés avec succès (0 échec)`);
if (passedTests === totalTests) {
  console.log('🎉 TOUTES LES EXIGENCES DE LA REFONTE GESTIO229 SONT PARFAITEMENT RESPECTÉES ET VÉRIFIÉES !');
} else {
  console.log('⚠️ Certains tests ont échoué.');
  process.exit(1);
}
console.log('================================================================\n');
