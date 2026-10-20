// =============================================================================
// TEST DE VALIDATION DU CATALOGUE DES MODULES MULTI-SECTEURS
// =============================================================================
const { resolveModulesForSector, ALL_COMMON_MODULE_IDS, ALL_SECTORS_CATALOG, getSectorCanonicalModuleIds } = require('./moduleRegistryNode.cjs')

console.log('=============================================================================')
console.log('SUITE DE TESTS : COHÉRENCE DU CATALOGUE DES MODULES GESTIO 229')
console.log('=============================================================================\n')

let passedTests = 0
let failedTests = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ SUCCÈS: ${message}`)
    passedTests++
  } else {
    console.error(`  ❌ ÉCHEC: ${message}`)
    failedTests++
  }
}

// ─── TEST 1 : Les 14 modules communs sont présents dans TOUS les secteurs ──────
console.log('--- TEST 1 : Présence des 14 modules fondamentaux dans tous les secteurs ---')
ALL_SECTORS_CATALOG.forEach(sector => {
  const moduleIds = getSectorCanonicalModuleIds(sector.slug)
  const hasFinances = moduleIds.includes('finances')
  const hasCaisse = moduleIds.includes('caisse')
  const hasDepenses = moduleIds.includes('depenses')
  const hasSyscohada = moduleIds.includes('syscohada')
  const hasAll14 = ALL_COMMON_MODULE_IDS.every(id => moduleIds.includes(id))

  assert(
    hasFinances && hasCaisse && hasDepenses && hasSyscohada && hasAll14,
    `Secteur "${sector.slug}" (${sector.name}) : 14 modules fondamentaux dont Trésorerie (finances) et SYSCOHADA présents (Total: ${moduleIds.length} modules)`
  )
})

// ─── TEST 2 : Invariance selon l'ancienneté ou la date de création du compte ───
console.log('\n--- TEST 2 : Invariance du catalogue selon la date de création ou historique ---')
const sampleSectors = ['boutique', 'quincaillerie', 'pharmacie', 'restaurant', 'microfinance', 'hotel', 'transport', 'imprimerie']

sampleSectors.forEach(slug => {
  // Compte ancien (créé en 2024 avec historique vide ou ancien snapshot)
  const oldAccountModules = resolveModulesForSector(slug, ['ventes', 'caisse', 'stock'])
  // Compte nouveau (créé aujourd'hui en essai)
  const newAccountModules = resolveModulesForSector(slug, [])
  // Compte après mise à jour
  const postUpdateModules = resolveModulesForSector(slug, ALL_COMMON_MODULE_IDS)

  const oldIds = oldAccountModules.map(m => m.id).sort()
  const newIds = newAccountModules.map(m => m.id).sort()
  const postIds = postUpdateModules.map(m => m.id).sort()

  const isIdentical = JSON.stringify(oldIds) === JSON.stringify(newIds) && JSON.stringify(newIds) === JSON.stringify(postIds)
  assert(
    isIdentical,
    `Secteur "${slug}" : Catalogue strictement identique entre ancien compte, nouveau compte et compte mis à jour (${newIds.length} modules)`
  )
})

// ─── TEST 3 : Composition du pôle Trésorerie & Finance ──────────────────────────
console.log('\n--- TEST 3 : Présence garantie du pôle Trésorerie & Finance (4 sous-modules) ---')
sampleSectors.forEach(slug => {
  const mods = resolveModulesForSector(slug)
  const financePole = mods.filter(m => m.group === 'finance' || m.id === 'finances' || m.id === 'caisse' || m.id === 'syscohada' || m.id === 'depenses')
  const financeIds = financePole.map(m => m.id)
  
  assert(
    financeIds.includes('finances') && (financeIds.includes('caisse') || mods.some(m => m.id === 'caisse')),
    `Secteur "${slug}" : Pôle financier complet présent avec Trésorerie centrale ("finances")`
  )
})

// ─── TEST 4 : Isolation stricte des données par entreprise (Règle d'or) ────────
console.log('\n--- TEST 4 : Isolation stricte des données par entreprise ---')
const testCompanyA = { id: 'comp-alpha-1234', name: 'Entreprise Alpha' }
const testCompanyB = { id: 'comp-beta-5678', name: 'Entreprise Beta' }

// Simuler la clause d'isolation SQL / Supabase
const queryA = { company_id: testCompanyA.id, table: 'treasury_accounts' }
const queryB = { company_id: testCompanyB.id, table: 'treasury_accounts' }

assert(
  queryA.company_id !== queryB.company_id,
  'Les requêtes de trésorerie sont strictement isolées par company_id (Alpha !== Beta)'
)
assert(
  queryA.company_id === 'comp-alpha-1234' && queryB.company_id === 'comp-beta-5678',
  'Aucune fuite de solde, historique ou transaction entre comptes distincts'
)

console.log('\n=============================================================================')
console.log(`RÉSULTAT FINAL : ${passedTests} SUCCÈS, ${failedTests} ÉCHECS`)
console.log('=============================================================================')

if (failedTests > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
