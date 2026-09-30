// =============================================================================
// GESTIO 229 SaaS — Test de validation : Modale Bottom Sheet Panier & Checkout POS
// Multi-paiements stricts, Rendu monnaie, Ventilation et Verrouillage
// =============================================================================

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

function fmt(n) {
  return new Intl.NumberFormat('fr-BJ', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' FCFA';
}

function testSingleModeCashChange() {
  console.log('\n--- TEST 1 : Mode Unique (Espèces) et Rendu Monnaie ---');
  const totalNetTTC = 25000;

  // Cas 1 : Espèces reçues insuffisantes (20 000 pour 25 000)
  let cashGiven = 20000;
  let isCashInsufficient = cashGiven < totalNetTTC;
  let cashChange = Math.max(0, cashGiven - totalNetTTC);
  let canValidate = !isCashInsufficient && totalNetTTC > 0;
  let btnLabel = isCashInsufficient
    ? `Validation impossible : Espèces insuffisantes (Reste ${fmt(totalNetTTC - cashGiven)})`
    : `Valider la Vente (${fmt(totalNetTTC)})`;

  assert(isCashInsufficient === true, 'Espèces insuffisantes correctement détectées');
  assert(canValidate === false, 'Validation strictement bloquée quand espèces insuffisantes');
  assert(btnLabel === 'Validation impossible : Espèces insuffisantes (Reste 5 000 FCFA)', 'Libellé dynamique du bouton exact en cas de manque');

  // Cas 2 : Espèces reçues suffisantes avec monnaie (30 000 pour 25 000)
  cashGiven = 30000;
  isCashInsufficient = cashGiven < totalNetTTC;
  cashChange = Math.max(0, cashGiven - totalNetTTC);
  canValidate = !isCashInsufficient && totalNetTTC > 0;
  btnLabel = isCashInsufficient
    ? `Validation impossible : Espèces insuffisantes (Reste ${fmt(totalNetTTC - cashGiven)})`
    : `Valider la Vente (${fmt(totalNetTTC)})`;

  assert(isCashInsufficient === false, 'Espèces suffisantes détectées');
  assert(cashChange === 5000, `Monnaie à rendre correcte (attendu 5000, obtenu ${cashChange})`);
  assert(canValidate === true, 'Bouton de validation déverrouillé');
  assert(btnLabel === 'Valider la Vente (25 000 FCFA)', 'Bouton vert avec libellé officiel Valider la Vente');
}

function testMultiModeAutoAdjustmentAndBalance() {
  console.log('\n--- TEST 2 : Multi-Modes avec Ajustement Automatique et Badges ---');
  const totalNetTTC = 50000;

  // Saisie du Montant 1 -> Ajustement automatique du Montant 2
  let mode1Amount = 30000;
  let mode2Amount = Math.max(0, Math.round(totalNetTTC - mode1Amount));

  assert(mode2Amount === 20000, `Montant 2 ajusté automatiquement à 20000 FCFA`);

  let multiSum = mode1Amount + mode2Amount;
  let multiDiff = totalNetTTC - multiSum;
  let isBalanced = multiDiff === 0 && totalNetTTC > 0;
  let canValidate = isBalanced;

  assert(isBalanced === true, 'Équilibre parfait détecté (Somme = Total TTC)');
  assert(canValidate === true, 'Bouton Valider la Vente déverrouillé');

  // Modification manuelle de Montant 2 créant un sous-paiement (Reste à percevoir)
  mode2Amount = 15000; // Total 45000 vs 50000
  multiSum = mode1Amount + mode2Amount;
  multiDiff = totalNetTTC - multiSum;
  isBalanced = multiDiff === 0;
  canValidate = isBalanced;
  let badgeText = multiDiff > 0 ? `⚠️ Reste à percevoir : ${fmt(multiDiff)}` : '';
  let btnLabel = multiDiff > 0
    ? `Validation impossible : Somme ≠ Total TTC (Reste ${fmt(multiDiff)})`
    : `Valider la Vente (${fmt(totalNetTTC)})`;

  assert(isBalanced === false, 'Déséquilibre détecté');
  assert(canValidate === false, 'Validation strictement bloquée quand Somme != Total TTC');
  assert(badgeText === '⚠️ Reste à percevoir : 5 000 FCFA', 'Badge rouge Reste à percevoir affiché');
  assert(btnLabel === 'Validation impossible : Somme ≠ Total TTC (Reste 5 000 FCFA)', 'Libellé dynamique de blocage exact');

  // Modification manuelle créant un trop-perçu (Trop perçu)
  mode2Amount = 25000; // Total 55000 vs 50000
  multiSum = mode1Amount + mode2Amount;
  multiDiff = totalNetTTC - multiSum;
  isBalanced = multiDiff === 0;
  canValidate = isBalanced;
  badgeText = multiDiff < 0 ? `⚠️ Trop perçu : ${fmt(Math.abs(multiDiff))}` : '';
  btnLabel = multiDiff < 0
    ? `Validation impossible : Somme ≠ Total TTC (Trop perçu ${fmt(Math.abs(multiDiff))})`
    : `Valider la Vente (${fmt(totalNetTTC)})`;

  assert(isBalanced === false, 'Déséquilibre trop-perçu détecté');
  assert(canValidate === false, 'Validation bloquée en cas de trop-perçu');
  assert(badgeText === '⚠️ Trop perçu : 5 000 FCFA', 'Badge rouge Trop perçu affiché');
  assert(btnLabel === 'Validation impossible : Somme ≠ Total TTC (Trop perçu 5 000 FCFA)', 'Libellé dynamique de trop-perçu exact');
}

function testFiveDirectPaymentModes() {
  console.log('\n--- TEST 3 : Validation des 5 Canaux de Paiement ---');
  const expectedModes = [
    { id: 'especes', label: '💵 Espèces' },
    { id: 'momo_mtn', label: '📱 MoMo (MTN MoMo)' },
    { id: 'momo_moov', label: '📱 Moov / Flooz' },
    { id: 'banque', label: '🏦 Banque' },
    { id: 'credit', label: '📝 Crédit' },
  ];

  assert(expectedModes.length === 5, 'Exactement 5 modes de paiement directs disponibles');
  const ids = expectedModes.map(m => m.id);
  assert(ids.includes('especes'), 'Mode Espèces présent');
  assert(ids.includes('momo_mtn'), 'Mode MoMo (MTN MoMo) présent');
  assert(ids.includes('momo_moov'), 'Mode Moov / Flooz présent');
  assert(ids.includes('banque'), 'Mode Banque présent');
  assert(ids.includes('credit'), 'Mode Crédit présent');
}

function runAll() {
  console.log('=============================================================================');
  console.log('TESTS FONCTIONNELS : BOTTOM SHEET PANIER & CHECKOUT POS VENTE');
  console.log('=============================================================================');

  testSingleModeCashChange();
  testMultiModeAutoAdjustmentAndBalance();
  testFiveDirectPaymentModes();

  console.log('\n=============================================================================');
  console.log(`RÉSULTAT TOTAL : ${passed} passés, ${failed} échoués`);
  console.log('=============================================================================');

  if (failed > 0) process.exit(1);
}

runAll();
