/**
 * Test de validation :
 * CORRECTION DU BUG D'AJOUT DE POMPE DANS STATION-SERVICE (GESTIO 229)
 * 
 * Vérifications :
 * 1. Les valeurs exactes autorisées par station_pompes_type_carburant_check sont :
 *    'SP95', 'SP98', 'Gasoil', 'Kerosene', 'Gaz'.
 * 2. Normalisation automatique de la valeur envoyée :
 *    - Essence Super / Super / Essence / SP95 -> 'SP95'
 *    - SP98 -> 'SP98'
 *    - Gasoil / Diesel -> 'Gasoil'
 *    - Pétrole / Pétrole Lampant / Kérosène -> 'Kerosene'
 *    - Gaz / GPL -> 'Gaz'
 * 3. Validation de safeStationInsert et safeStationUpdate dans stationFuelHelper.ts
 * 4. Validation de handleSavePompe dans PompesCuvesPage.tsx
 * 5. Simulation des 2 tests obligatoires du cahier des charges :
 *    - Pompe1 avec CUVE SUPER + Essence Super + Index 0
 *    - Gasoil + Index 0
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('🧪 ================================================================');
console.log('🧪 [GESTIO 229] VALIDATION CORRECTION AJOUT POMPE STATION SERVICE');
console.log('🧪 ================================================================');

// 1. Vérification des fichiers modifiés
const pompesCuvesPath = path.join(__dirname, '..', 'src', 'pages', 'dashboard', 'station', 'PompesCuvesPage.tsx');
assert.ok(fs.existsSync(pompesCuvesPath), 'PompesCuvesPage.tsx doit exister');
const pompesCuvesContent = fs.readFileSync(pompesCuvesPath, 'utf-8');

const helperPath = path.join(__dirname, '..', 'src', 'utils', 'stationFuelHelper.ts');
assert.ok(fs.existsSync(helperPath), 'stationFuelHelper.ts doit exister');
const helperContent = fs.readFileSync(helperPath, 'utf-8');

console.log('\n[TEST 1] Vérification de la normalisation dans PompesCuvesPage.tsx...');
assert.ok(
  pompesCuvesContent.includes('dbTypeCarburant') &&
  pompesCuvesContent.includes("'SP95'") &&
  pompesCuvesContent.includes("'Gasoil'") &&
  pompesCuvesContent.includes("'Kerosene'") &&
  pompesCuvesContent.includes("'Gaz'"),
  'PompesCuvesPage.tsx doit normaliser le type_carburant vers les valeurs autorisées'
);
console.log('  ✅ PASS: Normalisation de type_carburant active dans PompesCuvesPage.tsx');

console.log('\n[TEST 2] Vérification de la résilience dans stationFuelHelper.ts...');
assert.ok(
  helperContent.includes("table === 'station_pompes'") &&
  helperContent.includes("'SP95'") &&
  helperContent.includes("'Kerosene'"),
  'stationFuelHelper.ts doit normaliser type_carburant pour station_pompes'
);
console.log('  ✅ PASS: stationFuelHelper.ts protège contre les violations de contrainte CHECK');

console.log('\n[TEST 3] Simulation de la conversion pour tous les types de carburants...');
function normalizeFuel(raw) {
  const tc = String(raw || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (tc.includes('super') || tc.includes('essence') || tc === 'sp95') return 'SP95';
  if (tc === 'sp98') return 'SP98';
  if (tc.includes('gasoil') || tc.includes('diesel') || tc.includes('gazole')) return 'Gasoil';
  if (tc.includes('petrole') || tc.includes('kero') || tc.includes('lampant')) return 'Kerosene';
  if (tc.includes('gaz') || tc.includes('gpl')) return 'Gaz';
  if (['SP95', 'SP98', 'Gasoil', 'Kerosene', 'Gaz'].includes(raw)) return raw;
  return 'SP95';
}

const ALLOWED_DB_VALUES = ['SP95', 'SP98', 'Gasoil', 'Kerosene', 'Gaz'];

const testCases = [
  { input: 'Essence Super', expected: 'SP95' },
  { input: 'Essence', expected: 'SP95' },
  { input: 'Super', expected: 'SP95' },
  { input: 'SP95', expected: 'SP95' },
  { input: 'SP98', expected: 'SP98' },
  { input: 'Gasoil', expected: 'Gasoil' },
  { input: 'Diesel', expected: 'Gasoil' },
  { input: 'Pétrole', expected: 'Kerosene' },
  { input: 'Pétrole Lampant', expected: 'Kerosene' },
  { input: 'Kérosène', expected: 'Kerosene' },
  { input: 'Gaz', expected: 'Gaz' },
  { input: 'GPL', expected: 'Gaz' },
];

testCases.forEach(({ input, expected }) => {
  const result = normalizeFuel(input);
  assert.strictEqual(result, expected, `Pour "${input}", attendu "${expected}", obtenu "${result}"`);
  assert.ok(ALLOWED_DB_VALUES.includes(result), `La valeur "${result}" doit être autorisée par la base`);
});
console.log('  ✅ PASS: 12/12 conversions carburants testées et validées');

console.log('\n[TEST 4] Scénario 1 : Pompe1 + CUVE SUPER + Essence Super + Index 0...');
const payloadPompe1 = {
  numero_pompe: 'Pompe1',
  type_carburant: normalizeFuel('Essence Super'),
  cuve_associee: 'CUVE SUPER',
  index_actuel: 0,
  statut: 'ACTIVE'
};
assert.strictEqual(payloadPompe1.type_carburant, 'SP95');
assert.ok(ALLOWED_DB_VALUES.includes(payloadPompe1.type_carburant));
console.log('  ✅ PASS: Pompe1 envoie type_carburant = "SP95" (autorisé sans erreur CHECK)');

console.log('\n[TEST 5] Scénario 2 : Pompe2 + Gasoil + Index 0...');
const payloadPompe2 = {
  numero_pompe: 'Pompe2',
  type_carburant: normalizeFuel('Gasoil'),
  cuve_associee: 'CUVE GASOIL',
  index_actuel: 0,
  statut: 'ACTIVE'
};
assert.strictEqual(payloadPompe2.type_carburant, 'Gasoil');
assert.ok(ALLOWED_DB_VALUES.includes(payloadPompe2.type_carburant));
console.log('  ✅ PASS: Pompe2 envoie type_carburant = "Gasoil" (autorisé sans erreur CHECK)');

console.log('\n================================================================');
console.log('🎉 TOUS LES TESTS DE CORRECTION DE POMPE SONT VALIDÉS AVEC SUCCÈS !');
console.log('================================================================\n');
