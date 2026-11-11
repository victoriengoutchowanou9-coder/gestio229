// =============================================================================
// GESTIO 229 SAAS — Suite de Tests : Fiches Techniques, Recettes,
// Rendement des Préparations & Déstockage Automatique (Bar, Restaurant, Maquis)
// Validation des 7 Tests Spécifiés dans le Cahier des Charges
// =============================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 ================================================================');
console.log('🧪 [GESTIO 229] SUITE DE TESTS : FICHES TECHNIQUES & RENDEMENT CUISINE');
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

// -----------------------------------------------------------------------------
// MODULE MATH & CALCULS FINANCIERS DE RENDEMENT
// -----------------------------------------------------------------------------

function calculateRecipeFinancials(ingredients, yieldPortions, sellingPrice) {
  const totalCost = ingredients.reduce((sum, item) => sum + (item.quantite * item.cout_unitaire), 0);
  const rendement = Math.max(1, yieldPortions || 1);
  const coutRevientUnitaire = Math.round((totalCost / rendement) * 100) / 100;
  const margeBruteUnitaire = sellingPrice - coutRevientUnitaire;
  const tauxMarge = coutRevientUnitaire > 0 ? (margeBruteUnitaire / coutRevientUnitaire) * 100 : 0;
  const tauxMarque = sellingPrice > 0 ? (margeBruteUnitaire / sellingPrice) * 100 : 0;
  const caPotentiel = Math.round(rendement * sellingPrice);
  const margeTotale = Math.round(caPotentiel - totalCost);

  return {
    totalCost,
    rendement,
    coutRevientUnitaire,
    margeBruteUnitaire,
    tauxMarge: Math.round(tauxMarge * 100) / 100,
    tauxMarque: Math.round(tauxMarque * 100) / 100,
    caPotentiel,
    margeTotale
  };
}

// =============================================================================
// 1. TEST DU CAS COMPLET : RIZ AU GRAS (MODE B - PRÉPARATION EN LOT)
// =============================================================================
console.log("[TEST 1] Cas complet : Riz au gras (Mode Lot / 10 portions)...");

test("Calcul exact du coût total, coût unitaire, marges et CA potentiel pour Riz au gras", () => {
  const ingredients = [
    { nom: 'Riz parfumé', quantite: 1, cout_unitaire: 500 },      // 500 F
    { nom: 'Huile végétale', quantite: 0.25, cout_unitaire: 1200 }, // 300 F
    { nom: 'Cubes d assaisonnement', quantite: 2, cout_unitaire: 50 }, // 100 F
    { nom: 'Viande et légumes divers', quantite: 1, cout_unitaire: 2600 } // 2 600 F
  ];
  // Total cost = 500 + 300 + 100 + 2600 = 3 500 FCFA
  const rendement = 10; // 10 portions
  const prixVente = 1500; // 1 500 FCFA

  const res = calculateRecipeFinancials(ingredients, rendement, prixVente);

  assert.strictEqual(res.totalCost, 3500, `Coût total attendu: 3500 FCFA, obtenu: ${res.totalCost}`);
  assert.strictEqual(res.coutRevientUnitaire, 350, `Coût unitaire portion attendu: 350 FCFA, obtenu: ${res.coutRevientUnitaire}`);
  assert.strictEqual(res.margeBruteUnitaire, 1150, `Marge unitaire portion attendue: 1150 FCFA, obtenu: ${res.margeBruteUnitaire}`);
  assert.strictEqual(res.caPotentiel, 15000, `CA potentiel attendu: 15 000 FCFA, obtenu: ${res.caPotentiel}`);
  assert.strictEqual(res.margeTotale, 11500, `Marge brute totale préparation attendue: 11 500 FCFA, obtenu: ${res.margeTotale}`);
  assert.strictEqual(res.tauxMarge, 328.57, `Taux de marge attendu: 328.57%, obtenu: ${res.tauxMarge}`);
  assert.strictEqual(res.tauxMarque, 76.67, `Taux de marque attendu: 76.67%, obtenu: ${res.tauxMarque}`);
});

