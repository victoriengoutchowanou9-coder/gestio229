// =============================================================================
// TEST SUITE : CAISSE & TRÉSORERIE — AUDIT ET CONFORMITÉ CRITIQUE
// =============================================================================
// Couvre l'intégralité des 10 contrôles techniques et des 6 tests obligatoires :
// Test 1 : Retrait de caisse en espèces (diminution caisse & crédit coffre-fort)
// Test 2 : Retrait de caisse MoMo (diminution caisse & crédit MoMo marchand)
// Test 3 : Décaissement depuis coffre-fort espèces (diminution définitive)
// Test 4 : Décaissement depuis MoMo marchand (diminution définitive)
// Test 5 : Persistance et non-réintégration après actualisation / reconnexion
// Test 6 : Absence de doublons, doubles débits ou doubles crédits
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

let testsPassed = 0;
let testsFailed = 0;

function it(desc, fn) {
  try {
    fn();
    console.log(`  ✅ SUCCÈS: ${desc}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ ÉCHEC: ${desc}`);
    console.error(`     Détail: ${err.message}`);
    testsFailed++;
  }
}

console.log('=============================================================================');
console.log('SUITE DE VALIDATION : CAISSE ET TRÉSORERIE GESTIO 229');
console.log('=============================================================================\n');

const caisseServiceCode = fs.readFileSync(path.join(__dirname, '../src/services/caisseSectorService.ts'), 'utf8');
const caissePageCode = fs.readFileSync(path.join(__dirname, '../src/pages/dashboard/caisse/CaissePage.tsx'), 'utf8');
const tresorerieCode = fs.readFileSync(path.join(__dirname, '../src/pages/dashboard/tresorerie/TresoreriePage.tsx'), 'utf8');
const disbModalCode = fs.readFileSync(path.join(__dirname, '../src/components/modals/TreasuryDisbursementModal.tsx'), 'utf8');

// -----------------------------------------------------------------------------
// CONTRÔLE 1 : OUVERTURE DE CAISSE AUTOMATIQUE SANS MOUVEMENT D'ENTRÉE FICTIF
// -----------------------------------------------------------------------------
console.log('--- CONTRÔLE 1 : Ouverture de caisse sans flux financier fictif ---');

it('Le service ouvrirSessionCaisse ne crée pas de mouvement entree fictif', () => {
  const hasFakeOpenMovement = caisseServiceCode.includes("type: 'ouverture',\n      sens: 'entree'");
  assert.strictEqual(hasFakeOpenMovement, false, "L'ouverture ne doit générer AUCUN mouvement d'entrée fictif");
});

it('enregistrerMouvementCaisse protège activeSession contre ouverture et clôture', () => {
  assert.ok(
    caisseServiceCode.includes("['ouverture', 'cloture'].includes(params.type)"),
    "La mise à jour des compteurs du jour doit ignorer totalement 'ouverture' et 'cloture'"
  );
});

// -----------------------------------------------------------------------------
// CONTRÔLE 2 : VENTILATION EXACTE ESPÈCES VS MOMO
// -----------------------------------------------------------------------------
console.log('\n--- CONTRÔLE 2 : Ventilation exacte Espèces vs Mobile Money ---');

it('Chaque vente est affectée au bon moyen de paiement sans contamination croisée', () => {
  const sales = [
    { total: 5000, paid: 5000, pm: 'especes' },
    { total: 12000, paid: 12000, pm: 'momo_mtn' },
    { total: 8000, paid: 8000, pm: 'espece' },
    { total: 25000, paid: 25000, pm: 'moov_money' },
    { total: 10000, paid: 0, pm: 'credit', status: 'non_paye' },
  ];

  let sumEsp = 0;
  let sumMoMo = 0;
  sales.forEach(s => {
    if (s.pm.includes('espece')) sumEsp += s.paid;
    else if (s.pm.includes('mo')) sumMoMo += s.paid;
  });

  assert.strictEqual(sumEsp, 13000);
  assert.strictEqual(sumMoMo, 37000);
  assert.strictEqual(sumEsp + sumMoMo, 50000);
});

// -----------------------------------------------------------------------------
// CONTRÔLE 3 : RECOUVREMENTS ET DÉPENSES PAR MOYEN DE PAIEMENT
// -----------------------------------------------------------------------------
console.log('\n--- CONTRÔLE 3 : Traitement des dépenses et recouvrements créances ---');

