// =============================================================================
// GESTIO 229 — SUITE DE VALIDATION AUTOMATISÉE DES CALCULS DE STOCK
// Conforme aux spécifications du cahier des charges GESTIO 229 (Norme UEMOA)
// =============================================================================

import {
  calcValeurStockMagasinAchat,
  calcValeurStockVente,
  calcValeurStockVenteAchat,
  calcValorisationTotaleAchatProduit,
  calcStockMagasinConvertiEnUv,
  calcStockTotalUv,
  calcValorisationTotaleVenteProduit,
  getProductValuationDetails,
  calculateStockValuation,
} from '../src/lib/stockCalcul.ts'

console.log('─────────────────────────────────────────────────────────────────────────────')
console.log('🧪 LANCEMENT DES TESTS AUTOMATISÉS DE VALORISATION DES STOCKS GESTIO 229')
console.log('─────────────────────────────────────────────────────────────────────────────\n')

let passedTests = 0
let failedTests = 0

function assert(condition, testName, details = '') {
  if (condition) {
    console.log(`  ✅ [PASS] ${testName}`)
    if (details) console.log(`     ↳ ${details}`)
    passedTests++
  } else {
    console.error(`  ❌ [FAIL] ${testName}`)
    if (details) console.error(`     ↳ ${details}`)
    failedTests++
  }
}

// =============================================================================
// TEST 1 : STOCK DE VENTE — VALEUR COMMERCIALE RAYON POS UV
// Prix de vente TTC : 6 000 FCFA
// Stock de vente : 19 UV (paquets)
// Résultat attendu : 19 × 6 000 = 114 000 FCFA (et JAMAIS 1 900 000 FCFA)
// =============================================================================
console.log('1️⃣  TEST 1 : Stock de vente (Valeur Commerciale)')
const productTest1 = {
  id: 'p-test-1',
  code: 'PAQ-001',
  name: 'Paquet Test Vente',
  cost_price: 100000,     // Prix d'achat UCD (carton/gros) = 100 000 FCFA
  selling_price: 6000,    // Prix de vente unitaire TTC (UV) = 6 000 FCFA
  stock_magasin: 0,
  stock_vente: 19,        // 19 paquets en rayon vente
  coef: 20,               // 1 carton = 20 paquets
  ucd: 'Carton',
  uv: 'Paquet',
}

const valVente1 = calcValeurStockVente(productTest1)
assert(
  valVente1 === 114000,
  'Calcul de la valeur du stock de vente rayon',
  `Valeur obtenue : ${valVente1.toLocaleString('fr-BJ')} FCFA | Attendu : 114 000 FCFA (pas 1 900 000)`
)

const summary1 = calculateStockValuation([productTest1])
assert(
  summary1.totalVenteValVente === 114000,
  'Carte STOCK VENTE affiche la valeur commerciale TTC',
  `Carte STOCK VENTE : ${summary1.totalVenteValVente.toLocaleString('fr-BJ')} FCFA`
)

// =============================================================================
// TEST 2 : STOCK MAGASIN — RÉSERVE UCD AU COÛT D'ACHAT
// Vérifie que la valorisation utilise le prix d'achat UCD, et non le prix de vente.
// =============================================================================
console.log('\n2️⃣  TEST 2 : Stock magasin (Réserve UCD au coût d\'achat)')
const productTest2 = {
  id: 'p-test-2',
  code: 'MAG-002',
  name: 'Carton Réserve Magasin',
  cost_price: 50000,      // Prix d'achat UCD = 50 000 FCFA
  selling_price: 4000,    // Prix de vente UV = 4 000 FCFA
  wholesale_price: 70000, // Prix de vente gros = 70 000 FCFA
  stock_magasin: 10,      // 10 cartons en réserve
  stock_vente: 0,
  coef: 20,
  ucd: 'Carton',
  uv: 'Pièce',
}

const valMagasin2 = calcValeurStockMagasinAchat(productTest2)
assert(
  valMagasin2 === 500000, // 10 × 50 000 = 500 000 FCFA
  'Valorisation magasin au coût d\'achat UCD (10 × 50 000)',
  `Valeur obtenue : ${valMagasin2.toLocaleString('fr-BJ')} FCFA | Attendu : 500 000 FCFA`
)
assert(
  valMagasin2 !== 10 * productTest2.selling_price && valMagasin2 !== 10 * productTest2.wholesale_price,
  'La valorisation magasin n\'utilise ni le prix de vente UV ni le prix de gros',
  `Coût d'achat UCD préservé : ${valMagasin2.toLocaleString('fr-BJ')} FCFA`
)

