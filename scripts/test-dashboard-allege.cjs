/**
 * Test de non-régression et de validation : Allègement du tableau de bord sectoriel
 * 
 * Vérifie :
 * 1. Absence de la carte "Marge Brute Silo" dans l'affichage.
 * 2. Absence des 4 boutons/cartes de raccourcis dans le tableau de bord :
 *    - Vente & POS
 *    - Stocks & Dépôts
 *    - Caisse du Secteur
 *    - Clients & Créances
 * 3. Présence des 4 indicateurs conservés :
 *    - CA du Jour
 *    - Espèces du Jour
 *    - Créances Clients
 *    - Produits Actifs
 * 4. Configuration harmonieuse de la grille en 4 colonnes (lg:grid-cols-4).
 * 5. Maintien des éléments essentiels :
 *    - Synthèse factures d'avoir et régularisations
 *    - Transactions réelles de la journée
 *    - Boutons Retour au HUB et Actualiser
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- Test Allègement Tableau de Bord Sectoriel ---');

const dashboardPath = path.join(__dirname, '..', 'src', 'pages', 'dashboard', 'DashboardPage.tsx');
assert.ok(fs.existsSync(dashboardPath), 'DashboardPage.tsx doit exister');

const content = fs.readFileSync(dashboardPath, 'utf-8');

// 1. Vérification du retrait de "Marge Brute Silo"
assert.ok(
  !content.includes('Marge Brute Silo'),
  'La carte "Marge Brute Silo" ne doit plus être présente dans le JSX du tableau de bord'
);
console.log('✓ Carte "Marge Brute Silo" supprimée avec succès');

// 2. Vérification du retrait des 4 raccourcis opérationnels
assert.ok(
  !content.includes('Raccourcis Métiers Opérationnels'),
  'La section "Raccourcis Métiers Opérationnels" ne doit plus être présente'
);
assert.ok(
  !content.includes('Encaisser un client'),
  'Le sous-titre "Encaisser un client" ne doit plus être présent'
);
assert.ok(
  !content.includes('Inventaires & Réappro'),
  'Le sous-titre "Inventaires & Réappro" ne doit plus être présent'
);
assert.ok(
  !content.includes('Sessions & Clôtures'),
  'Le sous-titre "Sessions & Clôtures" ne doit plus être présent'
);
assert.ok(
  !content.includes('Suivi des recouvrements'),
  'Le sous-titre "Suivi des recouvrements" ne doit plus être présent'
);
console.log('✓ Les 4 boutons de raccourcis supprimés avec succès');

// 3. Vérification de la présence des 4 cartes KPI restantes
assert.ok(content.includes('CA du Jour'), 'La carte CA du Jour doit être conservée');
assert.ok(content.includes('Espèces du Jour'), 'La carte Espèces du Jour doit être conservée');
assert.ok(content.includes('Créances Clients'), 'La carte Créances Clients doit être conservée');
assert.ok(content.includes('Produits Actifs'), 'La carte Produits Actifs doit être conservée');
console.log('✓ Les 4 cartes KPI essentielles sont bien présentes');

// 4. Vérification de la grille à 4 colonnes
assert.ok(
  content.includes('lg:grid-cols-4'),
  'La grille des indicateurs doit être configurée en 4 colonnes (lg:grid-cols-4)'
);
console.log('✓ Grille responsive 4 colonnes (lg:grid-cols-4) configurée');

// 5. Vérification du maintien des synthèses et fonctionnalités
assert.ok(
  content.includes('Synthèse Factures d\'Avoir & Régularisations'),
  'Le bloc Synthèse des Factures d\'Avoir doit être conservé'
);
assert.ok(
  content.includes('Transactions Réelles de la Journée'),
  'Le tableau des Transactions Réelles de la Journée doit être conservé'
);
assert.ok(
  content.includes('Retour au HUB'),
  'Le bouton Retour au HUB doit être conservé'
);
assert.ok(
  content.includes('Actualiser'),
  'Le bouton Actualiser doit être conservé'
);
console.log('✓ Éléments essentiels (synthèses, transactions, boutons de navigation) conservés');

console.log('--- Tous les contrôles du tableau de bord sectoriel ont réussi avec succès ! ---');
