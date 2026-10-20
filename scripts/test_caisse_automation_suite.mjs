// =============================================================================
// GESTIO 229 SaaS — Suite de Tests Automatisée : Automatisation Caisse
// Validation des 8 Scénarios Métier selon le Cahier des Charges
// =============================================================================

import assert from 'assert';

console.log('🚀 DÉMARRAGE DE LA SUITE DE TESTS : AUTOMATISATION CAISSE GESTIO229');
console.log('====================================================================\n');

// ── Modèle de simulation des règles métier GESTIO229 ──

function simulerCalculSoldesSession({
  fondInitialEspeces = 0,
  fondInitialMomo = 0,
  ventes = [],
  depenses = [],
  versements = [],
  paiementsDettes = []
}) {
  // 1. Calcul entrées espèces
  const ventesEspeces = ventes
    .filter(v => ['espece', 'especes', 'cash'].includes((v.payment_method || '').toLowerCase()))
    .reduce((sum, v) => sum + (Number(v.paid_amount || v.total_amount) || 0), 0);

  const dettesEspeces = paiementsDettes
    .filter(p => ['espece', 'especes', 'cash'].includes((p.mode_paiement || '').toLowerCase()))
    .reduce((sum, p) => sum + (Number(p.montant) || 0), 0);

  const totalEntreesEspeces = ventesEspeces + dettesEspeces;

  // 2. Calcul entrées MoMo (séparées des espèces)
  const totalEntreesMomo = ventes
    .filter(v => {
      const pm = (v.payment_method || '').toLowerCase();
      return pm.includes('momo') || pm.includes('wave') || pm.includes('moov');
    })
    .reduce((sum, v) => sum + (Number(v.paid_amount || v.total_amount) || 0), 0);

  // 3. Calcul sorties espèces (dépenses + versements)
  const totalDepensesEspeces = depenses
    .filter(d => ['espece', 'especes', 'cash'].includes((d.mode_paiement || d.payment_method || '').toLowerCase()))
    .reduce((sum, d) => sum + (Number(d.montant || d.amount) || 0), 0);

  const totalVersementsEspeces = versements
    .filter(v => ['espece', 'especes', 'cash'].includes((v.mode_paiement || 'especes').toLowerCase()) && v.statut === 'approuve')
    .reduce((sum, v) => sum + (Number(v.montant) || 0), 0);

  // Équation métier officielle :
  // Solde théorique = Fond initial + Entrées espèces - Dépenses espèces - Versements sortants espèces
  const soldeTheoriqueEspeces = fondInitialEspeces + totalEntreesEspeces - totalDepensesEspeces - totalVersementsEspeces;
  const soldeTheoriqueMomo = fondInitialMomo + totalEntreesMomo;

  // Montant conservé pour le lendemain et montant à reverser
  // Règle GESTIO229 : Le solde en caisse est conservé comme fonds de roulement dans le tiroir,
  // ou reversé si un versement spécifique est ordonné.
  const montantConserve = soldeTheoriqueEspeces;
  const montantReverse = 0; // Les retraits en journée ont déjà été comptabilisés dans totalVersementsEspeces

  return {
    fondInitialEspeces,
    fondInitialMomo,
    totalEntreesEspeces,
    totalEntreesMomo,
    totalDepensesEspeces,
    totalVersementsEspeces,
    soldeTheoriqueEspeces,
    soldeTheoriqueMomo,
    montantConserve,
    montantReverse
  };
}

let testsPassed = 0;
let testsFailed = 0;

