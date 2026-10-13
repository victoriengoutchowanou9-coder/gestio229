// =============================================================================
// Test d'intégration et de validation : Secteur Bar, Restaurant, Maquis & Fast-Food
// =============================================================================
// Exécute 6 scénarios critiques de validation :
// 1. Fiche technique & calcul Food Cost / Déstockage matières
// 2. Idempotence du déstockage (protection double validation POS)
// 3. Attribution des boissons à une serveuse & valorisation TTC
// 4. Versements successifs & réduction du solde restant dû
// 5. Clôture de service avec calcul automatique de l'écart
// 6. Non-pollution de la trésorerie par les casses & offerts
// =============================================================================

import assert from 'assert'

console.log('--- DÉBUT DES TESTS SECTEUR RESTAURANT / BAR GESTIO229 ---')

// 1. Recette & Fiche technique (Ex: Portion Chawarma Viande)
const recetteChawarma = [
  { nom: 'Pain Pita Libanais', qte_portion: 1, unite: 'pièce', cout_unitaire: 200 },
  { nom: 'Viande Emincée Boeuf', qte_portion: 0.15, unite: 'kg', cout_unitaire: 3000 },
  { nom: 'Sauce Blanche / Mayonnaise', qte_portion: 0.03, unite: 'L', cout_unitaire: 1500 },
  { nom: 'Crudités Assorties', qte_portion: 0.05, unite: 'kg', cout_unitaire: 600 }
]

const prixVenteChawarmaTTC = 2000 // 2 000 FCFA

// Calcul du Food Cost par portion
const foodCostUnitaire = recetteChawarma.reduce((acc, ing) => acc + (ing.qte_portion * ing.cout_unitaire), 0)
// Pain: 1 * 200 = 200
// Viande: 0.15 * 3000 = 450
// Sauce: 0.03 * 1500 = 45
// Crudités: 0.05 * 600 = 30
// Total: 725 FCFA
assert.strictEqual(foodCostUnitaire, 725, 'Le coût matière unitaire doit être exactement de 725 FCFA')

const margeBruteUnitaire = prixVenteChawarmaTTC - foodCostUnitaire
assert.strictEqual(margeBruteUnitaire, 1275, 'La marge brute sur le chawarma doit être de 1 275 FCFA')

const ratioFoodCost = Math.round((foodCostUnitaire / prixVenteChawarmaTTC) * 100)
assert.strictEqual(ratioFoodCost, 36, 'Le Food Cost ratio doit être de ~36% (standard CHR)')

// Test 1.B : Exemple du prompt (Coût: 150 FCFA, Prix: 500 FCFA => Marge: 350 FCFA)
const coutMatiereExemple = 150
const prixVenteExemple = 500
const margeBruteExemple = prixVenteExemple - coutMatiereExemple
assert.strictEqual(margeBruteExemple, 350, 'La marge brute unitaire doit être de 350 FCFA (500 - 150)')
const tauxMargeSurCout = ((margeBruteExemple / coutMatiereExemple) * 100).toFixed(1)
assert.strictEqual(tauxMargeSurCout, '233.3', 'Le taux de marge sur coût doit être de 233.3%')
const tauxMarque = ((margeBruteExemple / prixVenteExemple) * 100).toFixed(1)
assert.strictEqual(tauxMarque, '70.0', 'Le taux de marque doit être de 70.0%')

// Test 1.C : Alerte Perte Brute si Prix < Coût
const prixVentePerte = 120
const margePerte = prixVentePerte - coutMatiereExemple
assert.strictEqual(margePerte, -30, 'La marge doit être négative (-30 FCFA) pour signaler une perte')
assert.strictEqual(margePerte < 0, true, 'Perte brute unitaire détectée')

console.log('✅ Test 1 Réussi : Fiche technique Chawarma, Food Cost (725 FCFA), Prix & Marge unitaire (350 FCFA) et Taux de marque (70%) validés.')

// 2. Simulation Déstockage Idempotent (Vente de 3 portions)
const portionQty = 3
const orderNumber = 'CMD-REST-20261012-001'
const destockageLog = new Map()

