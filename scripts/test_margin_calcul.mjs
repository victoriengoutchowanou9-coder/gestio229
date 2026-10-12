// =============================================================================
// GESTIO 229 ERP — Test Automatisé du Moteur de Marge & Bénéfice Réel
// =============================================================================
// Scénarios obligatoires du prompt utilisateur :
// 1. Validation de l'exemple obligatoire :
//    CA = 51 300 F CFA, COGS = 30 000 F CFA, Dépenses = 11 400 F CFA
//    Marge Brute = 21 300 F CFA, Marge Nette = 9 900 F CFA (et JAMAIS 39 900 F CFA).
// 2. Vente avec coût d'achat inconnu => Détection "Coût d'achat indisponible"
// 3. Vente partielle depuis stock UV avec conditionnement gros/détail
// 4. Achat de stock non vendu => N'affecte PAS la marge de la période (COGS des ventes)
// 5. Facture d'avoir (retour client) => Réduction du CA net et réintégration au stock
// 6. Exclusion stricte des transferts trésorerie (coffre, clôtures) des dépenses d'exploitation
// 7. Non-double comptage des règlements fournisseurs de stock
// =============================================================================

import {
  computeOrderMargin,
  computeOrderCOGS,
  computeConsolidatedFinancials,
  isTrueOperatingExpense,
} from '../src/lib/financialCalcul.ts';

