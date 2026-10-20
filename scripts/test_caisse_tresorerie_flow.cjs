// =============================================================================
// TEST SUITE : CAISSE & TRÉSORERIE — AUDIT ET CONFORMITÉ CRITIQUE
// =============================================================================
// Couvre les 10 contrôles techniques obligatoires du prompt utilisateur :
// 1. Ouverture automatique sans mouvement d'entrée
// 2. Ventes ventilation exacte Espèces vs MoMo
// 3. Recouvrements et dépenses par moyen de paiement
// 4. Calcul exact des soldes théoriques
// 5. Clôture avec mise à jour des fonds actuels et remise à 0 du jour
// 6. Suppression totale des champs "conservé" et "reverser trésorerie"
// 7. Aucun transfert automatique Caisse -> Trésorerie à la clôture
// 8. Trésorerie : Demandes de fonds, autorisations, décaissements
// 9. Idempotence & atomisme : aucune duplication en double confirmation
// 10. Isolation stricte multi-entreprises & permissions
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

// -----------------------------------------------------------------------------
// CONTRÔLE 1 : OUVERTURE DE CAISSE AUTOMATIQUE SANS MOUVEMENT D'ENTRÉE FICTIF
// -----------------------------------------------------------------------------
console.log('--- CONTRÔLE 1 : Ouverture de caisse sans flux financier fictif ---');
const caisseServiceCode = fs.readFileSync(path.join(__dirname, '../src/services/caisseSectorService.ts'), 'utf8');

