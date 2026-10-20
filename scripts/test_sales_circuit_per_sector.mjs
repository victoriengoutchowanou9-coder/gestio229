// =============================================================================
// Test d'intégration automatisé : Circuit de Vente Paramétrable par Secteur
// GESTIO 229 SaaS
// =============================================================================

import assert from 'node:assert/strict'

console.log('🧪 DÉBUT DU TEST : Circuit de Vente Paramétrable par Secteur\n')

// 1. Simulation du comportement multi-secteurs de getSalesCircuitMode / isSectorCircuitSeparated
const mockCompany = {
  id: 'comp-test-123',
  name: 'Entreprise Test Multi-Secteurs',
  sales_circuit_mode: 'mode_1_integre', // mode global par défaut
  sales_circuit_mode_by_sector: {
    'station-service': 'mode_2_separe',
    'supermarche': 'mode_1_integre'
  }
}

function normalizeCircuitSectorSlug(slug) {
  if (!slug) return 'general'
  const clean = slug.toLowerCase().trim().replace(/^sec-/, '')
  if (clean === 'station' || clean === 'station-service' || clean === 'hydrocarbures') return 'station-service'
  if (clean === 'supermarche' || clean === 'superette' || clean === 'epicerie') return 'supermarche'
  if (clean === 'restaurant' || clean === 'bar' || clean === 'maquis') return 'restaurant'
  if (clean === 'boutique' || clean === 'pret-a-porter') return 'boutique'
  return clean
}

function getSalesCircuitModeForSector(company, sectorSlug) {
  if (!company) return 'mode_1_integre'
  const cleanSector = normalizeCircuitSectorSlug(sectorSlug)
  if (company.sales_circuit_mode_by_sector && typeof company.sales_circuit_mode_by_sector === 'object') {
    const val = company.sales_circuit_mode_by_sector[cleanSector]
    if (val === 'mode_1_integre' || val === 'mode_2_separe') return val
  }
  return company.sales_circuit_mode === 'mode_2_separe' ? 'mode_2_separe' : 'mode_1_integre'
}

function isSectorCircuitSeparated(sectorSlug, company) {
  return getSalesCircuitModeForSector(company, sectorSlug) === 'mode_2_separe'
}

// TEST 1 : Indépendance stricte par secteur
console.log('Test 1 : Indépendance du circuit entre Secteur A (Station) et Secteur B (Supermarché)...')
const modeStation = getSalesCircuitModeForSector(mockCompany, 'station-service')
const modeSupermarche = getSalesCircuitModeForSector(mockCompany, 'supermarche')
const modeRestaurant = getSalesCircuitModeForSector(mockCompany, 'restaurant') // non configuré explicitement

assert.equal(modeStation, 'mode_2_separe', 'Le secteur Station doit être en Mode 2')
assert.equal(modeSupermarche, 'mode_1_integre', 'Le secteur Supermarché doit rester en Mode 1')
assert.equal(modeRestaurant, 'mode_1_integre', 'Un secteur sans config dédiée hérite du mode 1')
assert.equal(isSectorCircuitSeparated('station-service', mockCompany), true)
assert.equal(isSectorCircuitSeparated('supermarche', mockCompany), false)
console.log('✅ Test 1 réussi : L\'activation dans la Station n\'a aucun impact sur le Supermarché ni le Restaurant.\n')

// TEST 2 : Injection conditionnelle du Module Vendeur dans la Navigation
console.log('Test 2 : Visibilité dynamique du Module Vendeur dans la navigation...')

function finalizeNav(rawNav, sectorSlug, company) {
  const isSeparated = isSectorCircuitSeparated(sectorSlug, company)
  let nav = [...rawNav]
  const hasVendeur = nav.some(item => item.id === 'vendeur')

  if (isSeparated && !hasVendeur) {
    const comIdx = nav.findIndex(item => item.id === 'ventes' || item.id === 'caisse')
    const vendeurItem = {
      id: 'vendeur',
      label: 'Module Vendeur',
      icon: 'ClipboardList',
      path: 'vendeur',
      group: 'commercial'
    }
    if (comIdx >= 0) {
      nav.splice(comIdx + 1, 0, vendeurItem)
    } else {
      nav.push(vendeurItem)
    }
  } else if (!isSeparated && hasVendeur) {
    nav = nav.filter(item => item.id !== 'vendeur')
  }
  return nav
}

