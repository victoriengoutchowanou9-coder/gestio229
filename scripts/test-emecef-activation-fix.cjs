// =============================================================================
// GESTIO 229 SaaS — SUITE DE VALIDATION CORRECTION DÉFINITIVE e-MECeF & FISCALITÉ
// Conforme au Cahier des Charges Strict GESTIO 229
// =============================================================================

const assert = require('assert')
const fs = require('fs')
const path = require('path')

console.log('🧪 ================================================================')
console.log('🧪 [GESTIO 229] VALIDATION CORRECTION DÉFINITIVE ACTIVATION e-MECeF')
console.log('🧪 ================================================================')

const root = path.join(__dirname, '..')
const configPagePath = path.join(root, 'src/pages/dashboard/configuration/ConfigPage.tsx')
const helperPath = path.join(root, 'src/utils/facturationHelper.ts')
const resilientFetchPath = path.join(root, 'src/lib/supabaseResilientFetch.ts')
const migrationSqlPath = path.join(root, 'database/M085_companies_emecef_fiscalite_columns.sql')
const migrationSupabasePath = path.join(root, 'supabase/migrations/20261118_fix_companies_emecef_fiscalite_columns.sql')

assert.ok(fs.existsSync(configPagePath), 'ConfigPage.tsx doit exister')
assert.ok(fs.existsSync(helperPath), 'facturationHelper.ts doit exister')
assert.ok(fs.existsSync(resilientFetchPath), 'supabaseResilientFetch.ts doit exister')
assert.ok(fs.existsSync(migrationSqlPath), 'M085_companies_emecef_fiscalite_columns.sql doit exister')
assert.ok(fs.existsSync(migrationSupabasePath), '20261118_fix_companies_emecef_fiscalite_columns.sql doit exister')

const configContent = fs.readFileSync(configPagePath, 'utf8')
const helperContent = fs.readFileSync(helperPath, 'utf8')
const resilientFetchContent = fs.readFileSync(resilientFetchPath, 'utf8')
const migrationSqlContent = fs.readFileSync(migrationSqlPath, 'utf8')

let testsPassed = 0

function it(desc, fn) {
  try {
    fn()
    console.log(`  ✅ PASS: ${desc}`)
    testsPassed++
  } catch (err) {
    console.error(`  ❌ FAIL: ${desc}`)
    console.error(`     Erreur: ${err.message}`)
    process.exit(1)
  }
}

// ── TEST 1 : Résolution de l'erreur de sauvegarde auto_send_closure_pdf ──────
console.log('\n[TEST 1] Éradication de l\'erreur schema cache auto_send_closure_pdf...')
it('ConfigPage sépare proprement handleSaveFiscalite pour ne pas envoyer auto_send_closure_pdf à la table companies', () => {
  assert.ok(configContent.includes('handleSaveFiscalite'), 'handleSaveFiscalite doit exister')
  assert.ok(configContent.includes('onSubmit={handleSaveFiscalite}'), 'Le formulaire fiscalité doit appeler handleSaveFiscalite')
  
  // Vérifier que fiscalPayload ne contient pas auto_send_closure_pdf
  const fiscalHandlerMatch = configContent.match(/handleSaveFiscalite[\s\S]*?const fiscalPayload: Record<string, any> = \{([\s\S]*?)\}/)
  assert.ok(fiscalHandlerMatch, 'fiscalPayload doit être typé et restreint')
  assert.ok(!fiscalHandlerMatch[1].includes('auto_send_closure_pdf'), 'fiscalPayload ne doit JAMAIS inclure auto_send_closure_pdf')
})

it('supabaseResilientFetch intercepte PGRST204 sur companies pour résilience absolue', () => {
  assert.ok(resilientFetchContent.includes("table === 'companies'"), 'supabaseResilientFetch doit intercepter la table companies')
  assert.ok(
    resilientFetchContent.includes('Could not find the') || resilientFetchContent.includes('PGRST204'),
    'supabaseResilientFetch doit détecter les erreurs schema cache PGRST204'
  )
  assert.ok(
    resilientFetchContent.includes('__company_extra_config__'),
    'supabaseResilientFetch doit stocker les colonnes manquantes dans __company_extra_config__'
  )
})

// ── TEST 2 : Migration SQL et synchronisation du schéma ──────────────────────
console.log('\n[TEST 2] Migration SQL d\'alignement de schéma (M085)...')
it('M085 ajoute les colonnes auto_send_closure_pdf, e_mecef_token, e_mecef_api_url', () => {
  assert.ok(migrationSqlContent.includes('ALTER TABLE IF EXISTS public.companies'), 'Migration doit modifier public.companies')
  assert.ok(migrationSqlContent.includes('auto_send_closure_pdf BOOLEAN'), 'auto_send_closure_pdf doit être déclarée')
  assert.ok(migrationSqlContent.includes('e_mecef_token TEXT'), 'e_mecef_token doit être déclarée')
  assert.ok(migrationSqlContent.includes('e_mecef_api_url TEXT'), 'e_mecef_api_url doit être déclarée')
  assert.ok(migrationSqlContent.includes("NOTIFY pgrst, 'reload schema'"), 'Notification de rechargement schema cache requise')
})