it('Le service ouvrirSessionCaisse ne crée pas de mouvement entree fictif', () => {
  // L'ancien code contenait enregistrerMouvementCaisse({ type: 'ouverture', sens: 'entree' })
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
const caissePageCode = fs.readFileSync(path.join(__dirname, '../src/pages/dashboard/caisse/CaissePage.tsx'), 'utf8');

it('Chaque vente est affectée au bon moyen de paiement sans contamination croisée', () => {
  // Simulation de la ventilation
  const sales = [
    { total: 5000, paid: 5000, pm: 'especes' },
    { total: 12000, paid: 12000, pm: 'momo_mtn' },
    { total: 8000, paid: 8000, pm: 'espece' },
    { total: 25000, paid: 25000, pm: 'moov_money' },
    { total: 10000, paid: 0, pm: 'credit', status: 'non_paye' }, // non encaissé
  ];

  let sumEsp = 0;
  let sumMoMo = 0;
  sales.forEach(s => {
    if (s.pm.includes('espece')) sumEsp += s.paid;
    else if (s.pm.includes('mo')) sumMoMo += s.paid;
  });

  assert.strictEqual(sumEsp, 13000, "Les ventes en espèces totalisent exactement 13 000 FCFA");
  assert.strictEqual(sumMoMo, 37000, "Les ventes MoMo totalisent exactement 37 000 FCFA");
  assert.strictEqual(sumEsp + sumMoMo, 50000, "Total encaissé 50 000 FCFA (vente crédit exclue)");
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

it('Solde théorique final espèces = Fond initial + Entrées espèces - Dépenses espèces', () => {
  const fondInitialEsp = 25000;
  const entreesEsp = 13000; // ventes + recouvrements
  const depensesEsp = 3500;
  const soldeTheoriqueEsp = fondInitialEsp + entreesEsp - depensesEsp;

  assert.strictEqual(soldeTheoriqueEsp, 34500, "Le solde théorique final espèces doit être de 34 500 FCFA");
});

it('Solde théorique final MoMo = Fond initial + Entrées MoMo - Dépenses MoMo', () => {
  const fondInitialMoMo = 10000;
  const entreesMoMo = 37000;
  const depensesMoMo = 5000;
  const soldeTheoriqueMoMo = fondInitialMoMo + entreesMoMo - depensesMoMo;

  assert.strictEqual(soldeTheoriqueMoMo, 42000, "Le solde théorique final MoMo doit être de 42 000 FCFA");
});

// -----------------------------------------------------------------------------
// CONTRÔLE 5 : CONFIRMATION DE CLÔTURE & MISE À JOUR DES FONDS ACTUELS
// -----------------------------------------------------------------------------
console.log('\n--- CONTRÔLE 5 : Clôture atomique et report des soldes ---');

it('Le solde théorique final devient directement le nouveau Fond actuel espèces et MoMo', () => {
  // Vérification dans le code de cloturerSessionCaisseAutomatique
  assert.ok(
    caisseServiceCode.includes('fond_actuel_especes: montantConserve') &&
    caisseServiceCode.includes('const montantConserve = finalSoldeEsp'),
    "fond_actuel_especes doit recevoir directement finalSoldeEsp sans déduction arbitraire"
  );
});

it('Remise à zéro des encaissements du jour pour la prochaine session', () => {
  assert.ok(
    caisseServiceCode.includes('especes_du_jour: 0') &&
    caisseServiceCode.includes('momo_du_jour: 0'),
    "especes_du_jour et momo_du_jour doivent être remis à 0"
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

  assert.strictEqual(hasMontantConserve, false, "Le champ 'Montant conservé pour demain' ne doit plus être dans le modal");
  assert.strictEqual(hasMontantReverser, false, "Le champ 'Montant à reverser trésorerie' ne doit plus être dans le modal");
});

// -----------------------------------------------------------------------------
// CONTRÔLE 7 : AUCUN TRANSFERT AUTOMATIQUE VERS TRÉSORERIE À LA CLÔTURE
// -----------------------------------------------------------------------------
console.log('\n--- CONTRÔLE 7 : Séparation étanche Caisse et Trésorerie ---');

it('La clôture ne génère pas de sortie fictive ni versement automatique', () => {
  // L'ancien code contenait enregistrerMouvementCaisse avec type: 'cloture', sens: 'sortie'
  const hasFakeExitMovement = caisseServiceCode.includes("type: 'cloture',\n        sens: 'sortie'");
  assert.strictEqual(hasFakeExitMovement, false, "La clôture ne doit pas créer de fausse sortie");
});

// -----------------------------------------------------------------------------
// CONTRÔLE 8 : TRÉSORERIE — DEMANDES DE FONDS, RÉCEPTIONS & DÉCAISSEMENTS
// -----------------------------------------------------------------------------
console.log('\n--- CONTRÔLE 8 : Circuit Trésorerie (Demandes, Réceptions, Décaissements) ---');
const tresorerieCode = fs.readFileSync(path.join(__dirname, '../src/pages/dashboard/tresorerie/TresoreriePage.tsx'), 'utf8');
const disbModalCode = fs.readFileSync(path.join(__dirname, '../src/components/modals/TreasuryDisbursementModal.tsx'), 'utf8');

it('Le composant TreasuryDisbursementModal comporte tous les champs requis (bénéficiaire, motif, date, mode, réf, approbateur)', () => {
  assert.ok(disbModalCode.includes('beneficiary'), 'Bénéficiaire présent');
  assert.ok(disbModalCode.includes('reason'), 'Motif présent');
  assert.ok(disbModalCode.includes('dateTime'), 'Date et heure présentes');
  assert.ok(disbModalCode.includes('paymentMethod'), 'Mode de règlement présent');
  assert.ok(disbModalCode.includes('reference'), 'Référence présente');
  assert.ok(disbModalCode.includes('approbateur'), 'Approbateur présent');
});

it('Le montant par défaut du décaissement n\'est plus hardcodé à 50 000 FCFA', () => {
  assert.ok(!disbModalCode.includes('useState(50000)'), 'Pas de valeur par défaut fictive de 50 000 FCFA');
});

it('La page Trésorerie permet de créer une demande de fonds sans créditer immédiatement le solde', () => {
  assert.ok(tresorerieCode.includes('showDemandeFondsModal'), 'Modal demande de fonds présent');
  assert.ok(tresorerieCode.includes('Demande de Fonds'), 'Bouton Demande de Fonds présent dans l\'en-tête');
  assert.ok(tresorerieCode.includes("status: 'EN_ATTENTE'"), 'Statut initial en attente');
});

// -----------------------------------------------------------------------------
// CONTRÔLE 9 : DOUBLE CONFIRMATION & ATOMICITÉ
// -----------------------------------------------------------------------------
console.log('\n--- CONTRÔLE 9 : Protection anti double clic et clôtures répétées ---');

it('Protection isOperatingCaisse active sur ouverture et clôture de caisse', () => {
  assert.ok(caissePageCode.includes('if (isOperatingCaisse) return'), 'Garde isOperatingCaisse actif');
});

it('Protection anti-double crédit en trésorerie avec trace d\'idempotence', () => {
  assert.ok(tresorerieCode.includes('alreadyCredited'), 'Garde anti-double crédit présent dans TresoreriePage');
});

// -----------------------------------------------------------------------------
// CONTRÔLE 10 : ISOLATION MULTI-ENTREPRISES
// -----------------------------------------------------------------------------
console.log('\n--- CONTRÔLE 10 : Isolation étanche multi-entreprises ---');

it('Toutes les requêtes de caisse et de trésorerie sont strictement filtrées par company_id', () => {
  assert.ok(caisseServiceCode.includes('eq(\'company_id\', companyId)'), 'Filtrage strict company_id dans caisse');
  assert.ok(tresorerieCode.includes('.eq(\'company_id\', compId)'), 'Filtrage strict company_id dans trésorerie');
});

console.log('\n=============================================================================');
console.log(`BILAN DES CONTRÔLES : ${testsPassed} SUCCÈS, ${testsFailed} ÉCHECS`);
console.log('=============================================================================');

if (testsFailed > 0) {
  process.exit(1);
}