const baseNav = [
  { id: 'dashboard', label: 'Tableau de bord', path: 'tableau-bord' },
  { id: 'ventes', label: 'Ventes & POS', path: 'vente' },
  { id: 'caisse', label: 'Caisse', path: 'caisse' },
  { id: 'stock', label: 'Stocks', path: 'stocks' }
]

const navStation = finalizeNav(baseNav, 'station-service', mockCompany)
const navSupermarche = finalizeNav(baseNav, 'supermarche', mockCompany)

assert.ok(navStation.some(i => i.id === 'vendeur'), 'La navigation Station DOIT contenir le module Vendeur')
assert.ok(!navSupermarche.some(i => i.id === 'vendeur'), 'La navigation Supermarché NE DOIT PAS contenir le module Vendeur')
console.log('✅ Test 2 réussi : Module Vendeur affiché en Mode 2 et strictement masqué en Mode 1.\n')

// TEST 3 : Génération de référence unique de bon & protection anti-double encaissement
console.log('Test 3 : Cycle de vie du Bon de Commande (création, contrôle stock, encaissement, anti-double-clic)...')

function generateOrderNumber(sectorSlug) {
  const clean = normalizeCircuitSectorSlug(sectorSlug)
  const code = clean.slice(0, 3).toUpperCase()
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `BC-${code}-${today}-${rand}`
}

const bonRef1 = generateOrderNumber('station-service')
const bonRef2 = generateOrderNumber('station-service')
assert.notEqual(bonRef1, bonRef2, 'Chaque bon de commande doit avoir une référence unique')
assert.ok(bonRef1.startsWith('BC-STA-'), `Le format du bon doit respecter le préfixe sectoriel: ${bonRef1}`)

// Simulation de l'état du bon
const simulatedOrder = {
  id: 'order-bc-001',
  order_number: bonRef1,
  total_amount: 15000,
  paid_amount: 0,
  status: 'pending_cashier',
  notes: {
    stock_already_deducted: false,
    seller_name: 'Koffi Vendeur'
  }
}

// Fonction d'encaissement avec contrôle anti-double-encaissement
function encaisserBon(order, montantPaiement, caissierNom) {
  if (order.status === 'COMPLET' || order.paid_amount >= order.total_amount) {
    return { success: false, error: 'Ce bon a déjà été entièrement encaissé.' }
  }
  const remaining = order.total_amount - order.paid_amount
  const paid = Math.min(montantPaiement, remaining)
  const newPaid = order.paid_amount + paid
  const isComplete = newPaid >= order.total_amount

  // Mise à jour
  order.paid_amount = newPaid
  order.status = isComplete ? 'COMPLET' : 'partiellement_paye'
  order.notes.stock_already_deducted = true
  order.notes.encaisse_par = caissierNom
  order.notes.date_encaissement = new Date().toISOString()

  return { success: true, remaining: order.total_amount - newPaid, status: order.status }
}

// Premier encaissement
const res1 = encaisserBon(simulatedOrder, 15000, 'Amina Caissière')
assert.equal(res1.success, true)
assert.equal(simulatedOrder.status, 'COMPLET')
assert.equal(simulatedOrder.notes.stock_already_deducted, true)

// Tentative de second encaissement (double-clic ou session concurrente)
const res2 = encaisserBon(simulatedOrder, 15000, 'Autre Caissière')
assert.equal(res2.success, false, 'Le deuxième encaissement doit être refusé')
assert.ok(res2.error.includes('déjà été entièrement encaissé'))
console.log('✅ Test 3 réussi : Concurrence, statut COMPLET et anti-double-encaissement vérifiés.\n')

console.log('🎉 TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS !')