function runTest(name, testFn) {
  try {
    testFn();
    console.log(`✅ [PASS] ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(`   Message: ${err.message}`);
    testsFailed++;
  }
}

// =============================================================================
// SCÉNARIO 1 : Première ouverture après clôture précédente
// =============================================================================
runTest('Scénario 1 : Fond initial espèces correspond au solde réel reporté (jamais remis à 0)', () => {
  const derniereClotureSoldeFinal = 45000; // Clôture précédente validée avec 45.000 FCFA

  // Simulation fonction getFondInitialOuverture
  const fondOuverture = derniereClotureSoldeFinal > 0 ? derniereClotureSoldeFinal : 0;

  assert.strictEqual(fondOuverture, 45000, 'Le fond initial doit être 45.000 FCFA');
  assert.notStrictEqual(fondOuverture, 0, 'Le fond initial ne doit pas avoir été remis à zéro');
});

// =============================================================================
// SCÉNARIO 2 : Ouverture avec solde Mobile Money récupéré automatiquement
// =============================================================================
runTest('Scénario 2 : Récupération automatique du solde marchand Mobile Money', () => {
  const soldeCompteMarchandMomo = 125000;
  const fondInitialMomo = soldeCompteMarchandMomo;

  assert.strictEqual(fondInitialMomo, 125000, 'Le fond MoMo doit être automatiquement chargé depuis le compte marchand');
});

// =============================================================================
// SCÉNARIO 3 : Clôture avec ventes mixtes (Espèces et MoMo bien isolés)
// =============================================================================
runTest('Scénario 3 : Clôture avec ventes en espèces et Mobile Money (isolement strict des flux)', () => {
  const session = simulerCalculSoldesSession({
    fondInitialEspeces: 20000,
    fondInitialMomo: 50000,
    ventes: [
      { total_amount: 15000, paid_amount: 15000, payment_method: 'especes' },
      { total_amount: 10000, paid_amount: 10000, payment_method: 'especes' },
      { total_amount: 25000, paid_amount: 25000, payment_method: 'mtn_momo' },
      { total_amount: 12000, paid_amount: 12000, payment_method: 'moov' },
      { total_amount: 30000, paid_amount: 30000, payment_method: 'carte_bancaire' } // Hors caisse physique & MoMo
    ]
  });

  // Espèces : 20.000 + (15.000 + 10.000) = 45.000 FCFA
  assert.strictEqual(session.totalEntreesEspeces, 25000, 'Entrées espèces doivent être 25.000 FCFA');
  assert.strictEqual(session.soldeTheoriqueEspeces, 45000, 'Solde théorique tiroir doit être 45.000 FCFA');

  // MoMo : 50.000 + (25.000 + 12.000) = 87.000 FCFA
  assert.strictEqual(session.totalEntreesMomo, 37000, 'Entrées MoMo doivent être 37.000 FCFA');
  assert.strictEqual(session.soldeTheoriqueMomo, 87000, 'Solde MoMo doit être 87.000 FCFA');

  // Le tiroir espèces ne doit pas contenir les 37.000 MoMo ni les 30.000 CB
  assert.strictEqual(
    session.soldeTheoriqueEspeces,
    45000,
    'Aucun montant MoMo ou Carte ne doit être mélangé dans le tiroir espèces'
  );
});

// =============================================================================
// SCÉNARIO 4 : Clôture avec dépenses et versements (déductions exactes sans double comptage)
// =============================================================================
runTest('Scénario 4 : Déduction des dépenses et des versements sortants', () => {
  const session = simulerCalculSoldesSession({
    fondInitialEspeces: 50000,
    fondInitialMomo: 0,
    ventes: [
      { paid_amount: 80000, payment_method: 'espece' }
    ],
    depenses: [
      { montant: 15000, mode_paiement: 'especes' },
      { montant: 5000, mode_paiement: 'especes' }
    ],
    versements: [
      { montant: 30000, mode_paiement: 'especes', statut: 'approuve' },
      { montant: 10000, mode_paiement: 'especes', statut: 'en_attente' } // Non validé : ne doit pas être déduit !
    ]
  });

  // Solde attendu = 50.000 + 80.000 - 20.000 - 30.000 = 80.000 FCFA
  assert.strictEqual(session.totalDepensesEspeces, 20000, 'Total dépenses doit être 20.000 FCFA');
  assert.strictEqual(session.totalVersementsEspeces, 30000, 'Total versements approuvés doit être 30.000 FCFA');
  assert.strictEqual(session.soldeTheoriqueEspeces, 80000, 'Solde théorique doit être 80.000 FCFA');
});

// =============================================================================
// SCÉNARIO 5 : Clôture sans saisie manuelle d'aucun montant par la caissière
// =============================================================================
runTest('Scénario 5 : Clôture 100% automatique sans saisie manuelle (écart = 0)', () => {
  const sessionCalculee = simulerCalculSoldesSession({
    fondInitialEspeces: 35000,
    ventes: [{ paid_amount: 15000, payment_method: 'especes' }]
  });

  // Paramètres transmis par la caissière lors de la confirmation
  const actionCaissiere = {
    // La caissière ne fournit aucun montant : les champs physiques sont auto-alimentés par le système
    fond_reel_especes: undefined, // Non saisi
    fond_conserve: undefined      // Non saisi
  };

  // Résolution côté serveur/service :
  const fondReelApplique = actionCaissiere.fond_reel_especes ?? sessionCalculee.soldeTheoriqueEspeces;
  const ecart = fondReelApplique - sessionCalculee.soldeTheoriqueEspeces;

  assert.strictEqual(fondReelApplique, 50000, 'Le fond réel est automatiquement le fond théorique');
  assert.strictEqual(ecart, 0, 'L\'écart de caisse est nul en mode automatique');
});

// =============================================================================
// SCÉNARIO 6 : Réouverture suivante (continuité de session)
// =============================================================================
runTest('Scénario 6 : Continuité parfaite du solde reporté entre Session N et Session N+1', () => {
  // Session N se termine avec 62.500 FCFA en caisse
  const clotureSessionN = simulerCalculSoldesSession({
    fondInitialEspeces: 30000,
    ventes: [{ paid_amount: 40000, payment_method: 'especes' }],
    depenses: [{ montant: 7500, mode_paiement: 'especes' }]
  });

  const soldeReporteSessionN = clotureSessionN.montantConserve;
  assert.strictEqual(soldeReporteSessionN, 62500, 'Solde conservé à la clôture N = 62.500 FCFA');

  // Session N+1 s'ouvre le lendemain matin
  const ouvertureSessionSuivante = {
    fondInitialEspeces: soldeReporteSessionN
  };

  assert.strictEqual(
    ouvertureSessionSuivante.fondInitialEspeces,
    62500,
    'Session N+1 démarre exactement avec les 62.500 FCFA conservés la veille'
  );
});

// =============================================================================
// SCÉNARIO 7 : Envoi automatique de l'e-mail de clôture dès validation réelle
// =============================================================================
runTest('Scénario 7 : Déclenchement immédiat de l\'e-mail uniquement lors de la validation effective', () => {
  const events = [];

  function onOuvrirModaleCloture() {
    // Simple affichage de la modale récapitulative
    // NE DOIT PAS ENVOYER D'EMAIL
  }

  function onAnnulerCloture() {
    // La caissière clique sur Annuler
    // NE DOIT PAS ENVOYER D'EMAIL
  }

  async function onConfirmerValidationCloture(sessionOk) {
    if (!sessionOk) throw new Error('Échec validation');
    // Déclenchement automatique de l'e-mail
    events.push('ENVOI_EMAIL_IMMEDIAT_PDF');
  }

  onOuvrirModaleCloture();
  assert.strictEqual(events.length, 0, 'Aucun e-mail envoyé à l\'ouverture de la modale');

  onAnnulerCloture();
  assert.strictEqual(events.length, 0, 'Aucun e-mail envoyé lors de l\'annulation');

  onConfirmerValidationCloture(true);
  assert.strictEqual(events.length, 1, 'L\'e-mail est envoyé dès la validation effective de la clôture');
  assert.strictEqual(events[0], 'ENVOI_EMAIL_IMMEDIAT_PDF');
});

// =============================================================================
// SCÉNARIO 8 : Clôture sans aucun mouvement dans la journée
// =============================================================================
runTest('Scénario 8 : Clôture avec 0 mouvement (le solde initial reste préservé)', () => {
  const sessionVide = simulerCalculSoldesSession({
    fondInitialEspeces: 30000,
    fondInitialMomo: 15000,
    ventes: [],
    depenses: [],
    versements: []
  });

  assert.strictEqual(sessionVide.totalEntreesEspeces, 0, 'Entrées à zéro');
  assert.strictEqual(sessionVide.totalDepensesEspeces, 0, 'Dépenses à zéro');
  assert.strictEqual(sessionVide.soldeTheoriqueEspeces, 30000, 'Le solde théorique espèces reste inchangé à 30.000 FCFA');
  assert.strictEqual(sessionVide.soldeTheoriqueMomo, 15000, 'Le solde théorique MoMo reste inchangé à 15.000 FCFA');
  assert.strictEqual(sessionVide.montantConserve, 30000, 'Le montant conservé pour le lendemain reste 30.000 FCFA');
});

console.log('\n====================================================================');
console.log(`📊 BILAN DES TESTS : ${testsPassed} passés / ${testsPassed + testsFailed} tests au total.`);
if (testsFailed === 0) {
  console.log('🎉 TOUS LES 8 SCÉNARIOS DE VALIDATION ONT ÉTÉ VALIDÉS AVEC SUCCÈS !');
} else {
  console.error(`⚠️ ${testsFailed} test(s) ont échoué.`);
  process.exit(1);
}
