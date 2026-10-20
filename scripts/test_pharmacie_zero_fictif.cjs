/**
 * ==============================================================================
 * SUITE DE TESTS AUTOMATISÉS : PHARMACIE & DÉPÔT MÉDICAL SANS VALEUR FICTIVE
 * ==============================================================================
 */

const fs = require('fs')
const path = require('path')
const esbuild = require('esbuild')

// Mock de localStorage en environnement Node
const storage = new Map()
global.window = {
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
    get length() {
      return storage.size
    },
    key: (idx) => Array.from(storage.keys())[idx] || null,
  },
}
global.localStorage = global.window.localStorage

// Transpilation TypeScript avec esbuild
const serviceCode = fs.readFileSync(path.join(__dirname, '../src/services/pharmacieService.ts'), 'utf8')
const transpiled = esbuild.transformSync(serviceCode, {
  loader: 'ts',
  format: 'cjs',
  target: 'node18',
}).code

const moduleExports = {}
const customRequire = (mod) => {
  if (mod.includes('supabase')) {
    return { supabase: {} }
  }
  if (mod.includes('caisseSectorService')) {
    return { enregistrerMouvementCaisse: async () => {} }
  }
  return require(mod)
}

const moduleFunc = new Function('exports', 'require', 'module', '__filename', '__dirname', 'window', 'localStorage', transpiled)
const dummyModule = { exports: moduleExports }
moduleFunc(moduleExports, customRequire, dummyModule, 'pharmacieService.js', __dirname, global.window, global.localStorage)

const pharmacieService = moduleExports.pharmacieService || dummyModule.exports.pharmacieService
const sanitizeCompanyStorage = moduleExports.sanitizeCompanyStorage || dummyModule.exports.sanitizeCompanyStorage

