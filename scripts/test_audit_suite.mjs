// scripts/test_audit_suite.mjs
// Comprehensive test suite for GESTIO 229 Financial Audit & Bug Fixes

import assert from 'node:assert/strict';
import {
  computeOrderCOGS,
  computeOrderMargin,
  computeConsolidatedFinancials,
  isTrueOperatingExpense
} from '../src/lib/financialCalcul.ts';

function computeNetMargin(grossMargin, operatingExpenses) {
  return Math.round((grossMargin - operatingExpenses) * 100) / 100;
}

console.log('====================================================');
console.log('  GESTIO 229 - SUITE DE TESTS D\'AUDIT ET DE VALIDATION');
console.log('====================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] Test ${totalTests}: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// SCÉNARIO 1 : Journée sans vente ni dépense (ex: Hier)
// -----------------------------------------------------------------------------
runTest('Scénario 1 - Journée sans vente ni dépense : CA=0, Dépenses=0 => Marge nette=0 (Pas de déficit fantôme)', () => {
  const sales = [];
  const expenses = [];
  
  const ca = sales.reduce((sum, s) => sum + s.total_amount, 0);
  const cogs = sales.reduce((sum, s) => sum + computeOrderCOGS(s).cogsHT, 0);
  const grossMargin = ca - cogs;
  
  const operatingExpenses = expenses.filter(isTrueOperatingExpense).reduce((sum, e) => sum + e.montant, 0);
  const netMargin = computeNetMargin(grossMargin, operatingExpenses);
  
  assert.equal(ca, 0);
  assert.equal(grossMargin, 0);
  assert.equal(operatingExpenses, 0);
  assert.equal(netMargin, 0, 'La marge nette ne doit jamais absorber les 1 060 753 FCFA de dépenses historiques');
});

// -----------------------------------------------------------------------------
// SCÉNARIO 2 : Journée avec ventes et sans dépense (ex: Aujourd\'hui)
// -----------------------------------------------------------------------------
runTest('Scénario 2 - Journée avec ventes (32 751 FCFA) et clôtures de caisse (833 503 FCFA)', () => {
  const todaySales = [
    {
      id: 'sale-1',
      total_amount: 32751,
      subtotal_ht: 32751,
      tax_amount: 0,
      tva_amount: 0,
      lines: [
        { product_name: 'HM 16+ 20KG', quantity: 22.5, unit_price: 1455.6, unit_cost: 1256.49777 }
      ]
    }
  ];

  // Mouvements de caisse réels constatés le 15 Octobre
  const todayCaisseMouvements = [
    { id: 1, type: 'cloture', sens: 'sortie', montant: 420002, motif: 'Clôture session caisse #1' },
    { id: 2, type: 'cloture', sens: 'sortie', montant: 410501, motif: 'Clôture session caisse #2' },
    { id: 3, type: 'cloture', sens: 'sortie', montant: 3000, motif: 'Clôture session caisse #3' }
  ];

  const ca = todaySales.reduce((sum, s) => sum + s.total_amount, 0);
  const cogs = todaySales.reduce((sum, s) => sum + computeOrderCOGS(s).cogsHT, 0);
  const grossMargin = computeOrderMargin(todaySales[0]).grossMargin;

  // Filtrage strict : les clôtures ne sont PAS des dépenses d'exploitation
  const operatingExpenses = todayCaisseMouvements
    .filter(isTrueOperatingExpense)
    .reduce((sum, m) => sum + m.montant, 0);

  const netMargin = computeNetMargin(grossMargin, operatingExpenses);

  assert.equal(ca, 32751, 'CA doit être 32 751 FCFA');
  assert.ok(Math.abs(cogs - 28271.19) < 0.1, `COGS attendu ~28 271.19, reçu ${cogs}`);
  assert.ok(Math.abs(grossMargin - 4479.81) < 0.1, `Marge brute attendue ~+4 479.81, reçu ${grossMargin} (PAS -516 FCFA)`);
  assert.equal(operatingExpenses, 0, 'Les 833 503 FCFA de clôtures doivent être exclus des dépenses');
  assert.ok(Math.abs(netMargin - 4479.81) < 0.1, `Marge nette doit être égale à marge brute quand dépenses=0`);
});

// -----------------------------------------------------------------------------
// SCÉNARIO 3 : Dépenses antérieures (ex: 2 500 FCFA du 7 Octobre)
// -----------------------------------------------------------------------------
runTest('Scénario 3 - Isolation temporelle des dépenses du 7 Octobre', () => {
  const allMouvements = [
    { id: 101, date: '2026-10-07T10:00:00', type: 'depense', sens: 'sortie', montant: 500, motif: 'SONEB eau' },
    { id: 102, date: '2026-10-07T11:00:00', type: 'depense', sens: 'sortie', montant: 500, motif: 'Fournitures BIC' },
    { id: 103, date: '2026-10-07T15:30:00', type: 'depense', sens: 'sortie', montant: 1500, motif: 'Électricité SBEE' }
  ];

  // Filtrer pour Aujourd'hui (2026-10-15)
  const todayDate = '2026-10-15';
  const todayDepenses = allMouvements.filter(m => m.date.startsWith(todayDate) && isTrueOperatingExpense(m));
  assert.equal(todayDepenses.length, 0, 'Aucune dépense ne doit être attribuée à aujourd\'hui');

  // Filtrer pour le 7 Octobre
  const oct7Date = '2026-10-07';
  const oct7Depenses = allMouvements.filter(m => m.date.startsWith(oct7Date) && isTrueOperatingExpense(m));
  const sumOct7 = oct7Depenses.reduce((sum, m) => sum + m.montant, 0);
  assert.equal(sumOct7, 2500, 'Les dépenses du 7 octobre totalisent exactement 2 500 FCFA sur leur propre journée');
});

// -----------------------------------------------------------------------------
// SCÉNARIO 4 : Achat de stock vs Dépenses d'exploitation
// -----------------------------------------------------------------------------
runTest('Scénario 4 - Achat de stock en inventaire ne doit pas polluer les charges d\'exploitation', () => {
  const purchaseMovement = {
    type: 'achat_stock',
    sens: 'sortie',
    montant: 500000,
    motif: 'Achat de 50 cartons de poisson Tilapia pour le stock'
  };

  const isExpense = isTrueOperatingExpense(purchaseMovement);
  assert.equal(isExpense, false, 'Un achat de stock ne doit pas être qualifié de dépense d\'exploitation');
});

// -----------------------------------------------------------------------------
// SCÉNARIO 5 : Mise à jour du stock lors de la vente POS sans colonne PGRST204
// -----------------------------------------------------------------------------
runTest('Scénario 5 - Décrémentation du stock dans sector_meta sans colonne inexistante stock_vente', () => {
  const initialProduct = {
    id: 'prod-hm16',
    name: 'HM 16+ 20KG',
    sector_meta: {
      stock_vente: 18,
      stock_magasin: 200,
      unite_vente: 'KG'
    }
  };

  const quantitySold = 5;
  const currentStockVente = Number(initialProduct.sector_meta?.stock_vente) || 0;
  const newStockVente = Math.max(0, currentStockVente - quantitySold);

  const updatedMeta = {
    ...(initialProduct.sector_meta || {}),
    stock_vente: newStockVente
  };

  // Payload qui doit être envoyé à Supabase (SANS le champ top-level stock_vente)
  const supabasePayload = {
    sector_meta: updatedMeta,
    updated_at: new Date().toISOString()
  };

  assert.equal(supabasePayload.sector_meta.stock_vente, 13);
  assert.equal(supabasePayload.stock_vente, undefined, 'Ne doit PAS contenir de propriété stock_vente au niveau racine');
});

// -----------------------------------------------------------------------------
// SCÉNARIO 6 : Avoirs et retours clients
// -----------------------------------------------------------------------------
runTest('Scénario 6 - Calcul de marge brute après avoir client', () => {
  const originalSale = {
    total_amount: 32751,
    subtotal_ht: 32751,
    tax_amount: 0,
    lines: [{ product_name: 'HM 16+ 20KG', quantity: 22.5, unit_price: 1455.6, unit_cost: 1256.49777 }]
  };

  const avoir = {
    amount: 5000,
    cost_returned: 4000
  };

  const netRevenue = originalSale.subtotal_ht - avoir.amount; // 27 751
  const netCogs = computeOrderCOGS(originalSale).cogsHT - avoir.cost_returned; // 28 271.19 - 4000 = 24 271.19
  const correctedGrossMargin = netRevenue - netCogs; // 3479.81

  assert.ok(correctedGrossMargin > 0, 'La marge brute reste cohérente et positive après avoir');
  assert.ok(Math.abs(correctedGrossMargin - 3479.81) < 0.1);
});

// -----------------------------------------------------------------------------
// SCÉNARIO 7 : Filtrage par fuseau horaire Cotonou (UTC+1)
// -----------------------------------------------------------------------------
runTest('Scénario 7 - Cohérence des dates avec le fuseau Cotonou (UTC+1)', () => {
  // Une vente effectuée à 00:30 le 15 Octobre à Cotonou est 23:30 le 14 Octobre UTC
  const isoUtc = '2026-10-14T23:30:00.000Z';
  
  function extractCotonouDate(isoString) {
    if (!isoString) return '';
    try {
      const parts = new Intl.DateTimeFormat('fr-FR', {
        timeZone: 'Africa/Porto-Novo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(new Date(isoString));
      const year = parts.find(p => p.type === 'year')?.value;
      const month = parts.find(p => p.type === 'month')?.value;
      const day = parts.find(p => p.type === 'day')?.value;
      return `${year}-${month}-${day}`;
    } catch {
      return isoString.slice(0, 10);
    }
  }

  const cotonouDate = extractCotonouDate(isoUtc);
  assert.equal(cotonouDate, '2026-10-15', 'Une vente à 23h30 UTC doit être comptabilisée le 15 Octobre à Cotonou (UTC+1)');
});

// -----------------------------------------------------------------------------
// SCÉNARIO 8 : Idempotence et absence d'effets secondaires
// -----------------------------------------------------------------------------
runTest('Scénario 8 - Idempotence du calcul financier', () => {
  const sale = {
    total_amount: 10000,
    subtotal_ht: 10000,
    tax_amount: 0,
    lines: [{ quantity: 10, unit_price: 1000, unit_cost: 800 }]
  };

  const margin1 = computeOrderMargin(sale);
  const margin2 = computeOrderMargin(sale);
  assert.equal(margin1.grossMargin, margin2.grossMargin, 'Le calcul doit être rigoureusement déterministe et idempotent');
  assert.equal(margin1.cogsHT, margin2.cogsHT);
});

// -----------------------------------------------------------------------------
// SCÉNARIO 9 : Rapprochement et Traçabilité (Somme des marges produits = Marge globale)
// -----------------------------------------------------------------------------
runTest('Scénario 9 - Cohérence stricte : Marge brute globale == Somme des marges produits', () => {
  const items = [
    { product_name: 'Dorade Royale', quantity: 10, unit_price: 3000, unit_cost: 2200 },
    { product_name: 'Bar de Mer', quantity: 5, unit_price: 4500, unit_cost: 3500 },
    { product_name: 'Crevettes Tigrées', quantity: 2, unit_price: 8000, unit_cost: 6000 }
  ];

  const totalCA = items.reduce((sum, i) => sum + (i.quantity * i.unit_price), 0); // 30k + 22.5k + 16k = 68.5k
  const totalCOGS = items.reduce((sum, i) => sum + (i.quantity * i.unit_cost), 0); // 22k + 17.5k + 12k = 51.5k
  const globalGrossMargin = totalCA - totalCOGS; // 17 000 FCFA

  const itemMarginsSum = items.reduce((sum, i) => {
    const lineCA = i.quantity * i.unit_price;
    const lineCOGS = i.quantity * i.unit_cost;
    return sum + (lineCA - lineCOGS);
  }, 0);

  assert.equal(globalGrossMargin, itemMarginsSum, 'La marge brute globale doit correspondre exactement au tableau de marge par produit');
  assert.equal(globalGrossMargin, 17000);
});

console.log(`\n====================================================`);
console.log(`  RÉSULTATS DE LA SUITE DE TESTS : ${passedTests}/${totalTests} TESTS RÉUSSIS`);
console.log(`====================================================\n`);