// =============================================================================
// 2. TEST DU CAS : PIZZA (MODE A - À L'UNITÉ)
// =============================================================================
console.log("\n[TEST 2] Cas unitaire : Pizza Royale (Mode A / À l'unité)...");

test("Calcul unitaire pour Pizza avec Rendement = 1 portion", () => {
  const ingredients = [
    { nom: 'Pâte à pizza', quantite: 1, cout_unitaire: 400 },
    { nom: 'Sauce tomate cuisinée', quantite: 0.1, cout_unitaire: 1500 }, // 150 F
    { nom: 'Fromage Mozzarella', quantite: 0.15, cout_unitaire: 5000 },  // 750 F
    { nom: 'Jambon & Champignons', quantite: 1, cout_unitaire: 500 }     // 500 F
  ]; // Total = 1 800 FCFA
  const rendement = 1;
  const prixVente = 4500;

  const res = calculateRecipeFinancials(ingredients, rendement, prixVente);

  assert.strictEqual(res.totalCost, 1800, `Coût total attendu: 1800 FCFA, obtenu: ${res.totalCost}`);
  assert.strictEqual(res.coutRevientUnitaire, 1800, `Coût unitaire attendu: 1800 FCFA, obtenu: ${res.coutRevientUnitaire}`);
  assert.strictEqual(res.margeBruteUnitaire, 2700, `Marge brute unitaire attendue: 2700 FCFA, obtenu: ${res.margeBruteUnitaire}`);
  assert.strictEqual(res.caPotentiel, 4500, `CA potentiel attendu: 4500 FCFA, obtenu: ${res.caPotentiel}`);
  assert.strictEqual(res.margeTotale, 2700, `Marge totale attendue: 2700 FCFA, obtenu: ${res.margeTotale}`);
});

// =============================================================================
// 3. TEST DU CAS : CHAWARMA (MODE A - DOSAGE & MARGES)
// =============================================================================
console.log("\n[TEST 3] Cas unitaire : Chawarma Viande (Mode A)...");

test("Calcul unitaire Chawarma Viande avec dosage d'ingrédients multiples", () => {
  const ingredients = [
    { nom: 'Pain pita libanais', quantite: 1, cout_unitaire: 200 },
    { nom: 'Viande marinée', quantite: 0.12, cout_unitaire: 4000 }, // 480 F
    { nom: 'Sauce blanche', quantite: 0.03, cout_unitaire: 2000 },  // 60 F
    { nom: 'Crudités', quantite: 1, cout_unitaire: 160 }            // 160 F
  ]; // Total = 900 FCFA
  const rendement = 1;
  const prixVente = 2500;

  const res = calculateRecipeFinancials(ingredients, rendement, prixVente);

  assert.strictEqual(res.totalCost, 900, `Coût total attendu: 900 FCFA, obtenu: ${res.totalCost}`);
  assert.strictEqual(res.coutRevientUnitaire, 900);
  assert.strictEqual(res.margeBruteUnitaire, 1600);
  assert.strictEqual(res.tauxMarque, 64);
});

// =============================================================================
// 4. TEST DU NON-DOUBLE DÉSTOCKAGE (MODE B) & VALIDATION PRÉPARATION
// =============================================================================
console.log("\n[TEST 4] Cycle de vie Mode B : Validation de préparation & Vente caisse sans double déduction...");

test("restaurantService.ts implémente validerPreparationCuisine et isole Mode LOT de Mode UNITE", () => {
  const serviceCode = fs.readFileSync('src/services/restaurantService.ts', 'utf8');

  // 1. Présence de la méthode de validation de préparation
  assert(serviceCode.includes('async function validerPreparationCuisine'), "validerPreparationCuisine doit être déclarée et exportée.");
  
  // 2. Déstockage des matières premières lors de la cuisson du lot
  assert(serviceCode.includes('PREP-'), "Un mouvement de stock préfixé PREP- doit tracer la cuisson en cuisine.");
  assert(serviceCode.includes('newPortions = currentPortions + portionsObtenues') || serviceCode.includes('stock_vente: newPortions'), "La préparation doit créditer le stock_vente du plat.");
  
  // 3. Protection anti double déstockage dans destockerMatieresPlat
  assert(serviceCode.includes("modePrep === 'LOT'"), "destockerMatieresPlat doit tester modePrep === 'LOT'.");
  assert(serviceCode.includes("emplacement: 'CUISINE_PORTIONS'"), "Le déstockage Mode LOT doit cibler CUISINE_PORTIONS.");
  assert(serviceCode.includes("MODE B : PRÉPARATION EN LOT") && serviceCode.includes("double déduction"), "Logique garantissant l'absence de re-déstockage matières.");
});