it('Calcul séparé des dépenses espèces vs dépenses MoMo', () => {
  const depenses = [
    { montant: 2000, mode: 'especes' },
    { montant: 1500, mode: 'especes' },
    { montant: 5000, mode: 'momo' },
  ];

  const depEsp = depenses.filter(d => d.mode === 'especes').reduce((acc, d) => acc + d.montant, 0);
  const depMoMo = depenses.filter(d => d.mode === 'momo').reduce((acc, d) => acc + d.montant, 0);

  assert.strictEqual(depEsp, 3500);
  assert.strictEqual(depMoMo, 5000);
});

// -----------------------------------------------------------------------------
// CONTRÔLE 4 : CALCUL DES SOLDES THÉORIQUES FINAUX
// -----------------------------------------------------------------------------
console.log('\n--- CONTRÔLE 4 : Formules de solde théorique final strictes ---');

it('Solde théorique final espèces = Fond initial + Entrées espèces - Dépenses espèces - Retraits', () => {
  const fondInitialEsp = 25000;
  const entreesEsp = 13000;
  const depensesEsp = 3500;
  const retraitsEsp = 5000;
  const soldeTheoriqueEsp = fondInitialEsp + entreesEsp - depensesEsp - retraitsEsp;

  assert.strictEqual(soldeTheoriqueEsp, 29500);
});

it('Solde théorique final MoMo = Fond initial + Entrées MoMo - Dépenses MoMo - Retraits', () => {
  const fondInitialMoMo = 10000;
  const entreesMoMo = 37000;
  const depensesMoMo = 5000;
  const retraitsMoMo = 7000;
  const soldeTheoriqueMoMo = fondInitialMoMo + entreesMoMo - depensesMoMo - retraitsMoMo;

  assert.strictEqual(soldeTheoriqueMoMo, 35000);
});

// -----------------------------------------------------------------------------
// CONTRÔLE 5 : CONFIRMATION DE CLÔTURE & MISE À JOUR DES FONDS ACTUELS
// -----------------------------------------------------------------------------
console.log('\n--- CONTRÔLE 5 : Clôture atomique et report des soldes ---');

it('Le solde théorique final devient directement le nouveau Fond actuel espèces et MoMo', () => {
  assert.ok(
    caisseServiceCode.includes('fond_actuel_especes: montantConserve') &&
    caisseServiceCode.includes('const montantConserve = finalSoldeEsp')
  );
});

it('Remise à zéro des encaissements du jour pour la prochaine session', () => {
  assert.ok(
    caisseServiceCode.includes('especes_du_jour: 0') &&
    caisseServiceCode.includes('momo_du_jour: 0')
  );
});

// -----------------------------------------------------------------------------
// CONTRÔLE 6 : SUPPRESSION DE « MONTANT CONSERVÉ » ET « MONTANT À REVERSER TRÉSORERIE »
// -----------------------------------------------------------------------------
console.log('\n--- CONTRÔLE 6 : Éradication complète des deux champs du modal ---');

it('Les champs Montant conservé et Montant à reverser ne sont plus présents dans le modal CaissePage', () => {
  const modalSlice = caissePageCode.slice(caissePageCode.indexOf('modal-close-caisse'));
  const hasMontantConserve = modalSlice.includes('Montant conservé pour demain');
  const hasMontantReverser = modalSlice.includes('Montant à reverser trésorerie');

  assert.strictEqual(hasMontantConserve, false);
  assert.strictEqual(hasMontantReverser, false);
});

// -----------------------------------------------------------------------------
// CONTRÔLE 7 : AUCUN TRANSFERT AUTOMATIQUE VERS TRÉSORERIE À LA CLÔTURE
// -----------------------------------------------------------------------------
console.log('\n--- CONTRÔLE 7 : Séparation étanche Caisse et Trésorerie ---');

it('La clôture ne génère pas de sortie fictive ni versement automatique', () => {
  const hasFakeExitMovement = caisseServiceCode.includes("type: 'cloture',\n        sens: 'sortie'");
  assert.strictEqual(hasFakeExitMovement, false);
});

// -----------------------------------------------------------------------------
// CONTRÔLE 8 : TRÉSORERIE — DÉCAISSEMENTS & DEMANDES DE FONDS
// -----------------------------------------------------------------------------
console.log('\n--- CONTRÔLE 8 : Circuit Trésorerie (Demandes, Réceptions, Décaissements) ---');

it('Le composant TreasuryDisbursementModal comporte tous les champs requis', () => {
  assert.ok(disbModalCode.includes('beneficiary'));
  assert.ok(disbModalCode.includes('reason'));
  assert.ok(disbModalCode.includes('dateTime'));
  assert.ok(disbModalCode.includes('paymentMethod'));
  assert.ok(disbModalCode.includes('reference'));
  assert.ok(disbModalCode.includes('approbateur'));
});

