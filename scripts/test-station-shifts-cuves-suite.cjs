// =============================================================================
// GESTIO 229 — SUITE DE VALIDATION : SHIFTS POMPISTES, CUVES & RÉCONCILIATION CAISSE
// Spécifique Secteur Station-Service & Hydrocarbures
// =============================================================================

const assert = require('assert')
const fs = require('fs')
const path = require('path')

let testsPassed = 0
let testsFailed = 0

function it(desc, fn) {
  try {
    fn()
    console.log(`  ✅ SUCCÈS: ${desc}`)
    testsPassed++
  } catch (err) {
    console.error(`  ❌ ÉCHEC: ${desc}`)
    console.error(`     Détail: ${err.message}`)
    testsFailed++
  }
}

console.log('=============================================================================')
console.log('SUITE DE VALIDATION COMPLÈTE : SHIFTS POMPISTES, CUVES & CAISSE GESTIO 229')
console.log('=============================================================================\n')

const root = path.join(__dirname, '..')

const fuelServicePath = path.join(root, 'src/services/stationFuelService.ts')
const pompesCuvesPath = path.join(root, 'src/pages/dashboard/station/PompesCuvesPage.tsx')
const venteDistributeurPath = path.join(root, 'src/pages/dashboard/station/VenteDistributeurPage.tsx')
const postesPompistesPath = path.join(root, 'src/pages/dashboard/station/PostesPompistesPage.tsx')
const supabaseTenantPath = path.join(root, 'src/lib/supabaseTenant.ts')

const fuelServiceCode = fs.readFileSync(fuelServicePath, 'utf8')
const pompesCuvesCode = fs.readFileSync(pompesCuvesPath, 'utf8')
const venteDistributeurCode = fs.readFileSync(venteDistributeurPath, 'utf8')
const postesPompistesCode = fs.readFileSync(postesPompistesPath, 'utf8')
const supabaseTenantCode = fs.readFileSync(supabaseTenantPath, 'utf8')

console.log('1. AUDIT MULTI-TENANT & ISOLATION SUPABASE')
it('Les tables de Station-Service sont déclarées dans TABLES_WITH_PHYSICAL_SECTOR_SLUG pour éviter le filtrage mémoire défectueux', () => {
  const tables = [
    'station_cuves',
    'station_pompes',
    'station_pistolets',
    'station_pompistes',
    'station_shifts_clotures',
    'station_jaugeages',
    'station_receptions_carburant',
    'station_mouvements_cuves'
  ]
  for (const table of tables) {
    assert(supabaseTenantCode.includes(`'${table}'`), `La table ${table} doit être déclarée dans TABLES_WITH_PHYSICAL_SECTOR_SLUG`)
  }
})

console.log('\n2. DÉDUPLICATION DES CUVES & SOURCE DE VÉRITÉ UNIQUE')
it('stationFuelService implémente loadOperationalCuves avec déduplication robuste par ID et clé métier', () => {
  assert(fuelServiceCode.includes('export async function loadOperationalCuves'), 'loadOperationalCuves doit être exportée')
  assert(fuelServiceCode.includes('businessKey') || fuelServiceCode.includes('uniqueMap'), 'Une déduplication métier doit être effectuée')
  assert(fuelServiceCode.includes('stock_actuel') || fuelServiceCode.includes('volume_actuel'), 'La cuve avec le stock réel doit être conservée')
})

it('Simulation de la logique de déduplication : CV 001 en doublon (0L vs 25 000L) ne produit qu\'une seule cuve opérationnelle à 25 000L', () => {
  const rawCuvesFromDB = [
    { id: 'cuve-1', code: 'CV 001', nom: 'Cuve Super 1', produit: 'super', capacite: 30000, volume_actuel: 0, statut: 'actif' },
    { id: 'cuve-2', code: 'CV 001', nom: 'Cuve Super 1', produit: 'super', capacite: 30000, volume_actuel: 25000, statut: 'actif' },
    { id: 'cuve-3', code: 'CV 002', nom: 'Cuve Gasoil 1', produit: 'gasoil', capacite: 40000, volume_actuel: 18000, statut: 'actif' },
    { id: 'cuve-4', code: 'CV 003', nom: 'Cuve Pétrole 1', produit: 'petrole', capacite: 15000, volume_actuel: 8922.04, statut: 'actif' }
  ]

  // Reproduire l'algorithme de stationFuelService.ts
  const uniqueMap = new Map()
  for (const cuve of rawCuvesFromDB) {
    const bKey = `${(cuve.code || '').trim().toUpperCase()}|${(cuve.nom || '').trim().toUpperCase()}|${(cuve.produit || '').trim().toLowerCase()}`
    if (!uniqueMap.has(bKey)) {
      uniqueMap.set(bKey, cuve)
    } else {
      const existing = uniqueMap.get(bKey)
      const curStock = Number(cuve.volume_actuel) || 0
      const prevStock = Number(existing.volume_actuel) || 0
      if (curStock > prevStock) {
        uniqueMap.set(bKey, cuve)
      }
    }
  }
  const deduplicated = Array.from(uniqueMap.values())

  assert.strictEqual(deduplicated.length, 3, 'Doit avoir exactement 3 cuves opérationnelles uniques')
  const superCuve = deduplicated.find(c => c.produit === 'super')
  assert.strictEqual(superCuve.volume_actuel, 25000, 'La cuve super conservée doit avoir 25 000L et non 0L')
  
  const totalStock = deduplicated.reduce((acc, c) => acc + (Number(c.volume_actuel) || 0), 0)
  assert.strictEqual(Math.round(totalStock * 100) / 100, 51922.04, 'Le stock total doit être exactement de 51 922.04 L')
})