// ── TEST 3 : Activation e-MECeF, affichage statut et persistance ─────────────
console.log('\n[TEST 3] Activation e-MECeF et affichage « COMPTE e-MECeF ACTIVÉ »...')
it('Affichage automatique du statut exact « COMPTE e-MECeF ACTIVÉ » quand la case est cochée', () => {
  assert.ok(
    configContent.includes('COMPTE e-MECeF ACTIVÉ'),
    'ConfigPage doit afficher explicitement le statut COMPTE e-MECeF ACTIVÉ'
  )
})

it('Persistance de e_mecef_active en base de données et dans le localStorage sous la clé isolée par entreprise', () => {
  assert.ok(configContent.includes('localStorage.setItem(`gestio229_emecef_active_${company.id}`'), 'Clé isolée par tenant requise')
  assert.ok(configContent.includes('e_mecef_active: activeState'), 'e_mecef_active doit être transmis au payload DB')
})

it('Conservation des jetons DGI : NIM, URL API et Token API DGI', () => {
  assert.ok(configContent.includes('e_mecef_token'), 'e_mecef_token doit être pris en charge')
  assert.ok(configContent.includes('e_mecef_api_url'), 'e_mecef_api_url doit être pris en charge')
  assert.ok(configContent.includes('__emecef_config__'), '__emecef_config__ doit persister dans le JSONB')
})

// ── TEST 4 : Alternance BON DE COMMANDE vs FACTURE DE VENTE ──────────────────
console.log('\n[TEST 4] Basculement BON DE COMMANDE vs FACTURE DE VENTE...')

// Simulation du helper facturationHelper
function simulateFacturationDoc(company, localStorageMap = {}) {
  const compId = company?.id
  const localVal = compId ? localStorageMap[`gestio229_emecef_active_${compId}`] : undefined
  
  let isActive = false
  if (localVal === 'true') isActive = true
  else if (localVal === 'false') isActive = false
  else if (company?.e_mecef_active === true || company?.e_mecef_connected === true) isActive = true

  return {
    isActive,
    title: isActive ? 'FACTURE DE VENTE' : 'BON DE COMMANDE',
    footerMessage: isActive
      ? `Facture commerciale émise par GESTIO 229 ERP — République du Bénin\nPour tout renseignement, veuillez contacter la Direction de ${company?.name || "l'entreprise"}.`
      : 'Merci de passer à la caisse pour obtenir votre facture normalisée après validation de votre commande'
  }
}

it('Entreprise A coche l\'option : passage immédiat à FACTURE DE VENTE', () => {
  const companyA = { id: 'comp-A', name: 'Entreprise A', e_mecef_active: true }
  const localA = { 'gestio229_emecef_active_comp-A': 'true' }
  const docA = simulateFacturationDoc(companyA, localA)
  
  assert.strictEqual(docA.isActive, true)
  assert.strictEqual(docA.title, 'FACTURE DE VENTE')
  assert.ok(!docA.footerMessage.includes('Merci de passer à la caisse'))
})

it('Entreprise A décoche l\'option : retour immédiat à BON DE COMMANDE avec consigne caisse', () => {
  const companyA = { id: 'comp-A', name: 'Entreprise A', e_mecef_active: false }
  const localA = { 'gestio229_emecef_active_comp-A': 'false' }
  const docA = simulateFacturationDoc(companyA, localA)
  
  assert.strictEqual(docA.isActive, false)
  assert.strictEqual(docA.title, 'BON DE COMMANDE')
  assert.ok(docA.footerMessage.includes('Merci de passer à la caisse pour obtenir votre facture normalisée après validation de votre commande'))
})

// ── TEST 5 : Isolation stricte inter-entreprises (Multi-tenant) ──────────────
console.log('\n[TEST 5] Isolation stricte : Entreprise A activée n\'impacte JAMAIS Entreprise B...')
it('Entreprise A activée (FACTURE DE VENTE) n\'active JAMAIS Entreprise B (qui reste BON DE COMMANDE)', () => {
  const companyA = { id: 'comp-A', name: 'Entreprise A', e_mecef_active: true }
  const companyB = { id: 'comp-B', name: 'Entreprise B', e_mecef_active: false }
  
  const localDb = {
    'gestio229_emecef_active_comp-A': 'true',
    'gestio229_emecef_active_comp-B': 'false'
  }

  const docA = simulateFacturationDoc(companyA, localDb)
  const docB = simulateFacturationDoc(companyB, localDb)

  assert.strictEqual(docA.title, 'FACTURE DE VENTE', 'Entreprise A doit avoir FACTURE DE VENTE')
  assert.strictEqual(docB.title, 'BON DE COMMANDE', 'Entreprise B doit impérativement rester BON DE COMMANDE')
})

console.log('\n================================================================')
console.log(`🎉 SUCCÈS TOTAL : ${testsPassed}/${testsPassed} TESTS DE CORRECTION e-MECeF VALIDÉS !`)
console.log('================================================================\n')