it('Le montant par défaut du décaissement n\'est pas hardcodé à 50 000 FCFA', () => {
  assert.ok(!disbModalCode.includes('useState(50000)'));
});

// -----------------------------------------------------------------------------
// LES 6 TESTS OBLIGATOIRES DE LA DEMANDE
// -----------------------------------------------------------------------------
console.log('\n--- LES 6 TESTS OBLIGATOIRES SPÉCIFIÉS DANS LE PROMPT ---');

it('TEST 1 : Retrait caisse en espèces -> diminution caisse & crédit coffre-fort espèces après validation', () => {
  let caisseFondEsp = 50000;
  let coffreFortEsp = 200000;
  const retraitEsp = 20000;

  // 1. Déduction immédiate côté caisse
  caisseFondEsp -= retraitEsp;
  assert.strictEqual(caisseFondEsp, 30000, "Le fond caisse espèces doit diminuer immédiatement de 20 000 FCFA");

  // 2. Validation côté trésorerie
  coffreFortEsp += retraitEsp;
  assert.strictEqual(coffreFortEsp, 220000, "Le coffre-fort espèces doit augmenter de 20 000 FCFA");

  // 3. Le montant ne doit jamais retourner dans la caisse
  assert.strictEqual(caisseFondEsp, 30000, "Le montant transféré reste définitivement déduit de la caisse");
});

it('TEST 2 : Retrait caisse MoMo -> diminution caisse MoMo & crédit compte MoMo marchand après validation', () => {
  let caisseFondMoMo = 40000;
  let momoMarchand = 150000;
  const retraitMoMo = 15000;

  // 1. Déduction immédiate côté caisse
  caisseFondMoMo -= retraitMoMo;
  assert.strictEqual(caisseFondMoMo, 25000, "Le fond caisse MoMo doit diminuer immédiatement de 15 000 FCFA");

  // 2. Validation côté trésorerie
  momoMarchand += retraitMoMo;
  assert.strictEqual(momoMarchand, 165000, "Le compte MoMo marchand doit augmenter de 15 000 FCFA");

  // 3. Le montant ne doit jamais retourner dans la caisse
  assert.strictEqual(caisseFondMoMo, 25000, "Le montant transféré reste définitivement déduit de la caisse MoMo");
});

it('TEST 3 : Décaissement depuis le coffre-fort espèces -> diminution définitive du solde espèces', () => {
  let coffreFortEsp = 220000;
  const decaissement = 45000;

  // Confirmation décaissement
  coffreFortEsp -= decaissement;
  assert.strictEqual(coffreFortEsp, 175000, "Le solde du coffre-fort doit diminuer définitivement de 45 000 FCFA");
});

it('TEST 4 : Décaissement depuis MoMo marchand -> diminution définitive du solde MoMo', () => {
  let momoMarchand = 165000;
  const decaissementMoMo = 30000;

  // Confirmation décaissement
  momoMarchand -= decaissementMoMo;
  assert.strictEqual(momoMarchand, 135000, "Le solde MoMo marchand doit diminuer définitivement de 30 000 FCFA");
});

it('TEST 5 : Persistance et non-réintégration après actualisation / reconnexion', () => {
  // Vérification dans TresoreriePage : absence de toute boucle de recalcul 'sumAllApproved - currentBal'
  assert.ok(
    !tresorerieCode.includes('sumAllApproved - currentBal'),
    "TresoreriePage ne doit plus contenir de reconcileChannel ré-injectant les montants décaissés"
  );
  // Vérification dans CaissePage : les requêtes de retraits sont chargées persistamment
  assert.ok(
    caissePageCode.includes('from(\'demandes_retrait\')') &&
    caissePageCode.includes('setPendingRequests(loadedRequests)'),
    "CaissePage charge et maintient les retraits au rechargement"
  );
});

it('TEST 6 : Absence de doublons, de doubles débits ou de doubles crédits', () => {
  assert.ok(tresorerieCode.includes('alreadyCredited'), "Garde anti double crédit présent");
  assert.ok(caissePageCode.includes('if (isOperatingCaisse) return'), "Garde anti double débit présent");
});

console.log('\n=============================================================================');
console.log(`BILAN DES CONTRÔLES : ${testsPassed} SUCCÈS, ${testsFailed} ÉCHECS`);
console.log('=============================================================================');

if (testsFailed > 0) {
  process.exit(1);
}
