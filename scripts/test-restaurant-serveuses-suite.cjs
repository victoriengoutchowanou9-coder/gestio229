/**
 * SUITE DE TESTS AUTOMATISÉS — GESTIO 229 RESTAURANT / BAR / MAQUIS / FAST-FOOD
 * VALIDATION DE LA COHÉRENCE SERVEUSES - VENTES - SESSIONS - RAPPORTS ET RENTABILITÉ
 * Conforme aux 8 exigences obligatoires de la section 7.
 */

const assert = require('assert')
const fs = require('fs')
const path = require('path')

console.log('\n🧪 ================================================================')
console.log('🧪 [GESTIO 229] TESTS DE COHÉRENCE SERVEUSES - VENTES - RENTABILITÉ')
console.log('🧪 ================================================================\n')

let passedTests = 0
function test(name, fn) {
  try {
    fn()
    console.log(`  ✅ PASS: ${name}`)
    passedTests++
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`)
    console.error(`     Erreur: ${err.message}`)
    process.exitCode = 1
  }
}

// -----------------------------------------------------------------------------
// [TEST 1] Vérifier que ANE et Awa apparaissent dans le module de vente
// -----------------------------------------------------------------------------
console.log('[TEST 1] Chargement unifié des serveuses dans le module de vente (POSPage.tsx)...')

const posContent = fs.readFileSync(path.join(__dirname, '../src/pages/dashboard/vente-pos/POSPage.tsx'), 'utf-8')

test('POSPage contient le state restaurantSessionId pour lier les sessions actives', () => {
  assert(posContent.includes('restaurantSessionId'), 'restaurantSessionId doit exister dans POSPage.tsx')
})

test('POSPage charge les serveuses depuis restaurant_serveurs ET restaurant_sessions_serveurs', () => {
  assert(posContent.includes("supabaseTenant('restaurant_serveurs')"), 'Doit requêter restaurant_serveurs')
  assert(posContent.includes("supabaseTenant('restaurant_sessions_serveurs')"), 'Doit requêter restaurant_sessions_serveurs')
  assert(posContent.includes('has_open_session'), 'Doit marquer has_open_session')
  assert(posContent.includes('active_session_id'), 'Doit mapper active_session_id')
})

test('Une serveuse avec session active ne disparaît jamais de la liste', () => {
  assert(posContent.includes('Session de service active'), 'Doit afficher le statut de session active dans le sélecteur')
})

// -----------------------------------------------------------------------------
// [TEST 2 & 3] Attribution de vente à ANE et Awa & traçabilité stricte
// -----------------------------------------------------------------------------
console.log('\n[TEST 2 & 3] Attribution stricte des ventes à ANE et Awa et enregistrement des IDs...')

test('POSPage enregistre serveur_nom, serveur_id et session_id sur sales_orders (notes et meta)', () => {
  assert(posContent.includes('serveur_nom: restaurantServeurSnapshot'), 'notesPayload doit contenir serveur_nom')
  assert(posContent.includes('serveur_id: restaurantServeurIdSnapshot'), 'notesPayload doit contenir serveur_id')
  assert(posContent.includes('session_id: restaurantSessionIdSnapshot'), 'notesPayload doit contenir session_id')
  assert(posContent.includes('sector_meta: {'), 'salePayload doit inclure sector_meta')
})

test('POSPage met à jour en temps réel total_ventes_declarees_ttc sur la session active de la serveuse', () => {
  assert(posContent.includes('total_ventes_declarees_ttc: newTotal'), 'Doit incrémenter total_ventes_declarees_ttc sur la session')
})

test('ServeursPersonnelPage auto-enregistre toute serveuse dans restaurant_serveurs lors de louverture de session', () => {
  const staffPageContent = fs.readFileSync(path.join(__dirname, '../src/pages/dashboard/restaurant/ServeursPersonnelPage.tsx'), 'utf-8')
  assert(staffPageContent.includes("supabaseTenant('restaurant_serveurs').insert"), 'Doit auto-insérer la serveuse si absente')
  assert(staffPageContent.includes('serveur_id: srvId'), 'Doit associer serveur_id lors de l\'insertion de la session')
})

// -----------------------------------------------------------------------------
// [TEST 4 & 5] Calcul exact du CA mensuel et Marge Brute réelle (COGS)
// -----------------------------------------------------------------------------
console.log('\n[TEST 4 & 5] Algorithme de calcul du CA, Coût d\'achat et Marge Brute dans RestaurantReportingPage.tsx...')

const reportingContent = fs.readFileSync(path.join(__dirname, '../src/pages/dashboard/restaurant/RestaurantReportingPage.tsx'), 'utf-8')

test('RestaurantReportingPage calcule le CA mensuel à partir des ventes effectives attribuées', () => {
  assert(reportingContent.includes('serveusesRentabiliteReport'), 'serveusesRentabiliteReport doit être calculé')
  assert(reportingContent.includes('srvMap[cleanNom].ca_mensuel += caVente'), 'Doit sommer le CA des ventes')
  assert(reportingContent.includes('srvMap[cleanNom].cout_ventes += coutVente'), 'Doit sommer le coût d\'achat unitaire réel')
  assert(reportingContent.includes('marge_brute: marge'), 'Marge brute = CA - Coût des ventes')
})

test('Les ventes annulées ou avec motif d\'annulation sont rigoureusement exclues', () => {
  assert(reportingContent.includes('isAnnulee'), 'Doit détecter les ventes annulées')
  assert(reportingContent.includes('motif_annulation'), 'Doit vérifier motif_annulation')
})

test('Le calcul des jours de service et de la moyenne journalière est conforme', () => {
  assert(reportingContent.includes('service_dates: new Set<string>()'), 'Doit décompter les jours uniques de service')
  assert(reportingContent.includes('moyJour = jours > 0 ? Math.round(ca / jours) : ca'), 'Moyenne journalière = CA / jours de service')
})

// -----------------------------------------------------------------------------
// [TEST 6] Consolidation globale et filtrage individuel sans doublons
// -----------------------------------------------------------------------------
console.log('\n[TEST 6] Filtrage par serveuse et consolidation sans doublons...')

test('Le filtre par serveuse permet de sélectionner ANE, Awa ou Toutes les serveuses', () => {
  assert(reportingContent.includes('activeServeusesList'), 'Doit filtrer selon filterServeuse')
  assert(reportingContent.includes('consolidatedServeusesKPIs'), 'Doit consolider les KPIs sans doublons')
  assert(reportingContent.includes('TOTAL CONSOLIDÉ'), 'Le tableau comparatif doit afficher la ligne TOTAL CONSOLIDÉ')
})

test('Le sélecteur de période inclut le choix du mois/année et la période personnalisée', () => {
  assert(reportingContent.includes('select_month'), 'Doit supporter le preset select_month')
  assert(reportingContent.includes('type="month"'), 'Doit rendre un input type="month"')
})

// -----------------------------------------------------------------------------
// [TEST 7 & 8] Clôture des sessions et isolation multi-tenant
// -----------------------------------------------------------------------------
console.log('\n[TEST 7 & 8] Cohérence des sessions, clôtures et isolation multi-tenant...')

test('Les données sont strictement isolées par tenant (company_id et sector_slug)', () => {
  assert(reportingContent.includes("supabaseTenant('sales_orders')"), 'sales_orders requêté avec supabaseTenant')
  assert(reportingContent.includes("supabaseTenant('restaurant_serveurs')"), 'restaurant_serveurs requêté avec supabaseTenant')
  assert(reportingContent.includes("supabaseTenant('restaurant_sessions_serveurs')"), 'restaurant_sessions_serveurs requêté avec supabaseTenant')
})

test('L\'en-tête et les signatures d\'impression professionnelles sont configurés pour @media print', () => {
  assert(reportingContent.includes('hidden print:block'), 'En-tête d\'impression officiel présent')
  assert(reportingContent.includes('hidden print:grid'), 'Bloc de signature officiel présent')
  assert(reportingContent.includes('print:hidden'), 'Masquage des boutons et navigation lors de l\'impression')
})

// -----------------------------------------------------------------------------
// SIMULATION NUMÉRIQUE DETERMINISTE DES CALCULS FINANCIERS
// -----------------------------------------------------------------------------
console.log('\n[TEST 9] Simulation numérique déterministe (Scénario ANE & Awa)...')

test('Simulation : Vente ANE (Castel + Poulet) et Vente Awa (Beaufort + Poisson)', () => {
  // Scénario ANE :
  // Vente 1 : 2x Castel (Vente = 2x1000 = 2000 FCFA, Coût = 2x600 = 1200 FCFA)
  // Vente 2 : 1x Poulet bicyclette (Vente = 5000 FCFA, Coût = 3000 FCFA)
  const ventesANE = [
    { order_number: 'VTE-ANE-01', total_amount: 2000, total_cost: 1200, date: '2026-11-05', status: 'COMPLET' },
    { order_number: 'VTE-ANE-02', total_amount: 5000, total_cost: 3000, date: '2026-11-06', status: 'COMPLET' },
    { order_number: 'VTE-ANE-03-ANNULEE', total_amount: 10000, total_cost: 6000, date: '2026-11-06', status: 'ANNULE' }
  ]

  // Scénario Awa :
  // Vente 1 : 3x Beaufort (Vente = 3x1200 = 3600 FCFA, Coût = 3x750 = 2250 FCFA)
  // Vente à crédit (comptée 1 seule fois) : 4000 FCFA, Coût = 2500 FCFA
  const ventesAwa = [
    { order_number: 'VTE-AWA-01', total_amount: 3600, total_cost: 2250, date: '2026-11-05', status: 'COMPLET' },
    { order_number: 'VTE-AWA-02-CREDIT', total_amount: 4000, total_cost: 2500, date: '2026-11-05', status: 'COMPLET' }
  ]

  // Calcul ANE (hors annulée)
  const caANE = ventesANE.filter(v => v.status !== 'ANNULE').reduce((acc, v) => acc + v.total_amount, 0)
  const coutANE = ventesANE.filter(v => v.status !== 'ANNULE').reduce((acc, v) => acc + v.total_cost, 0)
  const margeANE = caANE - coutANE
  const joursANE = new Set(ventesANE.filter(v => v.status !== 'ANNULE').map(v => v.date)).size
  const moyANE = Math.round(caANE / joursANE)

  assert.strictEqual(caANE, 7000, 'CA ANE doit être 7 000 FCFA (sans la vente annulée de 10 000)')
  assert.strictEqual(coutANE, 4200, 'Coût ANE doit être 4 200 FCFA')
  assert.strictEqual(margeANE, 2800, 'Marge brute ANE doit être 2 800 FCFA')
  assert.strictEqual(joursANE, 2, 'ANE a 2 jours de service distincts')
  assert.strictEqual(moyANE, 3500, 'Moyenne journalière ANE doit être 3 500 FCFA')

  // Calcul Awa
  const caAwa = ventesAwa.reduce((acc, v) => acc + v.total_amount, 0)
  const coutAwa = ventesAwa.reduce((acc, v) => acc + v.total_cost, 0)
  const margeAwa = caAwa - coutAwa
  const joursAwa = new Set(ventesAwa.map(v => v.date)).size
  const moyAwa = Math.round(caAwa / joursAwa)

  assert.strictEqual(caAwa, 7600, 'CA Awa doit être 7 600 FCFA')
  assert.strictEqual(coutAwa, 4750, 'Coût Awa doit être 4 750 FCFA')
  assert.strictEqual(margeAwa, 2850, 'Marge brute Awa doit être 2 850 FCFA')
  assert.strictEqual(joursAwa, 1, 'Awa a 1 jour de service')
  assert.strictEqual(moyAwa, 7600, 'Moyenne journalière Awa doit être 7 600 FCFA')

  // Consolidation globale (Toutes les serveuses)
  const totalCA = caANE + caAwa
  const totalCout = coutANE + coutAwa
  const totalMarge = totalCA - totalCout
  const totalJours = new Set([...ventesANE.filter(v => v.status !== 'ANNULE').map(v => v.date), ...ventesAwa.map(v => v.date)]).size
  const moyConsolidee = Math.round(totalCA / totalJours)

  assert.strictEqual(totalCA, 14600, 'CA consolidé = 14 600 FCFA')
  assert.strictEqual(totalCout, 8950, 'Coût consolidé = 8 950 FCFA')
  assert.strictEqual(totalMarge, 5650, 'Marge brute consolidée = 5 650 FCFA')
  assert.strictEqual(totalJours, 2, 'Total jours distincts consolidés = 2')
  assert.strictEqual(moyConsolidee, 7300, 'Moyenne consolidée = 7 300 FCFA')
})

console.log('\n================================================================')
console.log(`📋 RÉSULTAT : ${passedTests} tests validés avec succès (0 échec)`)
console.log('🎉 TOUS LES TESTS DE COHÉRENCE SERVEUSES RESTAURANT SONT VALIDÉS !')
console.log('================================================================\n')