// =============================================================================
// TEST 3 : VALORISATION TOTALE ACHAT
// Vérifie que les stocks magasin et vente sont calculés avec leurs prix d'achat respectifs.
// Formule : (stock_magasin × prix_achat_ucd) + (stock_vente × prix_achat_uv)
// =============================================================================
console.log('\n3️⃣  TEST 3 : Valorisation totale achat (Distinction UCD & UV)')
const productTest3 = {
  id: 'p-test-3',
  code: 'TOT-003',
  name: 'Article Mixte Magasin + Vente',
  cost_price: 80000,      // Prix achat UCD = 80 000 FCFA (carton)
  selling_price: 5000,    // Prix vente UV = 5 000 FCFA
  stock_magasin: 5,       // 5 cartons en réserve
  stock_vente: 20,        // 20 paquets en rayon
  coef: 20,               // 1 carton = 20 paquets => prix achat UV = 80 000 / 20 = 4 000 FCFA
  ucd: 'Carton',
  uv: 'Paquet',
}

// Magasin : 5 × 80 000 = 400 000 FCFA
// Vente achat : 20 × 4 000 = 80 000 FCFA
// Total achat attendu = 480 000 FCFA
const valTotaleAchat3 = calcValorisationTotaleAchatProduit(productTest3)
const details3 = getProductValuationDetails(productTest3)

assert(
  details3.prixAchatUv === 4000,
  'Calcul exact du prix d\'achat UV (prix_achat_ucd / coef)',
  `Prix achat UV : ${details3.prixAchatUv.toLocaleString('fr-BJ')} FCFA`
)
assert(
  valTotaleAchat3 === 480000,
  'Valorisation totale achat correcte : (5 × 80 000) + (20 × 4 000)',
  `Valeur obtenue : ${valTotaleAchat3.toLocaleString('fr-BJ')} FCFA | Attendu : 480 000 FCFA`
)

// =============================================================================
// TEST 4 : VALORISATION TOTALE VENTE (NOUVELLE CARTE)
// Vérifie que le stock magasin est converti en UV avec le taux réel du produit
// avant d'être valorisé au prix de vente TTC.
// Formule : (stock_magasin_converti_en_uv + stock_vente) × prix_vente_ttc
// =============================================================================
console.log('\n4️⃣  TEST 4 : Valorisation totale vente (Valeur commerciale globale)')
const productTest4 = {
  id: 'p-test-4',
  code: 'TON-004',
  name: 'Ciment Tonne & Sacs',
  cost_price: 75000,      // Tonne achat = 75 000 FCFA
  selling_price: 4500,    // Sac de 50kg vente TTC = 4 500 FCFA
  stock_magasin: 3,       // 3 tonnes en magasin
  stock_vente: 15,        // 15 sacs en rayon
  coef: 20,               // 1 tonne = 20 sacs
  ucd: 'Tonne',
  uv: 'Sac 50kg',
}

// Magasin converti en UV : 3 × 20 = 60 sacs
// Total sacs : 60 + 15 = 75 sacs
// Valeur commerciale totale : 75 × 4 500 = 337 500 FCFA
const stockMagasinUv4 = calcStockMagasinConvertiEnUv(productTest4)
const stockTotalUv4 = calcStockTotalUv(productTest4)
const valTotaleVente4 = calcValorisationTotaleVenteProduit(productTest4)

assert(
  stockMagasinUv4 === 60,
  'Conversion magasin UCD -> UV (3 tonnes × 20 = 60 sacs)',
  `Stock magasin en UV : ${stockMagasinUv4} sacs`
)
assert(
  stockTotalUv4 === 75,
  'Stock total en UV (60 magasin + 15 rayon = 75 sacs)',
  `Stock global : ${stockTotalUv4} sacs`
)
assert(
  valTotaleVente4 === 337500,
  'Valorisation totale vente : 75 sacs × 4 500 FCFA = 337 500 FCFA',
  `Valeur obtenue : ${valTotaleVente4.toLocaleString('fr-BJ')} FCFA | Attendu : 337 500 FCFA`
)

