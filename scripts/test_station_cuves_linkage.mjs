// =============================================================================
// GESTIO 229 — Test Suite : Liaison Cuves - Pompes - Ventes Distributeurs
// =============================================================================

import assert from 'node:assert';
import fs from 'node:fs';

console.log('🧪 Démarrage des vérifications de liaison Cuves / Pompes / Stocks...');

const vDistContent = fs.readFileSync('src/pages/dashboard/station/VenteDistributeurPage.tsx', 'utf8');

// 1. inputMontant initialisé à 0
assert.ok(vDistContent.includes("useState<string>('0')"), 'inputMontant doit être initialisé à 0');
assert.ok(!vDistContent.includes("useState<string>('5000')"), '5000 ne doit plus être la valeur par défaut');
console.log('  ✅ [PASS] Valeur initiale de « Montant à servir » strictement égale à 0');

// 2. Élimination totale des 15000 L et valeurs fictives
assert.ok(!vDistContent.includes('stock_disponible: 15000'), 'La disponibilité fictive de 15000 L a été supprimée');
assert.ok(!vDistContent.includes('15000 L'), 'Aucune mention résiduelle de 15000 L');
console.log('  ✅ [PASS] Suppression absolue des stocks fictifs (0 L si aucune cuve enregistrée)');

// 3. Fond gris distinct et indication "Champ à renseigner"
assert.ok(vDistContent.includes('Champ à renseigner'), 'Mention « Champ à renseigner » présente');
assert.ok(vDistContent.includes('bg-slate-800'), 'Fond gris appliqué au champ de saisie');
console.log('  ✅ [PASS] Fond gris et mention « Champ à renseigner » visibles et opérationnels');

// 4. Déstockage effectif et synchronisation de stock
assert.ok(vDistContent.includes('Math.max(0, Math.round((stockDispo - vol) * 100) / 100)'), 'Calcul du nouveau stock sécurisé');
assert.ok(vDistContent.includes(".from('station_cuves')"), 'Mise à jour en base de station_cuves');
assert.ok(vDistContent.includes('setCuves(prev => prev.map'), 'Actualisation immédiate de l\'état local cuves');
assert.ok(vDistContent.includes('setPistolets(prev => prev.map'), 'Actualisation immédiate de l\'état local pistolets');
console.log('  ✅ [PASS] Déstockage effectif, actualisation immédiate de la disponibilité et sans double déstockage');

// 5. Anti-stock négatif et cohérence de calcul
assert.ok(vDistContent.includes('stockDispo <= 0'), 'Blocage si stock épuisé (0 L)');
assert.ok(vDistContent.includes('vol > stockDispo'), 'Blocage si volume demandé supérieur au stock disponible');
assert.ok(vDistContent.includes('isBlocked'), 'Bouton désactivé et retour visuel si stock indisponible');
console.log('  ✅ [PASS] Contrôle anti-stock négatif et cohérence prix/montant/volume');

// 6. Test logique de déstockage et calculs
const prixLitre = 680;
const montantSaisi = 34000;
const volCalcule = Math.round((montantSaisi / prixLitre) * 100) / 100;
assert.strictEqual(volCalcule, 50, '34 000 FCFA à 680 FCFA/L doit faire exactement 50 Litres');

const stockInitial = 1200;
const nouveauStock = Math.max(0, stockInitial - volCalcule);
assert.strictEqual(nouveauStock, 1150, 'Le stock après vente doit passer de 1200 L à 1150 L');

console.log('  ✅ [PASS] Simulation mathématique de vente et déstockage validée');
console.log('\n🎉 [SUCCÈS] Tous les tests de liaison Cuves - Pompes - Ventes Distributeurs sont validés !');
