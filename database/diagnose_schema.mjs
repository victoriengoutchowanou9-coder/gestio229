/**
 * apply_migration_m025_v2.mjs
 * 
 * Approche alternative: créer d'abord la fonction exec_sql via l'API Supabase
 * puis l'utiliser pour les ALTER TABLE
 * 
 * Ou utiliser l'API Management Supabase (nécessite SUPABASE_ACCESS_TOKEN)
 */

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co'
const PROJECT_REF = 'inknljnhqmrykcrgglts'
const ANON_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'

// Tenter d'abord d'obtenir le service_role key depuis l'API Management
// En attendant, on utilise une approche Supabase SQL Editor via l'API admin

const headers = {
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
}

// Vérifier quelles colonnes existent déjà via information_schema
async function checkColumns(table, columns) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_columns_exist`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ p_table: table, p_columns: columns })
  })
  if (!resp.ok) return null
  return resp.json()
}

// Tester l'accès à information_schema via une vue
async function getTableColumns(table) {
  // Essai via une vue custom ou directement
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/get_table_columns?p_table=${encodeURIComponent(table)}`,
    { method: 'GET', headers }
  )
  if (!resp.ok) {
    // Fallback: tenter un select limité sur la table pour voir ce qui existe
    const r2 = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`,
      { method: 'GET', headers: { ...headers, 'Prefer': 'count=none' } }
    )
    // L'erreur PGRST204 sur une colonne inexistante nous guide
    return null
  }
  return resp.json()
}

// Approche: tester chaque colonne individuellement en faisant une requête select
async function columnExists(table, column) {
  const resp = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?select=${column}&limit=1`,
    { method: 'GET', headers }
  )
  
  if (resp.status === 200) return true
  
  const body = await resp.text()
  // PGRST204 = column not found in schema cache
  if (body.includes('PGRST204') || body.includes('Could not find') || body.includes(column)) {
    return false
  }
  return true // autre erreur, suppose que la colonne existe
}

console.log('🔍 Vérification des colonnes existantes...\n')

// Tables et colonnes à vérifier
const checks = [
  { table: 'customers', columns: ['notes', 'credit_authorized', 'discount_eligible', 'discount_rate', 'sector_slug', 'sector_meta'] },
  { table: 'suppliers', columns: ['notes', 'sector_slug', 'sector_meta', 'current_debt'] },
  { table: 'products', columns: ['sector_slug'] },
  { table: 'expenses', columns: ['sector_slug', 'title', 'expense_date'] },
  { table: 'sales_orders', columns: ['sector_slug', 'payment_method', 'customer_name', 'status', 'notes'] },
  { table: 'sales_order_items', columns: ['company_id', 'sector_slug'] },
  { table: 'stock_movements', columns: ['sector_slug', 'reference_type', 'reference_number', 'previous_stock', 'new_stock', 'total_cost'] },
]

const missing = []

for (const { table, columns } of checks) {
  console.log(`📋 Table: ${table}`)
  for (const col of columns) {
    const exists = await columnExists(table, col)
    if (!exists) {
      console.log(`   ❌ MANQUANTE: ${col}`)
      missing.push({ table, column: col })
    } else {
      console.log(`   ✅ OK: ${col}`)
    }
  }
}

console.log(`\n📊 ${missing.length} colonnes manquantes détectées:`)
missing.forEach(({ table, column }) => console.log(`   - ${table}.${column}`))

// Vérifier tables nouvelles
const newTables = ['coffre_fort', 'caisse_mouvements', 'caisses']
for (const t of newTables) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${t}?select=id&limit=1`, { method: 'GET', headers })
  if (resp.status === 404 || resp.status === 400) {
    console.log(`\n❌ Table manquante: ${t}`)
    missing.push({ table: t, column: '__CREATE__' })
  } else {
    console.log(`✅ Table existe: ${t}`)
  }
}

console.log('\n📝 Génération du rapport...')
console.log(JSON.stringify({ missing_columns: missing }, null, 2))