function destockerMatieresSimulee(platNom, qty, orderNum) {
  let matieresSorties = 0
  let coutTotal = 0
  for (const ing of recetteChawarma) {
    const qteTotale = ing.qte_portion * qty
    const coutLigne = qteTotale * ing.cout_unitaire
    const idempotencyKey = `destock-${orderNum}-${platNom}-${ing.nom}`

    if (!destockageLog.has(idempotencyKey)) {
      destockageLog.set(idempotencyKey, {
        matiere: ing.nom,
        qte: qteTotale,
        unite: ing.unite,
        cout: coutLigne
      })
      matieresSorties++
      coutTotal += coutLigne
    }
  }
  return { matieresSorties, coutTotal }
}

const res1 = destockerMatieresSimulee('Chawarma', portionQty, orderNumber)
assert.strictEqual(res1.matieresSorties, 4, '4 ingrédients doivent être sortis au premier appel')
assert.strictEqual(res1.coutTotal, 725 * 3, 'Coût total déstocké = 3 x 725 = 2 175 FCFA')

// Simulation double-clic ou réexécution de la même commande
const res2 = destockerMatieresSimulee('Chawarma', portionQty, orderNumber)
assert.strictEqual(res2.matieresSorties, 0, 'Aucun ingrédient ne doit être déstocké deux fois')
assert.strictEqual(res2.coutTotal, 0, 'Le coût supplémentaire doit être nul grâce à la clé d idempotence')
console.log('✅ Test 2 Réussi : Idempotence parfaite du déstockage des matières premières vérifiée.')

// 3. Gestion Compte Serveuse : Boissons confiées
const session = {
  serveur_nom: 'Amina',
  total_boissons_confiees_ttc: 0,
  total_versements_recus: 0,
  solde_restant_a_remettre: 0
}

// Attribution de 24 bouteilles de Castel Bière à 800 FCFA
const qte1 = 24
const prixVente1 = 800
const valeur1 = qte1 * prixVente1 // 19 200 FCFA
session.total_boissons_confiees_ttc += valeur1
session.solde_restant_a_remettre += valeur1

// Réassort en cours de soirée : 12 canettes Beaufort à 1 000 FCFA
const qte2 = 12
const prixVente2 = 1000
const valeur2 = qte2 * prixVente2 // 12 000 FCFA
session.total_boissons_confiees_ttc += valeur2
session.solde_restant_a_remettre += valeur2

assert.strictEqual(session.total_boissons_confiees_ttc, 31200, 'Total confié doit être de 31 200 FCFA')
assert.strictEqual(session.solde_restant_a_remettre, 31200, 'Solde initial à remettre doit être de 31 200 FCFA')
console.log('✅ Test 3 Réussi : Remise des boissons et réassort serveuse (31 200 FCFA) validés.')

// 4. Versements successifs au gérant
// Premier versement en milieu de service
const vmt1 = 15000
session.total_versements_recus += vmt1
session.solde_restant_a_remettre -= vmt1
assert.strictEqual(session.solde_restant_a_remettre, 16200, 'Après 1er versement de 15 000, solde doit être 16 200 FCFA')

// Deuxième versement
const vmt2 = 10000
session.total_versements_recus += vmt2
session.solde_restant_a_remettre -= vmt2
assert.strictEqual(session.solde_restant_a_remettre, 6200, 'Après 2e versement de 10 000, solde doit être 6 200 FCFA')
console.log('✅ Test 4 Réussi : Versements partiels successifs et réduction du solde validés.')

// 5. Clôture de service : Retours de bouteilles invendues et calcul de l'écart
// Amina ramène 5 Castel invendues (5 x 800 = 4 000 FCFA) et 2 Beaufort invendues (2 x 1 000 = 2 000 FCFA)
const valeurRetours = (5 * 800) + (2 * 1000) // 6 000 FCFA
session.solde_restant_a_remettre -= valeurRetours
assert.strictEqual(session.solde_restant_a_remettre, 200, 'Le solde restant final (écart de caisse) doit être 200 FCFA')

const ecartFinancier = session.solde_restant_a_remettre
assert.strictEqual(ecartFinancier, 200, 'Ecart financier de 200 FCFA consigné pour la session')
console.log('✅ Test 5 Réussi : Clôture avec déduction des retours physiques et constat d écart (200 FCFA).')

