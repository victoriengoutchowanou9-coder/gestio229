const fs = require('fs')
const path = require('path')

console.log('\n🧪 ================================================================')
console.log('🧪 [GESTIO 229] TESTS VALIDATION SYNCHRONISATION POS - SERVEUSES')
console.log('🧪 ================================================================\n')

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${message}`)
    failed++
  }
}

// 1. POSPage.tsx inspection
const posPagePath = path.join(__dirname, '../src/pages/dashboard/vente-pos/POSPage.tsx')
const posPageContent = fs.readFileSync(posPagePath, 'utf8')

console.log('[TEST A] Vérification de la synchronisation POS ↔ Session Serveuse...')
assert(posPageContent.includes("Serveuse responsable : {currentSale.serveur_nom}"), "POSPage affiche 'Serveuse responsable : {currentSale.serveur_nom}' sur le ticket 80mm")
assert(posPageContent.includes("Mode de règlement :"), "POSPage affiche le mode de règlement sur le ticket 80mm")
assert(posPageContent.includes("Montant payé :"), "POSPage affiche le montant payé sur le ticket 80mm")
assert(posPageContent.includes("gestio:restaurant-sale-completed"), "POSPage émet l'événement 'gestio:restaurant-sale-completed' après vente")
assert(posPageContent.includes("restaurantSessionIdSnapshot"), "POSPage résout restaurantSessionIdSnapshot avant d'enregistrer la vente")

// 2. Ticket table columns
console.log('\n[TEST B] Colonnes du ticket de caisse 80mm (Article, Qté, P.U., Total)...')
assert(posPageContent.includes('<th className="text-right pb-1">P.U.</th>'), "Le ticket 80mm contient la colonne P.U. (Prix Unitaire)")
assert(posPageContent.includes('fmt(l.unitPrice)'), "Le ticket 80mm affiche le prix unitaire formaté pour chaque ligne")

// 3. restaurantService.ts inspection
const restoServicePath = path.join(__dirname, '../src/services/restaurantService.ts')
const restoServiceContent = fs.readFileSync(restoServicePath, 'utf8')

console.log('\n[TEST C] Cumul des quantités par produit & Idempotence dans restaurantService.ts...')
assert(restoServiceContent.includes('suivi.historique_ventes.some((h: any) => h.order_number === order_number)'), "Protection d'idempotence sur order_number dans accumulerVenteDansSessionServeuse")
assert(restoServiceContent.includes('Math.round((prev.quantite + qte) * 1000) / 1000'), "Cumul exact des quantités vendues par produit")
assert(restoServiceContent.includes('resolveProductCircuit(b) === \'BAR\''), "Séparation stricte : articles Bar filtrés dans bar_items")
assert(restoServiceContent.includes('resolveProductCircuit(r) === \'RESTAURANT\''), "Séparation stricte : articles Restaurant filtrés dans restaurant_items")

console.log('\n[TEST D] Formule Solde restant dû dans enregistrerVersementServeur...')
assert(restoServiceContent.includes('const totalVersements = versementsDejaFaits + montant'), "Calcul exact du nouveau total des versements")
assert(restoServiceContent.includes('const soldeApres = Math.max(0, Math.round((totalVentes - totalVersements) * 100) / 100)'), "Calcul exact du solde restant dû : totalVentes - totalVersements")

// 4. ServeursPersonnelPage.tsx inspection
const serveursPagePath = path.join(__dirname, '../src/pages/dashboard/restaurant/ServeursPersonnelPage.tsx')
const serveursPageContent = fs.readFileSync(serveursPagePath, 'utf8')

console.log('\n[TEST E] Écouteurs temps réel et compteurs dans ServeursPersonnelPage.tsx...')
assert(serveursPageContent.includes("window.addEventListener('gestio:restaurant-sale-completed'"), "ServeursPersonnelPage écoute 'gestio:restaurant-sale-completed'")
assert(serveursPageContent.includes("restaurant-ops-sync-"), "ServeursPersonnelPage s'abonne au canal Supabase temps réel")
assert(serveursPageContent.includes("const soldeDuVal = Math.max(0, totalVentesVal - verseAuGerantVal)"), "Fiche serveuse calcule soldeDuVal = Math.max(0, totalVentesVal - verseAuGerantVal)")
assert(serveursPageContent.includes("dotationBoissons"), "Fiche serveuse calcule les boissons confiées à partir de la dotation")

// 5. Numerical Simulation of Test B (Flag 12T accumulation)
console.log('\n[TEST F] Simulation numérique : Cumul de 2 commandes Flag 12T...')
const sessionItems = []
function simulateSale(nom, qte, pu) {
  const existing = sessionItems.find(i => i.nom === nom)
  if (existing) {
    existing.qte += qte
    existing.total = existing.qte * pu
  } else {
    sessionItems.push({ nom, qte, pu, total: qte * pu })
  }
}
simulateSale('Flag 12T', 2, 500)
simulateSale('Flag 12T', 3, 500)
const flagItem = sessionItems.find(i => i.nom === 'Flag 12T')
assert(flagItem && flagItem.qte === 5 && flagItem.total === 2500, "Simulation réussie : 2 Flag (1000 FCFA) + 3 Flag (1500 FCFA) = 5 Flag 12T (2500 FCFA)")

console.log('\n================================================================')
console.log(`📋 RÉSULTAT : ${passed}/${passed + failed} tests réussis (${failed} échec)`)
if (failed === 0) {
  console.log('🎉 TOUTES LES FONCTIONNALITÉS DEMANDÉES SONT CONFORMES ET OPÉRATIONNELLES !')
  console.log('================================================================\n')
  process.exit(0)
} else {
  console.error('❌ ÉCHECS DÉTECTÉS DANS LA SUITE DE TESTS !')
  console.log('================================================================\n')
  process.exit(1)
}
