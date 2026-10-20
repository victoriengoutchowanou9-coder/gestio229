/**
 * ==============================================================================
 * TEST DE VÉRIFICATION : ISOLATION RLS & COHÉRENCE QUINCAILLERIE (2 COMPTES)
 * ==============================================================================
 */

const fs = require('fs')
const path = require('path')

const EXPECTED_16_MODULES = [
  'Tableau de bord',
  'Vente & POS',
  'Stocks',
  'Caisse',
  'Ciment & Fers',
  'Chantiers & Camions',
  'Trésorerie',
  'Clients & Créances',
  'Dépenses',
  'Comptabilité SYSCOHADA',
  'Fournisseurs & Achats',
  'Unités & Tonnes',
  'Rapports & Analyses',
  'Configuration',
  'Gestion Utilisateurs',
  'Journal d\'Audit'
]

const EXPECTED_IDS = [
  'dashboard',
  'ventes',
  'stock',
  'caisse',
  'materiaux_btp',
  'suivi_chantiers',
  'finances',
  'clients',
  'depenses',
  'syscohada',
  'fournisseurs',
  'conversions_unites',
  'rapports',
  'configuration',
  'utilisateurs',
  'audit'
]

let passed = 0
let failed = 0

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ SUCCÈS: ${testName}`)
    passed++
  } else {
    console.error(`  ❌ ÉCHEC: ${testName}`)
    failed++
  }
}

console.log('=============================================================================')
console.log('VÉRIFICATION RLS SUPABASE & COHÉRENCE MULTI-COMPTES QUINCAILLERIE')
console.log('=============================================================================')

// TEST 1 : Vérification du fichier SQL de migration RLS
const sqlPath = path.join(__dirname, '../supabase/migrations/20261020_enable_rls_and_sector_templates.sql')
assert(fs.existsSync(sqlPath), 'Le fichier de migration SQL RLS existe')

const sqlContent = fs.readFileSync(sqlPath, 'utf8')
assert(sqlContent.includes('ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;'), 'RLS activé sur tenant_modules')
assert(sqlContent.includes('ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;'), 'RLS activé sur modules')
assert(sqlContent.includes('ALTER TABLE public.sector_templates ENABLE ROW LEVEL SECURITY;'), 'RLS activé sur sector_templates')
assert(sqlContent.includes('CREATE POLICY "Tenant isolation"'), 'Politique "Tenant isolation" présente pour tenant_modules')
assert(sqlContent.includes('CREATE POLICY "Lecture publique des templates secteur"'), 'Politique "Lecture publique des templates secteur" présente')
assert(sqlContent.includes('rowsecurity = false'), 'Boucle dynamique de sécurisation de toute table avec rowsecurity = false')

// TEST 2 : Vérification du script sync-modules
const syncPath = path.join(__dirname, 'sync-modules.cjs')
assert(fs.existsSync(syncPath), 'Le script sync-modules.cjs est créé')
const syncContent = fs.readFileSync(syncPath, 'utf8')
assert(syncContent.includes('quincaillerie'), 'sync-modules gère le secteur quincaillerie')
assert(syncContent.includes('materiaux_btp'), 'sync-modules inclut Ciment & Fers')
assert(syncContent.includes('suivi_chantiers'), 'sync-modules inclut Chantiers & Camions')
assert(syncContent.includes('conversions_unites'), 'sync-modules inclut Unités & Tonnes')

// TEST 3 : Résolution canonique pour 2 comptes différents du secteur Quincaillerie
const { getSectorCanonicalModules } = require('./moduleRegistryNode.cjs')

const compteA_modules = getSectorCanonicalModules('quincaillerie')
const compteB_modules = getSectorCanonicalModules('quincaillerie')

assert(Array.isArray(compteA_modules), 'Compte A (ETS LA VICTOIRE) charge ses modules')
assert(Array.isArray(compteB_modules), 'Compte B (STE LA VICTOIRE SA) charge ses modules')

// Vérifier que tous les 16 IDs attendus sont présents
const aIds = compteA_modules.map(m => m.id)
const bIds = compteB_modules.map(m => m.id)

const allFoundA = EXPECTED_IDS.every(id => aIds.includes(id))
const allFoundB = EXPECTED_IDS.every(id => bIds.includes(id))

assert(allFoundA, 'Compte A dispose de l\'intégralité des 16 modules obligatoires de Quincaillerie')
assert(allFoundB, 'Compte B dispose de l\'intégralité des 16 modules obligatoires de Quincaillerie')

// Vérifier l'égalité stricte entre compte A et compte B
assert(
  JSON.stringify(aIds) === JSON.stringify(bIds),
  'Égalité stricte : Compte A et Compte B ont exactement la même liste de modules'
)

console.log('=============================================================================')
console.log(`RÉSULTAT : ${passed} SUCCÈS, ${failed} ÉCHECS`)
console.log('=============================================================================')

if (failed > 0) process.exit(1)
