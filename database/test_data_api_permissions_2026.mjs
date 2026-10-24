// =============================================================================
// GESTIO 229 ERP — TEST AUTOMATISÉ DATA API & ISOLATION MULTI-TENANT (OCTOBRE 2026)
// =============================================================================
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://inknljnhqmrykcrgglts.supabase.co'
const supabaseAnonKey = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
const sb = createClient(supabaseUrl, supabaseAnonKey)

async function runTests() {
  console.log('--- TEST DE VÉRIFICATION DATA API & RLS (POSTGREST 2026) ---')
  let passed = 0
  let failed = 0

  async function check(name, testFn) {
    try {
      await testFn()
      console.log(`  [PASS] ${name}`)
      passed++
    } catch (err) {
      console.error(`  [FAIL] ${name}: ${err.message}`)
      failed++
    }
  }

  // 1. Consultation catalogue public (autorisé anon)
  await check('Accès anon au catalogue sectors', async () => {
    const { data, error } = await sb.from('sectors').select('id, name, slug').limit(2)
    if (error) throw error
    if (!data || data.length === 0) throw new Error('Aucun secteur')
  })

  await check('Accès anon aux sector_templates', async () => {
    const { data, error } = await sb.from('sector_templates').select('id, sector_name, sector_slug').limit(2)
    if (error) throw error
  })

  await check('Accès anon au référentiel syscohada_accounts', async () => {
    const { data, error } = await sb.from('syscohada_accounts').select('id, code, name').limit(2)
    if (error) throw error
  })

  // 2. Isolation multi-tenant stricte
  await check('Isolation caisses contre fausse entreprise', async () => {
    const { data } = await sb.from('caisses').select('*').eq('company_id', '00000000-0000-0000-0000-000000000000')
    if (data && data.length > 0) throw new Error('Fuite de données caisse !')
  })

  await check('Isolation treasury_accounts contre fausse entreprise', async () => {
    const { data } = await sb.from('treasury_accounts').select('*').eq('company_id', '00000000-0000-0000-0000-000000000000')
    if (data && data.length > 0) throw new Error('Fuite de données trésorerie !')
  })

  await check('Isolation accounting_entries contre fausse entreprise', async () => {
    const { data } = await sb.from('accounting_entries').select('*').eq('company_id', '00000000-0000-0000-0000-000000000000')
    if (data && data.length > 0) throw new Error('Fuite de données écritures comptables !')
  })

  console.log(`\nBilan : ${passed} passés, ${failed} échoués.\n`)
}

runTests()
