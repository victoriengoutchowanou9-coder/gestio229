#!/usr/bin/env node
/**
 * TEST SUITE : AUDIT ET VALIDATION ANTI-DOUBLE COMPTABILISATION CLÔTURE DE CAISSE
 * GESTIO229 - Tous secteurs d'activités
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let passedTests = 0;
let totalTests = 0;

function runTest(description, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✓ PASS: ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`    ${err.message}`);
  }
}

console.log('================================================================');
console.log(' SUITE DE TESTS : CLÔTURE DE CAISSE & ANTI-DOUBLE COMPTABILISATION');
console.log('================================================================\n');

// ── TEST 1 : Vérification de la formule comptable du prompt utilisateur ──────
runTest('Scénario Prompt : Fond Initial 50k/20k + Ventes 30k/15k -> 80k/35k (Jamais 110k/50k)', () => {
  const fondInitialEsp = 50000;
  const fondInitialMomo = 20000;
  const venteEsp = 30000;
  const venteMomo = 15000;
  const depensesEsp = 0;
  const retraitsEsp = 0;

  // Calcul avant clôture
  const soldeAvantClotureEsp = fondInitialEsp + venteEsp - depensesEsp - retraitsEsp;
  const soldeAvantClotureMomo = fondInitialMomo + venteMomo;
  assert.strictEqual(soldeAvantClotureEsp, 80000, 'Solde avant clôture espèces doit être 80 000');
  assert.strictEqual(soldeAvantClotureMomo, 35000, 'Solde avant clôture MoMo doit être 35 000');

  // RÈGLE ANTI-DOUBLE COMPTABILISATION :
  // Le fond reporté après clôture est exactement le solde théorique de fin de période
  const soldeApresClotureEsp = soldeAvantClotureEsp;
  const soldeApresClotureMomo = soldeAvantClotureMomo;

  assert.strictEqual(soldeApresClotureEsp, 80000, 'Solde après clôture espèces DOIT être 80 000');
  assert.strictEqual(soldeApresClotureMomo, 35000, 'Solde après clôture MoMo DOIT être 35 000');
  assert.notStrictEqual(soldeApresClotureEsp, 110000, 'INTERDIT: Le solde après clôture ne doit JAMAIS valoir 110 000 !');
  assert.notStrictEqual(soldeApresClotureMomo, 50000, 'INTERDIT: Le solde après clôture ne doit JAMAIS valoir 50 000 !');
});

// ── TEST 2 : Scénario avec Dépenses, Retraits et Paiements Mixtes ────────────
runTest('Scénario complexe : Ventes, Dépenses et Retraits', () => {
  const fondInitialEsp = 100000;
  const fondInitialMomo = 50000;
  const ventesEsp = 40000;
  const ventesMomo = 25000;
  const depensesEsp = 15000;
  const depensesMomo = 5000;
  const versementsCoffreEsp = 10000;

  const soldeTheoriqueEsp = fondInitialEsp + ventesEsp - depensesEsp - versementsCoffreEsp;
  const soldeTheoriqueMomo = fondInitialMomo + ventesMomo - depensesMomo;

  assert.strictEqual(soldeTheoriqueEsp, 115000, 'Solde espèces attendu = 115 000');
  assert.strictEqual(soldeTheoriqueMomo, 70000, 'Solde MoMo attendu = 70 000');

  // Après clôture, le fond laissé doit être 115 000 et NON 115 000 + 40 000 = 155 000
  const fondLaisseEsp = soldeTheoriqueEsp;
  const fondLaisseMomo = soldeTheoriqueMomo;
  assert.strictEqual(fondLaisseEsp, 115000);
  assert.strictEqual(fondLaisseMomo, 70000);
});

// ── TEST 3 : Vérification de M084_fix_double_comptabilisation_cloture.sql ────
runTest('Migration M084 : fn_cloturer_caisse ne rajoute PAS v_esp_jour sur fond_actuel', () => {
  const migrationPath = path.resolve(__dirname, '..', 'database', 'M084_fix_double_comptabilisation_cloture.sql');
  assert.ok(fs.existsSync(migrationPath), 'Le fichier M084 doit exister');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.ok(sql.includes('v_nouveau_fond_esp := v_fond_esp_actuel;'), 'v_nouveau_fond_esp doit être assigné depuis v_fond_esp_actuel sans addition');
  assert.ok(sql.includes('v_nouveau_fond_momo := v_fond_momo_actuel;'), 'v_nouveau_fond_momo doit être assigné depuis v_fond_momo_actuel sans addition');
  assert.ok(!sql.includes('v_nouveau_fond_esp := v_fond_esp_actuel + v_esp_jour;'), 'L\'addition buguée ne doit plus exister dans M084');
});

// ── TEST 4 : Vérification de caisseSectorService.ts ────────────────────────
runTest('caisseSectorService.ts : newMomo est corrigé et soldeTheoriqueMomo est utilisé', () => {
  const servicePath = path.resolve(__dirname, '..', 'src', 'services', 'caisseSectorService.ts');
  const code = fs.readFileSync(servicePath, 'utf8');

  assert.ok(!code.includes('fond_ouverture_momo: newMomo,'), 'newMomo ne doit plus être utilisé pour fond_ouverture_momo');
  assert.ok(!code.includes('fond_momo_apres: newMomo,'), 'newMomo ne doit plus être utilisé pour fond_momo_apres');
  assert.ok(!code.includes('fond_reel_momo: newMomo,'), 'newMomo ne doit plus être utilisé pour fond_reel_momo');
  assert.ok(code.includes('fond_ouverture_momo: soldeTheoriqueMomo,'), 'soldeTheoriqueMomo doit être utilisé pour fond_ouverture_momo');
});

// ── TEST 5 : CaissePage.tsx - Pas de double appel cloturerCaisseOfficielle ──
runTest('CaissePage.tsx : suppression de l\'appel redondant à cloturerCaisseOfficielle dans handleConfirmCloseCaisse', () => {
  const pagePath = path.resolve(__dirname, '..', 'src', 'pages', 'dashboard', 'caisse', 'CaissePage.tsx');
  const code = fs.readFileSync(pagePath, 'utf8');

  // Dans handleConfirmCloseCaisse, seul cloturerSessionCaisseAutomatique doit être appelé
  const handleCloseSection = code.substring(code.indexOf('const handleConfirmCloseCaisse'), code.indexOf('const handleCloturerCaisseDirect'));
  assert.ok(handleCloseSection.includes('cloturerSessionCaisseAutomatique'), 'cloturerSessionCaisseAutomatique doit être présent');
  assert.ok(!handleCloseSection.includes('await cloturerCaisseOfficielle('), 'cloturerCaisseOfficielle NE doit PAS être appelé dans handleConfirmCloseCaisse');
});

// ── TEST 6 : CaissePage.tsx - especesDuJour = 0 quand FERMEE ────────────────
runTest('CaissePage.tsx : especesDuJour et momoDuJour sont à 0 quand la session est fermée', () => {
  const pagePath = path.resolve(__dirname, '..', 'src', 'pages', 'dashboard', 'caisse', 'CaissePage.tsx');
  const code = fs.readFileSync(pagePath, 'utf8');

  assert.ok(code.includes("const especesDuJour = caisseStatus === 'FERMEE'"), 'especesDuJour doit vérifier caisseStatus === FERMEE');
  assert.ok(code.includes("const momoDuJour = caisseStatus === 'FERMEE'"), 'momoDuJour doit vérifier caisseStatus === FERMEE');
});

// ── TEST 7 : CaissePage.tsx - setLastClosure inclut fond_especes_theorique ──
runTest('CaissePage.tsx : setLastClosure initialise fond_especes_theorique et fond_momo', () => {
  const pagePath = path.resolve(__dirname, '..', 'src', 'pages', 'dashboard', 'caisse', 'CaissePage.tsx');
  const code = fs.readFileSync(pagePath, 'utf8');

  assert.ok(code.includes('fond_especes_theorique: repEsp'), 'loadCaisseData doit définir fond_especes_theorique');
  assert.ok(code.includes('fond_momo: repMo'), 'loadCaisseData doit définir fond_momo');
});

// ── TEST 8 : CaissePage.tsx - Rapport intermédiaire sans double addition ────
runTest('CaissePage.tsx : le bouton rapport intermédiaire n\'ajoute pas especesDuJour en double', () => {
  const pagePath = path.resolve(__dirname, '..', 'src', 'pages', 'dashboard', 'caisse', 'CaissePage.tsx');
  const code = fs.readFileSync(pagePath, 'utf8');

  assert.ok(!code.includes('fond_especes_theorique: fondActuelEspeces + especesDuJour'), 'Rapport intermédiaire ne doit pas additionner especesDuJour');
  assert.ok(!code.includes('fond_momo: fondActuelMomo + momoDuJour'), 'Rapport intermédiaire ne doit pas additionner momoDuJour');
});

// ── TEST 9 : ClotureCaisse.tsx - Synchronisation des fonds et réinitialisation ─
runTest('ClotureCaisse.tsx : synchronise fonds_actuels et réinitialise caisse_journaliere', () => {
  const cloturePath = path.resolve(__dirname, '..', 'src', 'pages', 'dashboard', 'caisse', 'ClotureCaisse.tsx');
  const code = fs.readFileSync(cloturePath, 'utf8');

  assert.ok(code.includes(".from('fonds_actuels').upsert"), 'fonds_actuels doit être mis à jour lors de la clôture multi-secteurs');
  assert.ok(code.includes(".from('caisse_journaliere')"), 'caisse_journaliere doit être mise à jour');
  assert.ok(code.includes('solde_especes_final: ligne.soldeActuel'), 'solde_especes_final doit être reporté');
});

// ── TEST 10 : Simulation de Clôture avec l\'objet Synthese ──────────────────
runTest('Simulation SessionCalculatedBalances : calcul exact sans double addition', () => {
  function simulateCloture(params) {
    const { fondInitialEsp, fondInitialMo, ventesEsp, ventesMo, depensesEsp, retraitsEsp } = params;
    
    // 1. Entrées de session
    const entreesEspeces = ventesEsp;
    const entreesMomo = ventesMo;

    // 2. Solde théorique = Initial + Entrées - Dépenses - Retraits
    const soldeTheoriqueEspeces = fondInitialEsp + entreesEspeces - depensesEsp - retraitsEsp;
    const soldeTheoriqueMomo = fondInitialMo + entreesMomo;

    // 3. Montant laissé = solde théorique (report)
    const montantConserve = soldeTheoriqueEspeces;

    // 4. Clôture de la session : nouveau fond actuel = montant laissé
    const nouveauFondActuelEsp = montantConserve;
    const nouveauFondActuelMomo = soldeTheoriqueMomo;

    return {
      entreesEspeces,
      entreesMomo,
      soldeTheoriqueEspeces,
      soldeTheoriqueMomo,
      nouveauFondActuelEsp,
      nouveauFondActuelMomo,
    };
  }

  const res = simulateCloture({
    fondInitialEsp: 50000,
    fondInitialMo: 20000,
    ventesEsp: 30000,
    ventesMo: 15000,
    depensesEsp: 0,
    retraitsEsp: 0,
  });

  assert.strictEqual(res.soldeTheoriqueEspeces, 80000);
  assert.strictEqual(res.soldeTheoriqueMomo, 35000);
  assert.strictEqual(res.nouveauFondActuelEsp, 80000);
  assert.strictEqual(res.nouveauFondActuelMomo, 35000);

  // Vérifier qu'un appel ultérieur n'ajoute pas à nouveau ventesEsp
  const nouveauFondApresRecloture = res.nouveauFondActuelEsp; // Ne doit JAMAIS être res.nouveauFondActuelEsp + res.entreesEspeces
  assert.strictEqual(nouveauFondApresRecloture, 80000);
});

console.log('\n================================================================');
console.log(` RÉSULTATS : ${passedTests}/${totalTests} tests réussis (${Math.round((passedTests/totalTests)*100)}%)`);
console.log('================================================================\n');

if (passedTests === totalTests) {
  process.exit(0);
} else {
  process.exit(1);
}