let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName} - ${details}`);
    failedTests++;
  }
}

console.log('--- DÉBUT DE LA SUITE DE TESTS FINANCIERS GESTIO 229 ---\n');

// ── Test 1 : Validation Scénario Obligatoire (Capture Utilisateur) ───────────
{
  const testSales = [
    {
      id: 'sale-001',
      total_amount: 51300,
      subtotal_ht: 51300,
      total_cost: 30000,
      status: 'COMPLET',
    },
  ];
  const testExpenses = [
    {
      id: 'exp-001',
      montant: 11400,
      categorie: 'electricite',
      description: 'Facture SBEE boutique',
    },
  ];

  const result = computeConsolidatedFinancials({
    sales: testSales,
    expenses: testExpenses,
  });

  assert(
    result.grossMargin === 21300,
    'Test 1.1 : Marge brute = CA (51 300) - COGS (30 000) = 21 300 F CFA',
    `Reçu: ${result.grossMargin}`
  );

  assert(
    result.netMargin === 9900,
    'Test 1.2 : Marge nette = Marge brute (21 300) - Dépenses (11 400) = 9 900 F CFA (JAMAIS 39 900)',
    `Reçu: ${result.netMargin}`
  );

  assert(
    result.netMargin !== 39900,
    'Test 1.3 : Interdiction stricte de CA - Dépenses = 39 900',
    `Reçu: ${result.netMargin}`
  );

  assert(
    Math.abs(result.netMarginRate - 19.30) < 0.1,
    `Test 1.4 : Taux de marge nette = (9 900 / 51 300) * 100 = 19.30%`,
    `Reçu: ${result.netMarginRate}%`
  );
}

// ── Test 2 : Vente sans coût d'achat connu ──────────────────────────────────
{
  const saleWithoutCost = [
    {
      id: 'sale-002',
      total_amount: 20000,
      subtotal_ht: 20000,
      total_cost: 0,
      notes: { lines: [] },
      status: 'COMPLET',
    },
  ];

  const result = computeConsolidatedFinancials({
    sales: saleWithoutCost,
    expenses: [],
  });

  assert(
    result.isCostAvailable === false,
    'Test 2.1 : Vente sans coût identifié marque isCostAvailable = false',
    `Reçu: ${result.isCostAvailable}`
  );

  assert(
    result.costStatusLabel === "Coût d'achat indisponible",
    'Test 2.2 : Statut explicite "Coût d\'achat indisponible"',
    `Reçu: ${result.costStatusLabel}`
  );
}

// ── Test 3 : Calcul COGS avec conditionnement (ex: Gros/Détail coef 20) ──────
{
  const orderWithLines = {
    total_amount: 12000,
    subtotal_ht: 12000,
    notes: {
      lines: [
        {
          qty: 2,
          product: {
            name: 'Sac de ciment',
            cost_price: 90000, // Prix de la tonne (UCD)
            coef: 20,          // 1 tonne = 20 sacs (UV) => Prix sac = 4 500
            is_vat_subject: false,
          },
        },
      ],
    },
  };

  const cogsInfo = computeOrderCOGS(orderWithLines);
  assert(
    cogsInfo.cogsHT === 9000,
    'Test 3.1 : COGS pour 2 sacs (90 000 / 20 * 2) = 9 000 F CFA',
    `Reçu: ${cogsInfo.cogsHT}`
  );

  const marginInfo = computeOrderMargin(orderWithLines);
  assert(
    marginInfo.grossMargin === 3000,
    'Test 3.2 : Marge brute = 12 000 - 9 000 = 3 000 F CFA',
    `Reçu: ${marginInfo.grossMargin}`
  );
}

// ── Test 4 : Facture d'avoir (Retour client) ─────────────────────────────────
{
  const sales = [
    {
      id: 'sale-003',
      total_amount: 40000,
      subtotal_ht: 40000,
      total_cost: 25000,
      status: 'COMPLET',
    },
  ];

  const avoirs = [
    {
      id: 'av-001',
      montant_total: 10000,
      montant_ht: 10000,
      lignes: [
        {
          quantite: 1,
          prix_achat_unitaire: 6250,
        },
      ],
    },
  ];

  const result = computeConsolidatedFinancials({
    sales,
    expenses: [],
    avoirs,
  });

  assert(
    result.netRevenueHT === 30000,
    'Test 4.1 : CA net HT après avoir (40 000 - 10 000) = 30 000 F CFA',
    `Reçu: ${result.netRevenueHT}`
  );

  assert(
    result.cogsHT === 18750,
    'Test 4.2 : COGS net après réintégration avoir (25 000 - 6 250) = 18 750 F CFA',
    `Reçu: ${result.cogsHT}`
  );

  assert(
    result.grossMargin === 11250,
    'Test 4.3 : Marge brute nette = 30 000 - 18 750 = 11 250 F CFA',
    `Reçu: ${result.grossMargin}`
  );
}

// ── Test 5 : Filtrage strict des mouvements de trésorerie ────────────────────
{
  const expNormal = {
    montant: 5000,
    categorie: 'loyer',
    description: 'Loyer mensuel',
    type: 'depense',
    sens: 'sortie',
  };

  const expTransfertCoffre = {
    montant: 200000,
    categorie: 'transfert',
    description: 'Versement de caisse vers le coffre-fort',
    type: 'transfert_caisse_coffre',
    sens: 'sortie',
  };

  const expCloture = {
    montant: 85000,
    categorie: 'cloture',
    description: 'Clôture de session caisse soir',
    type: 'cloture',
    sens: 'sortie',
  };

  const expAchatStockFournisseur = {
    montant: 150000,
    categorie: 'achat_marchandise_stock',
    description: 'Règlement fournisseur boisson stock',
    type: 'paiement_fournisseur',
    sens: 'sortie',
  };

  assert(
    isTrueOperatingExpense(expNormal) === true,
    'Test 5.1 : Charge de loyer est une vraie dépense d\'exploitation'
  );

  assert(
    isTrueOperatingExpense(expTransfertCoffre) === false,
    'Test 5.2 : Transfert de caisse vers coffre est EXCLU des charges'
  );

  assert(
    isTrueOperatingExpense(expCloture) === false,
    'Test 5.3 : Clôture de caisse est EXCLUE des charges'
  );

  assert(
    isTrueOperatingExpense(expAchatStockFournisseur) === false,
    'Test 5.4 : Règlement stock fournisseur est EXCLU pour éviter le double comptage'
  );
}

// ── Test 6 : Commandes annulées exclues ─────────────────────────────────────
{
  const salesWithCancel = [
    {
      id: 'sale-valid',
      total_amount: 10000,
      subtotal_ht: 10000,
      total_cost: 6000,
      status: 'COMPLET',
    },
    {
      id: 'sale-canceled',
      total_amount: 50000,
      subtotal_ht: 50000,
      total_cost: 30000,
      status: 'annulée',
    },
  ];

  const result = computeConsolidatedFinancials({
    sales: salesWithCancel,
    expenses: [],
  });

  assert(
    result.revenueHT === 10000,
    'Test 6.1 : Ventes annulées exclues du CA',
    `Reçu: ${result.revenueHT}`
  );

  assert(
    result.grossMargin === 4000,
    'Test 6.2 : Marge brute ne compte que la vente valide (10 000 - 6 000)',
    `Reçu: ${result.grossMargin}`
  );
}

console.log('\n--- RÉSULTATS DES TESTS ---');
console.log(`Total Réussis : ${passedTests}`);
console.log(`Total Échoués : ${failedTests}`);

if (failedTests > 0) {
  process.exit(1);
} else {
  console.log('TOUS LES TESTS DE MARGE ET DE BÉNÉFICE SONT VALIDÉS AVEC SUCCÈS !');
}