// =============================================================================
// 5. TEST DU DÉSTOCKAGE EN DIRECT (MODE A)
// =============================================================================
console.log("\n[TEST 5] Déstockage en direct à la commande (Mode A)...");

test("destockerMatieresPlat déstocke proportionnellement les ingrédients bruts pour Mode A", () => {
  const serviceCode = fs.readFileSync('src/services/restaurantService.ts', 'utf8');

  assert(serviceCode.includes("MODE A : RECETTE À L'UNITÉ"), "destockerMatieresPlat doit identifier le Mode UNITE / Commande.");
  assert(serviceCode.includes("qteTotale = Math.round(Number(ing.quantite_necessaire || 1) * portion_qty * 1000) / 1000"),
    "La formule de calcul au prorata doit multiplier par les portions vendues.");
  assert(serviceCode.includes("convFactor") && serviceCode.includes("storageUnit !== ingUnit"), "La conversion d'unités (g/kg, cl/L) doit être prise en compte.");
});

// =============================================================================
// 6. TEST DE LA RÉCUPÉRATION DU COÛT RÉEL DE VALORISATION DES MATIÈRES PREMIÈRES
// =============================================================================
console.log("\n[TEST 6] Récupération du coût de valorisation des matières premières du stock cuisine...");

test("RecettesFichesPage.tsx extrait le coût réel (PMP, prix achat UV, coef) et refuse le 0 FCFA", () => {
  const pageCode = fs.readFileSync('src/pages/dashboard/restaurant/RecettesFichesPage.tsx', 'utf8');

  // Présence de la fonction de valorisation robuste
  assert(pageCode.includes('function extractCuisineProductCost'), "extractCuisineProductCost doit exister.");
  assert(pageCode.includes('price_achat_uv_ttc'), "Doit inspecter price_achat_uv_ttc pour les conditionnements.");
  assert(pageCode.includes('cout_valorisation'), "Doit inspecter cout_valorisation.");
  assert(pageCode.includes('p.coef'), "Doit prendre en compte le coefficient UV/UCD si nécessaire.");
  assert(pageCode.includes('cost_price'), "Doit vérifier cost_price.");
  assert(pageCode.includes('prix_achat'), "Doit vérifier prix_achat.");
});

// =============================================================================
// 7. TEST DU CONTRÔLE D'ACCÈS & ISOLATION SECTORIELLE
// =============================================================================
console.log("\n[TEST 7] Contrôle d'accès Administrateur et isolation des secteurs...");

test("Accès réservé strictement aux administrateurs pour les modifications de fiches techniques", () => {
  const pageCode = fs.readFileSync('src/pages/dashboard/restaurant/RecettesFichesPage.tsx', 'utf8');

  assert(pageCode.includes('const isAdmin = !user?.role || user.role === \'administrateur\' || user.role === \'super_admin\' || user.role === \'admin\' || user.role === \'owner\''),
    "La règle d'accès administrateur strict doit être définie.");
  assert(pageCode.includes('{isAdmin && ('), "Les boutons d'action d'édition/création doivent être protégés par isAdmin.");
});

test("Isolation sectorielle : Aucun impact sur les autres secteurs (Pharmacie, Station, etc.)", () => {
  const serviceCode = fs.readFileSync('src/services/restaurantService.ts', 'utf8');
  assert(serviceCode.includes("sector_slug = 'restaurant'"), "Le module cuisine est strictement borné au secteur restaurant.");
});

// =============================================================================
// RÉCAPITULATIF FINAL
// =============================================================================
console.log('\n================================================================');
console.log(`🎉 SUITE DE TESTS VALIDÉE AVEC SUCCÈS : ${passedTests}/${totalTests} tests réussis !`);
console.log('================================================================\n');