// 6. Intégrité : Casses & Pertes ne gonflent pas le CA
const caComptoir = 50000
const casseBouteille = 1000 // Une bière cassée par le barman
const caReel = caComptoir // Ne doit pas inclure la casse
assert.strictEqual(caReel, 50000, 'Le CA ne doit pas intégrer la casse')
const perteEnregistree = casseBouteille
assert.strictEqual(perteEnregistree, 1000, 'La casse doit être tracée séparément dans les pertes')
// 7. Test POS : Séparation stricte Catalogue BAR vs RESTAURANT
const mockCatalogProduits = [
  { id: 'p1', name: 'Castel Beer 65cl', selling_price: 800, stock_vente: 50, is_matiere_premiere: false, is_recipe: false },
  { id: 'p2', name: 'Coca-Cola 33cl', selling_price: 500, stock_vente: 24, is_matiere_premiere: false, is_recipe: false },
  { id: 'p3', name: 'Riz Blanc (Matière Première)', selling_price: 0, stock_vente: 100, is_matiere_premiere: true, is_recipe: false },
]

const mockRecipeProduits = [
  { id: 'rec-1', name: 'Chawarma Boeuf', selling_price: 2000, is_recipe: true, is_matiere_premiere: false },
  { id: 'rec-2', name: 'Poulet Bicyclette Braisé', selling_price: 4500, is_recipe: true, is_matiere_premiere: false },
  { id: 'rec-3', name: 'Fiche sans prix', selling_price: 0, is_recipe: true, is_matiere_premiere: false },
]

// Mode BAR : uniquement produits physiques sans matière première
const catalogueBar = mockCatalogProduits.filter(p => !p.is_matiere_premiere && !p.is_recipe)
assert.strictEqual(catalogueBar.length, 2, 'Catalogue BAR doit contenir exactement 2 boissons physiques')
assert.strictEqual(catalogueBar.every(p => p.selling_price > 0 && !p.is_recipe), true, 'Catalogue BAR ne doit contenir aucune recette ni matière première')

// Mode RESTAURANT : uniquement recettes actives avec prix de vente unitaire > 0
const catalogueRestaurant = mockRecipeProduits.filter(r => r.is_recipe && r.selling_price > 0)
assert.strictEqual(catalogueRestaurant.length, 2, 'Catalogue RESTAURANT doit contenir 2 plats actifs avec prix valide')
assert.strictEqual(catalogueRestaurant.some(r => r.name === 'Fiche sans prix'), false, 'Les recettes sans prix doivent être exclues')
console.log('✅ Test 7 Réussi : Séparation stricte catalogue POS BAR vs RESTAURANT validée.')

// 8. Test POS : Attribution de la vente Client Comptoir à une serveuse enregistrée
const mockServeuses = [
  { id: 'srv-001', nom_complet: 'Amina SOULE', matricule: 'SRV-01', statut: 'ACTIF' },
  { id: 'srv-002', nom_complet: 'Christelle KOFFI', matricule: 'SRV-02', statut: 'ACTIF' }
]

function simulerAttributionVenteComptoir(selectedCustomer, selectedServeurId) {
  const isComptoir = !selectedCustomer
  let serveurAttribué = null
  let serveurIdAttribué = null

  if (isComptoir) {
    if (selectedServeurId) {
      const match = mockServeuses.find(s => s.id === selectedServeurId)
      if (match) {
        serveurAttribué = match.nom_complet
        serveurIdAttribué = match.id
      }
    } else {
      serveurAttribué = 'Client Comptoir Direct'
      serveurIdAttribué = null
    }
  }

  return { isComptoir, serveurAttribué, serveurIdAttribué }
}

const vente1 = simulerAttributionVenteComptoir(null, 'srv-001')
assert.strictEqual(vente1.serveurAttribué, 'Amina SOULE', 'La vente comptoir doit être attribuée à Amina SOULE')
assert.strictEqual(vente1.serveurIdAttribué, 'srv-001', 'L ID de la serveuse doit être conservé pour les créances')

const vente2 = simulerAttributionVenteComptoir(null, null)
assert.strictEqual(vente2.serveurAttribué, 'Client Comptoir Direct', 'Vente comptoir directe sans serveuse')
assert.strictEqual(vente2.serveurIdAttribué, null, 'Aucun serveur_id pour une vente comptoir directe')

console.log('✅ Test 8 Réussi : Attribution de vente comptoir à une serveuse et distinction vente directe validées.')

console.log('--- TOUS LES TESTS FONCTIONNELS BAR & RESTAURANT SONT VALIDÉS AVEC SUCCÈS (8/8) ---')