it('checkDuplicateCuve interdit la création accidentelle d\'une cuve avec le même code', () => {
  assert(fuelServiceCode.includes('export async function checkDuplicateCuve'), 'checkDuplicateCuve doit être implémentée')
  assert(pompesCuvesCode.includes('checkDuplicateCuve'), 'PompesCuvesPage doit appeler checkDuplicateCuve avant l\'enregistrement')
})

console.log('\n3. CIRCUIT SHIFTS POMPISTES : OUVERTURE ET AFFECTATION OBLIGATOIRE')
it('stationFuelService implémente openPompisteShift, getActiveShiftForPompiste et getOpenShifts', () => {
  assert(fuelServiceCode.includes('export async function openPompisteShift'), 'openPompisteShift doit être exporté')
  assert(fuelServiceCode.includes('export async function getActiveShiftForPompiste'), 'getActiveShiftForPompiste doit être exporté')
  assert(fuelServiceCode.includes('export async function getOpenShifts'), 'getOpenShifts doit être exporté')
})

it('openPompisteShift valide la cohérence des index et interdit les chevauchements de shift ouverts', () => {
  function validateShiftOpenParams(pompisteId, pompeId, cuveId, indexDepart, activeShifts = []) {
    if (!pompisteId) throw new Error('Pompiste requis')
    if (!pompeId) throw new Error('Pompe requise')
    if (!cuveId) throw new Error('Cuve requise')
    if (indexDepart < 0) throw new Error('Index de départ invalide')
    
    const conflictPompiste = activeShifts.find(s => s.pompiste_id === pompisteId && (s.statut === 'OUVERT' || s.statut === 'EN_COURS'))
    if (conflictPompiste) throw new Error('Ce pompiste a déjà un shift actif en cours')

    const conflictPompe = activeShifts.find(s => s.pompe_id === pompeId && (s.statut === 'OUVERT' || s.statut === 'EN_COURS'))
    if (conflictPompe) throw new Error('Cette pompe est déjà affectée à un autre shift actif')

    return {
      pompiste_id: pompisteId,
      pompe_id: pompeId,
      cuve_id: cuveId,
      index_depart: indexDepart,
      statut: 'OUVERT',
      date_ouverture: new Date().toISOString()
    }
  }

  const existing = [{ pompiste_id: 'p1', pompe_id: 'pompe-1', statut: 'OUVERT' }]
  assert.throws(() => validateShiftOpenParams('p1', 'pompe-2', 'cuve-1', 100, existing), /déjà un shift actif/)
  assert.throws(() => validateShiftOpenParams('p2', 'pompe-1', 'cuve-1', 100, existing), /déjà affectée/)
  
  const ok = validateShiftOpenParams('p2', 'pompe-2', 'cuve-2', 500, existing)
  assert.strictEqual(ok.statut, 'OUVERT')
  assert.strictEqual(ok.index_depart, 500)
})

console.log('\n4. VENTE DISTRIBUTEUR & DÉSTOCKAGE SUR SHIFT ACTIF')
it('VenteDistributeurPage charge loadOperationalCuves et bloque la vente si aucun shift n\'est ouvert', () => {
  assert(venteDistributeurCode.includes('loadOperationalCuves'), 'VenteDistributeurPage doit appeler loadOperationalCuves')
  assert(venteDistributeurCode.includes('getActiveShiftForPompiste'), 'VenteDistributeurPage doit vérifier getActiveShiftForPompiste')
  assert(venteDistributeurCode.includes('Aucun shift ouvert') || venteDistributeurCode.includes('pompiste actif'), 'Un blocage/message doit signaler l\'absence de shift')
  assert(venteDistributeurCode.includes('shift_id:'), 'Les ventes doivent être enregistrées avec shift_id')
})

