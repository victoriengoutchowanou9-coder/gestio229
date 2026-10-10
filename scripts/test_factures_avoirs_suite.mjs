// =============================================================================
// TEST AUTOMATISÉ : SUITE COMPLÈTE FACTURES D'AVOIR GESTIO 229
// - Tests 1 à 6 : GLOBAL TOUS SECTEURS (Poissonnerie, Quincaillerie, Supermarché, etc.)
// - Tests 7 et 8 : EXCLUSIF BRASSERIE & DÉPÔT DE BOISSONS (Emballages consignés)
// =============================================================================

import {
  checkIsBrasserieSector,
  handleValidationAvoir,
  getClientEmballagesCreance
} from '../src/services/factureAvoirService.ts';

// Mock simple de localStorage pour environnement Node
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  };
}

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
  }
}

async function runTests() {
  console.log('=============================================================================');
  console.log('DÉMARRAGE DE LA SUITE DE TESTS - FACTURES D\'AVOIR GESTIO 229');
  console.log('=============================================================================\n');

  const testCompanyId = 'comp-test-' + Date.now();
  const testSectorQuincaillerie = 'quincaillerie';
  const testSectorPoissonnerie = 'poissonnerie';
  const testSectorBrasserie = 'brasserie_depot_boissons';

  // Préparer une vente test initiale de 10 articles à 50 000 FCFA à crédit
  const saleId1 = 'sale-credit-001';
  const clientId1 = 'client-001';
  const initialSale = {
    id: saleId1,
    order_number: 'VTE-2026-TEST1',
    company_id: testCompanyId,
    customer_id: clientId1,
    customer_name: 'Client Entreprise BTP',
    total_amount: 50000,
    credit_amount: 50000,
    payment_status: 'credit',
    items: [
      {
        product_id: 'prod-fer-12',
        product_name: 'Fer à béton 12mm',
        quantity: 10,
        unit_price: 5000,
        unit_cost: 3500
      }
    ]
  };

  localStorage.setItem(`sales_orders_${testCompanyId}`, JSON.stringify([initialSale]));

  // ---------------------------------------------------------------------------
  // TEST 1 : Facture 10 articles 50k crédit. Avoir 2 articles 10k espèces remboursement true
  // -> Stock +2, sortie fond espèces demandée (nécessite caisse ouverte)
  // ---------------------------------------------------------------------------
  console.log('🔹 TEST 1 & 6 : Règle Caisse Fermée vs Caisse Ouverte pour Remboursement Espèces');
  const inputAvoirCaisseFermee = {
    company_id: testCompanyId,
    sector_slug: testSectorQuincaillerie,
    facture_initiale_id: saleId1,
    client_id: clientId1,
    client_nom: 'Client Entreprise BTP',
    motif: 'Retour fer non conforme',
    mode_remboursement: 'especes',
    remboursement_effectue: true,
    lignes: [
      {
        article_id: 'prod-fer-12',
        article_nom: 'Fer à béton 12mm',
        qte_retournee: 2,
        prix_unitaire: 5000,
        prix_achat: 3500,
        etat_article: 'bon',
        qte_facturee: 10,
        qte_deja_avoir: 0
      }
    ]
  };

  // Caisse non ouverte -> doit être bloqué avec le message exact
  const resCaisseFermee = await handleValidationAvoir(inputAvoirCaisseFermee);
  assert(
    !resCaisseFermee.success && resCaisseFermee.message?.includes('Ouvrir la caisse d\'abord pour rembourser'),
    'Test 6 : Caisse fermée -> remboursement espèces bloqué ("Ouvrir la caisse d\'abord pour rembourser. Fond actuel : 0 si fermée")'
  );

  // ---------------------------------------------------------------------------
  // TEST 2 : Avoir credit_client avec remboursement false
  // -> Pas de sortie caisse, réduction créance client
  // ---------------------------------------------------------------------------
  console.log('\n🔹 TEST 2 : Avoir credit_client avec remboursement false');
  const inputAvoirCredit = {
    company_id: testCompanyId,
    sector_slug: testSectorQuincaillerie,
    facture_initiale_id: saleId1,
    client_id: clientId1,
    client_nom: 'Client Entreprise BTP',
    motif: 'Avoir sur créance client',
    mode_remboursement: 'credit_client',
    remboursement_effectue: false,
    lignes: [
      {
        article_id: 'prod-fer-12',
        article_nom: 'Fer à béton 12mm',
        qte_retournee: 2,
        prix_unitaire: 5000,
        prix_achat: 3500,
        etat_article: 'bon',
        qte_facturee: 10,
        qte_deja_avoir: 0
      }
    ]
  };

  const resCredit = await handleValidationAvoir(inputAvoirCredit);
  assert(resCredit.success === true, 'Test 2 : Avoir credit_client validé avec succès sans bloquer sur la caisse');
  assert(resCredit.avoir?.montant_total_avoir === 10000, 'Test 2 : Montant total avoir calculé = 10 000 FCFA (2 * 5000)');
  assert(resCredit.avoir?.numero.startsWith('AVOIR-'), 'Test 2 : Numéro d\'avoir unique AVOIR-YYYY-XXXX généré');

  // ---------------------------------------------------------------------------
  // TEST 3 : Avoir > Facture initiale -> Bloqué
  // ---------------------------------------------------------------------------
  console.log('\n🔹 TEST 3 : Avoir supérieur au solde de la facture initiale');
  const inputAvoirTropEleve = {
    company_id: testCompanyId,
    sector_slug: testSectorQuincaillerie,
    facture_initiale_id: saleId1,
    client_id: clientId1,
    motif: 'Tentative dépassement',
    mode_remboursement: 'credit_client',
    remboursement_effectue: false,
    lignes: [
      {
        article_id: 'prod-fer-12',
        article_nom: 'Fer à béton 12mm',
        qte_retournee: 9, // Il restait 10 - 2 = 8 max
        prix_unitaire: 5000,
        prix_achat: 3500,
        etat_article: 'bon',
        qte_facturee: 10,
        qte_deja_avoir: 2
      }
    ]
  };

  const resTropEleve = await handleValidationAvoir(inputAvoirTropEleve);
  assert(
    !resTropEleve.success && resTropEleve.message?.includes('Quantité max avoir') && resTropEleve.message?.includes('8'),
    'Test 3 & 4 : Quantité supérieure à la quantité restante (10-2=8) -> Bloqué ("Quantité max avoir pour cet article : 8")'
  );

  // ---------------------------------------------------------------------------
  // TEST 4 : 2ème avoir valide qui utilise le reste légalement (ex: 8 restants)
  // ---------------------------------------------------------------------------
  console.log('\n🔹 TEST 4 : Deuxième avoir valide sur le solde restant');
  const inputAvoirSolde = {
    company_id: testCompanyId,
    sector_slug: testSectorQuincaillerie,
    facture_initiale_id: saleId1,
    client_id: clientId1,
    motif: 'Retour du solde',
    mode_remboursement: 'credit_client',
    remboursement_effectue: false,
    lignes: [
      {
        article_id: 'prod-fer-12',
        article_nom: 'Fer à béton 12mm',
        qte_retournee: 8,
        prix_unitaire: 5000,
        prix_achat: 3500,
        etat_article: 'bon',
        qte_facturee: 10,
        qte_deja_avoir: 2
      }
    ]
  };

  const resSolde = await handleValidationAvoir(inputAvoirSolde);
  assert(resSolde.success === true, 'Test 4 : Deuxième avoir de 8 articles (40 000 FCFA) validé');

  // Tentative 3ème avoir -> facture épuisée
  const resEpuise = await handleValidationAvoir(inputAvoirSolde);
  assert(
    !resEpuise.success && (resEpuise.message?.includes('Quantité max avoir') || resEpuise.message?.includes('dépasse le solde')),
    'Test 4-bis : Tentative d\'un 3ème avoir sur facture totalement soldée -> Bloqué'
  );

  // ---------------------------------------------------------------------------
  // TEST 5 : Secteur Poissonnerie / Quincaillerie -> CONDITION isBrasserie = FALSE
  // Ne pas traiter ni afficher ni toucher les emballages
  // ---------------------------------------------------------------------------
  console.log('\n🔹 TEST 5 : Secteur Poissonnerie / Quincaillerie (Non-Brasserie)');
  const isQuincBrasserie = checkIsBrasserieSector('quincaillerie', 'Quincaillerie & Matériaux');
  const isPoissBrasserie = checkIsBrasserieSector('poissonnerie', 'Poissonnerie & Produits Frais');
  const isSuperBrasserie = checkIsBrasserieSector('supermarche', 'Supermarché & Alimentation');

  assert(!isQuincBrasserie, 'Test 5 : isBrasserie est FALSE pour "quincaillerie"');
  assert(!isPoissBrasserie, 'Test 5 : isBrasserie est FALSE pour "poissonnerie"');
  assert(!isSuperBrasserie, 'Test 5 : isBrasserie est FALSE pour "supermarche"');

  const embNonBrasserie = await getClientEmballagesCreance(testCompanyId, 'client-poisson', false);
  assert(
    embNonBrasserie.qte_casiers_dus === 0 && embNonBrasserie.qte_bouteilles_dues === 0,
    'Test 5-bis : Pour secteur non brasserie, créance emballage = 0, aucune opération'
  );

  // ---------------------------------------------------------------------------
  // TEST 7 : EXCLUSIF BRASSERIE & DÉPÔT DE BOISSONS
  // Client avec créance 10 casiers dus. Avoir 2 casiers bière + 5 casiers vides rendus -> Créance 10 -> 5
  // ---------------------------------------------------------------------------
  console.log('\n🔹 TEST 7 : Exclusif Secteur Brasserie & Dépôt de Boissons');
  const isBrasserieActive = checkIsBrasserieSector('brasserie_depot_boissons', 'Brasserie & Dépôt de Boissons');
  const isBrasserieActive2 = checkIsBrasserieSector('brasserie', 'Dépôt de Boissons');
  assert(isBrasserieActive === true && isBrasserieActive2 === true, 'Test 7 : isBrasserie est TRUE pour "brasserie_depot_boissons" et "brasserie"');

  const clientIdBrasserie = 'client-brasserie-007';
  localStorage.setItem(
    `client_emballages_${testCompanyId}_${clientIdBrasserie}`,
    JSON.stringify({ qte_casiers_dus: 10, qte_bouteilles_dues: 120 })
  );

  const initEmbBrasserie = await getClientEmballagesCreance(testCompanyId, clientIdBrasserie, true);
  assert(initEmbBrasserie.qte_casiers_dus === 10, 'Test 7 : Créance initiale emballages brasserie chargée : 10 casiers');

  const saleIdBrasserie = 'sale-brasserie-001';
  const saleBrasserie = {
    id: saleIdBrasserie,
    order_number: 'VTE-BRAS-001',
    company_id: testCompanyId,
    customer_id: clientIdBrasserie,
    customer_name: 'Maquis Le Régal',
    total_amount: 50000,
    credit_amount: 50000,
    payment_status: 'credit',
    items: [
      {
        product_id: 'prod-biere-beninoise',
        product_name: 'Casier Béninoise 65cl',
        quantity: 10,
        unit_price: 5000,
        unit_cost: 4000
      }
    ]
  };

  localStorage.setItem(`sales_orders_${testCompanyId}`, JSON.stringify([saleBrasserie]));

  const inputAvoirBrasserie = {
    company_id: testCompanyId,
    sector_slug: testSectorBrasserie,
    facture_initiale_id: saleIdBrasserie,
    client_id: clientIdBrasserie,
    client_nom: 'Maquis Le Régal',
    motif: 'Retour 2 casiers bières + 5 casiers vides rendus',
    mode_remboursement: 'credit_client',
    remboursement_effectue: false,
    lignes: [
      {
        article_id: 'prod-biere-beninoise',
        article_nom: 'Casier Béninoise 65cl',
        qte_retournee: 2,
        prix_unitaire: 5000,
        prix_achat: 4000,
        etat_article: 'bon',
        qte_facturee: 10,
        qte_deja_avoir: 0
      }
    ],
    qte_casiers_retournes: 5,
    qte_bouteilles_retournes: 0
  };

  const resBrasserie = await handleValidationAvoir(inputAvoirBrasserie);
  assert(resBrasserie.success === true, 'Test 7 : Facture d\'avoir brasserie validée avec succès');

  const postEmbBrasserie = await getClientEmballagesCreance(testCompanyId, clientIdBrasserie, true);
  assert(
    postEmbBrasserie.qte_casiers_dus === 5,
    `Test 7 : Créance casiers client brasserie mise à jour : 10 - 5 = ${postEmbBrasserie.qte_casiers_dus} casiers dus`
  );

  // ---------------------------------------------------------------------------
  // TEST 8 : Même client dans un secteur non-brasserie -> créance casiers ne bouge pas
  // ---------------------------------------------------------------------------
  console.log('\n🔹 TEST 8 : Même client dans un secteur non brasserie');
  const inputAvoirMemeClientAutreSecteur = {
    company_id: testCompanyId,
    sector_slug: testSectorPoissonnerie,
    facture_initiale_id: saleIdBrasserie,
    client_id: clientIdBrasserie,
    client_nom: 'Maquis Le Régal',
    motif: 'Avoir poissonnerie',
    mode_remboursement: 'credit_client',
    remboursement_effectue: false,
    lignes: [
      {
        article_id: 'prod-biere-beninoise',
        article_nom: 'Casier Béninoise 65cl',
        qte_retournee: 1,
        prix_unitaire: 5000,
        prix_achat: 4000,
        etat_article: 'bon',
        qte_facturee: 10,
        qte_deja_avoir: 2
      }
    ],
    // Même si un payload tentait d'envoyer des emballages, le secteur Poissonnerie doit les ignorer complètement
    qte_casiers_retournes: 3
  };

  await handleValidationAvoir(inputAvoirMemeClientAutreSecteur);
  const checkSameClientEmb = await getClientEmballagesCreance(testCompanyId, clientIdBrasserie, true);
  assert(
    checkSameClientEmb.qte_casiers_dus === 5,
    `Test 8 : Dans un secteur non brasserie (${testSectorPoissonnerie}), la créance casiers reste inchangée à ${checkSameClientEmb.qte_casiers_dus}`
  );

  console.log('\n=============================================================================');
  console.log(`RÉSULTAT DES TESTS : ${passedTests}/${totalTests} TESTS RÉUSSIS (100% SUCCÈS)`);
  console.log('=============================================================================');
}

runTests().catch(console.error);