let testsPassed = 0
let testsFailed = 0

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ SUCCÈS: ${testName}`)
    testsPassed++
  } else {
    console.error(`  ❌ ÉCHEC: ${testName}`)
    testsFailed++
  }
}

async function runTests() {
  console.log('=============================================================================')
  console.log('TESTS DE CONFORMITÉ : SECTEUR PHARMACIE & DÉPÔT MÉDICAL (ZÉRO FICTIF)')
  console.log('=============================================================================\n')

  const companyA = 'comp-pharma-officine-alpha'
  const companyB = 'comp-pharma-depot-beta'

  // TEST 1 : Compte vierge n'a aucun produit fictif
  console.log('--- TEST 1 : Absence totale de produits fictifs par défaut ---')
  const prodsA = await pharmacieService.getProduits(companyA)
  assert(Array.isArray(prodsA) && prodsA.length === 0, 'Le compte vierge ne reçoit AUCUN produit par défaut')
  assert(
    !prodsA.some((p) => p.nom_commercial?.includes('Paracétamol') || p.nom_commercial?.includes('Amoxicilline')),
    'Aucun faux médicament (Paracétamol, Amoxicilline, Coartem, Lantus) injecté'
  )

  // TEST 2 : Compte vierge n'a aucun lot fictif ni faux stock
  console.log('\n--- TEST 2 : Absence totale de lots ou stocks fictifs ---')
  const lotsA = await pharmacieService.getLots(companyA)
  assert(Array.isArray(lotsA) && lotsA.length === 0, 'Le compte vierge ne reçoit AUCUN lot par défaut')
  assert(!lotsA.some((l) => l.numero_lot === 'BG-2024-901'), 'Aucun numéro de lot fictif (BG-2024-901...) présent')

  // TEST 3 : Compte vierge n'a aucune ordonnance fictive
  console.log('\n--- TEST 3 : Absence totale d\'ordonnances de démo ---')
  const ordsA = await pharmacieService.getOrdonnances(companyA)
  assert(Array.isArray(ordsA) && ordsA.length === 0, 'Le compte vierge ne reçoit AUCUNE ordonnance par défaut')
  assert(
    !ordsA.some((o) => o.prescripteur_nom?.includes('KOFFI') || o.patient_nom?.includes('AÏVOHO')),
    'Aucune ordonnance de démonstration (Dr. Mensah KOFFI / Mme AÏVOHO) présente'
  )

  // TEST 4 : Compte vierge n'a aucun fournisseur ou commande de démo
  console.log('\n--- TEST 4 : Absence de fournisseurs et commandes fictifs ---')
  const grossA = await pharmacieService.getGrossistes(companyA)
  const cmdsA = await pharmacieService.getCommandes(companyA)
  assert(Array.isArray(grossA) && grossA.length === 0, 'Le compte vierge ne reçoit AUCUN fournisseur grossiste fictif')
  assert(Array.isArray(cmdsA) && cmdsA.length === 0, 'Le compte vierge ne reçoit AUCUNE commande fictive')

  // TEST 5 : Tableau de bord et métriques à zéro
  console.log('\n--- TEST 5 : Tableau de bord et métriques vierges à 0 ---')
  const metricsA = await pharmacieService.getDashboardMetrics(companyA)
  assert(metricsA.caAujourdhui === 0, 'CA du jour est exactement 0 FCFA')
  assert(metricsA.valeurStockAchat === 0, 'Valeur du stock est exactement 0 FCFA')
  assert(metricsA.totalReferences === 0, 'Total des références est exactement 0')
  assert(metricsA.totalLotsActifs === 0, 'Total des lots actifs est exactement 0')
  assert(metricsA.lotsExpiresCount === 0, 'Aucun faux lot expiré')
  assert(metricsA.ordonnancesEnAttenteCount === 0, 'Aucune fausse ordonnance en attente')

  // TEST 6 : Enregistrement de données réelles pour Company A
  console.log('\n--- TEST 6 : Enregistrement et intégrité des données réelles ---')
  const savedProd = await pharmacieService.saveProduit(companyA, {
    nom_commercial: 'Cétirizine 10mg Réel',
    dci: 'Cétirizine',
    prix_achat_ht: 500,
    prix_vente_ttc: 900,
  })
  assert(savedProd.id && savedProd.nom_commercial === 'Cétirizine 10mg Réel', 'Produit réel enregistré avec succès')

  const savedLot = await pharmacieService.saveLot(companyA, {
    produit_id: savedProd.id,
    produit_nom: savedProd.nom_commercial,
    numero_lot: 'LOT-REEL-2026',
    date_peremption: '2028-12-31',
    quantite_initiale: 50,
    quantite_actuelle: 50,
    prix_achat_unitaire: 500,
  })
  assert(savedLot.id && savedLot.quantite_actuelle === 50, 'Lot réel enregistré avec quantité exacte (50)')

  const savedGrossiste = await pharmacieService.saveGrossiste(companyA, {
    nom: 'Grossiste Partenaire Officiel',
    code: 'GROSS-REEL',
    telephone: '+229 21 00 00 00',
  })
  assert(savedGrossiste.id && savedGrossiste.code === 'GROSS-REEL', 'Fournisseur réel enregistré avec succès')

  // TEST 7 : Isolation stricte entre entreprises (Company B ne voit RIEN de Company A)
  console.log('\n--- TEST 7 : Isolation étanche absolue entre entreprises ---')
  const prodsB = await pharmacieService.getProduits(companyB)
  const lotsB = await pharmacieService.getLots(companyB)
  const grossB = await pharmacieService.getGrossistes(companyB)
  assert(prodsB.length === 0, 'Company B ne voit AUCUN produit de Company A (étanchéité totale)')
  assert(lotsB.length === 0, 'Company B ne voit AUCUN lot de Company A (étanchéité totale)')
  assert(grossB.length === 0, 'Company B ne voit AUCUN fournisseur de Company A (étanchéité totale)')

  // TEST 8 : Purge automatique des résidus de démo (Auto-Sanitization)
  console.log('\n--- TEST 8 : Purge et assainissement automatique des anciens caches ---')
  const oldCompany = 'comp-pharma-avec-residus'
  storage.set(
    `gestio229_pharmacie_${oldCompany}_produits`,
    JSON.stringify([
      { id: 'prod-para-1000-dummy', code_cip_acl: '3400936081234', nom_commercial: 'Paracétamol Biogaran' },
      { id: 'prod-reel-12345', code_cip_acl: '9999999999999', nom_commercial: 'Vitamines C Réelles' },
    ])
  )
  storage.set(
    `gestio229_pharmacie_${oldCompany}_lots`,
    JSON.stringify([
      { id: 'lot-para-1-dummy', numero_lot: 'BG-2024-901', produit_nom: 'Paracétamol Biogaran' },
      { id: 'lot-reel-999', numero_lot: 'LOT-REEL-AUTHENTIQUE', produit_nom: 'Vitamines C Réelles' },
    ])
  )
  storage.set(
    `gestio229_pharmacie_demo-company-pharma_produits`,
    JSON.stringify([{ id: 'demo-p', nom_commercial: 'Faux produit démo' }])
  )

  const sanitizedProds = await pharmacieService.getProduits(oldCompany)
  const sanitizedLots = await pharmacieService.getLots(oldCompany)

  assert(sanitizedProds.length === 1 && sanitizedProds[0].id === 'prod-reel-12345', 'Faux produit démo purgé et produit réel préservé')
  assert(sanitizedLots.length === 1 && sanitizedLots[0].id === 'lot-reel-999', 'Faux lot démo purgé et lot réel préservé')
  assert(!storage.has('gestio229_pharmacie_demo-company-pharma_produits'), 'Toute clé rattachée à demo-company-pharma est définitivement supprimée')

  // TEST 9 : Rejet strict des identifiants invalides ou démo
  console.log('\n--- TEST 9 : Rejet strict des identifiants invalides ou démo ---')
  const emptyRes = await pharmacieService.getProduits('demo-company-pharma')
  assert(emptyRes.length === 0, 'L\'identifiant demo-company-pharma renvoie strictement un tableau vide')

  console.log('\n=============================================================================')
  console.log(`RÉSULTAT FINAL DES TESTS : ${testsPassed} SUCCÈS, ${testsFailed} ÉCHECS`)
  console.log('=============================================================================')

  if (testsFailed > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Erreur non capturée dans les tests:', err)
  process.exit(1)
})