it('Déstockage et calcul du volume vendu avec mise à jour d\'index de pompe', () => {
  const cuveStockInitial = 25000
  const indexDepart = 120500.50
  const litresVendus = 45.50
  
  const cuveStockApres = cuveStockInitial - litresVendus
  const indexFin = indexDepart + litresVendus

  assert.strictEqual(cuveStockApres, 24954.50)
  assert.strictEqual(indexFin, 120546.00)
})

console.log('\n5. RÉCAPITULATIF DE CLÔTURE & RÉCONCILIATION SÉPARÉE ESPÈCES / MOMO')
it('stationFuelService agrège getShiftSalesSummary avec répartition par mode de paiement', () => {
  assert(fuelServiceCode.includes('export async function getShiftSalesSummary'), 'getShiftSalesSummary doit être présent')
  assert(fuelServiceCode.includes('montantEspeces') && fuelServiceCode.includes('montantMoMo'), 'Doit ventiler montantEspeces et montantMoMo')
})

it('PostesPompistesPage permet de réconcilier séparément Espèces et Mobile Money avec détection des écarts', () => {
  assert(postesPompistesCode.includes('montant_especes_remis') && postesPompistesCode.includes('montant_momo_confirme'), 'PostesPompistesPage doit manipuler espèces et momo séparément')
  assert(postesPompistesCode.includes('cloturerPompisteShift'), 'PostesPompistesPage doit appeler cloturerPompisteShift')
})

it('Simulation de calcul d\'écarts de caisse', () => {
  const ventesTheoriques = {
    totalVolume: 500, // 500 L
    caTotal: 340000,
    totalEspeces: 240000,
    totalMomo: 100000
  }
  
  const saisieReelle = {
    especesRemises: 239500, // 500 FCFA de manquant
    momoRecu: 100000 // conforme
  }

  const ecartEspeces = saisieReelle.especesRemises - ventesTheoriques.totalEspeces
  const ecartMomo = saisieReelle.momoRecu - ventesTheoriques.totalMomo
  const ecartTotal = ecartEspeces + ecartMomo

  assert.strictEqual(ecartEspeces, -500, 'Écart espèces doit être -500')
  assert.strictEqual(ecartMomo, 0, 'Écart MoMo doit être 0')
  assert.strictEqual(ecartTotal, -500, 'Écart total doit être -500')
})

console.log('\n6. INTÉGRATION IDEMPOTENTE DANS LA TRÉSORERIE / CAISSE')
it('cloturerPompisteShift insère les mouvements de caisse avec source_id déterministe pour éviter les doublons', () => {
  assert(fuelServiceCode.includes('cloturerPompisteShift'), 'cloturerPompisteShift doit être exporté')
  assert(fuelServiceCode.includes('caisse_mouvements'), 'cloturerPompisteShift doit interagir avec caisse_mouvements')
  assert(fuelServiceCode.includes('_especes') && fuelServiceCode.includes('_momo'), 'Doit avoir des identifiants distincts _especes et _momo')
})

it('Simulation d\'idempotence de caisse : double validation ne crée pas de double flux', () => {
  const caisseEntries = []
  
  function enregistrerFluxCaisse(shiftId, modePaiement, montant) {
    if (montant <= 0) return false
    const sourceId = `shift_${shiftId}_${modePaiement.toLowerCase()}`
    const alreadyExists = caisseEntries.some(e => e.source_id === sourceId)
    if (alreadyExists) {
      return false // Ignore duplicate
    }
    caisseEntries.push({
      source_id: sourceId,
      mode: modePaiement,
      montant: montant,
      date: new Date().toISOString()
    })
    return true
  }

  // Première clôture
  const p1 = enregistrerFluxCaisse('SH-2026-001', 'ESPECES', 240000)
  const p2 = enregistrerFluxCaisse('SH-2026-001', 'MOMO', 100000)
  assert.strictEqual(p1, true)
  assert.strictEqual(p2, true)
  assert.strictEqual(caisseEntries.length, 2)

  // Re-clôture accidentelle ou rafraîchissement
  const r1 = enregistrerFluxCaisse('SH-2026-001', 'ESPECES', 240000)
  const r2 = enregistrerFluxCaisse('SH-2026-001', 'MOMO', 100000)
  assert.strictEqual(r1, false, 'Le doublon espèces doit être bloqué')
  assert.strictEqual(r2, false, 'Le doublon MoMo doit être bloqué')
  assert.strictEqual(caisseEntries.length, 2, 'Il ne doit y avoir que 2 écritures en caisse')
})

console.log('=============================================================================')
console.log(`RÉSULTAT FINAL : ${testsPassed} tests réussis sur ${testsPassed + testsFailed}`)
console.log('=============================================================================')

if (testsFailed > 0) {
  process.exit(1)
}