// =============================================================================
// TEST 5 : COHÉRENCE GLOBALE (CARTES, TABLEAUX & RAPPORTS)
// Vérifie que les cartes, tableaux et rapports utilisent les mêmes fonctions
// centrales et produisent les mêmes montants pour les mêmes données.
// =============================================================================
console.log('\n5️⃣  TEST 5 : Cohérence globale & Intégrité multi-composants')
const catalogue = [productTest1, productTest2, productTest3, productTest4]
const globalSummary = calculateStockValuation(catalogue)

// Calcul ligne par ligne (comme dans le tableau des produits)
let sumTableMagasinAchat = 0
let sumTableVenteCommercial = 0
let sumTableTotalAchat = 0
let sumTableTotalVente = 0

catalogue.forEach((p) => {
  const row = getProductValuationDetails(p)
  sumTableMagasinAchat += row.valeurStockMagasinAchat
  sumTableVenteCommercial += row.valeurStockVente
  sumTableTotalAchat += row.valorisationTotaleAchat
  sumTableTotalVente += row.valorisationTotaleVente
})

assert(
  globalSummary.totalMagasinValAchat === sumTableMagasinAchat,
  'Carte STOCK MAGASIN == Somme colonne tableau Valeur Magasin',
  `${globalSummary.totalMagasinValAchat.toLocaleString('fr-BJ')} FCFA`
)
assert(
  globalSummary.totalVenteValVente === sumTableVenteCommercial,
  'Carte STOCK VENTE == Somme colonne tableau Valeur Vente',
  `${globalSummary.totalVenteValVente.toLocaleString('fr-BJ')} FCFA`
)
assert(
  globalSummary.totalStockValAchat === sumTableTotalAchat,
  'Carte VALORISATION TOTALE ACHAT == Somme totale achat des produits',
  `${globalSummary.totalStockValAchat.toLocaleString('fr-BJ')} FCFA`
)
assert(
  globalSummary.totalStockValVente === sumTableTotalVente,
  'Carte VALORISATION TOTALE VENTE == Somme totale vente des produits',
  `${globalSummary.totalStockValVente.toLocaleString('fr-BJ')} FCFA`
)

// =============================================================================
// TEST 6 : GESTION DES VALEURS NULL, MISSING COEF ET CAS LIMITES
// =============================================================================
console.log('\n6️⃣  TEST 6 : Robustesse (valeurs nulles, undefined, coef manquant ou invalide)')
const productEdge = {
  id: 'p-edge',
  code: 'EDGE-001',
  name: 'Produit sans coef',
  cost_price: null,
  selling_price: '2500',
  stock_magasin: null,
  stock_vente: '10',
  coef: 0, // invalide
}

const edgeDetails = getProductValuationDetails(productEdge)
assert(
  edgeDetails.stockMagasin === 0 && edgeDetails.prixAchatUcd === 0,
  'Valeurs nulles gérées sans exception ni NaN',
  `Stock magasin: ${edgeDetails.stockMagasin}, Prix achat: ${edgeDetails.prixAchatUcd}`
)
assert(
  edgeDetails.valeurStockVente === 25000,
  'Stock vente correctement valorisé (10 × 2 500 = 25 000 FCFA)',
  `Valeur obtenue : ${edgeDetails.valeurStockVente.toLocaleString('fr-BJ')} FCFA`
)
assert(
  edgeDetails.coef === 1 && edgeDetails.hasValidConversion === false,
  'Coef <= 0 traité avec ratio de sécurité 1:1 sans inventer de taux',
  `Coef: ${edgeDetails.coef}, hasValidConversion: ${edgeDetails.hasValidConversion}`
)

// ─── BILAN DES TESTS ────────────────────────────────────────────────────────
console.log('\n─────────────────────────────────────────────────────────────────────────────')
if (failedTests === 0) {
  console.log(`🎉 TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS : ${passedTests}/${passedTests} VALIDÉS`)
  console.log('─────────────────────────────────────────────────────────────────────────────\n')
  process.exit(0)
} else {
  console.error(`🚨 ÉCHECS DÉTECTÉS : ${failedTests} test(s) échoué(s) sur ${passedTests + failedTests}`)
  console.log('─────────────────────────────────────────────────────────────────────────────\n')
  process.exit(1)
}
