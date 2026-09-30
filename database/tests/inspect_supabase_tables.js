import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://inknljnhqmrykcrgglts.supabase.co',
  'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
)

async function testTable(tableName) {
  try {
    const { data, error } = await supabase.from(tableName).select('*').limit(1)
    if (error) {
      return { table: tableName, exists: false, error: error.message }
    }
    return { table: tableName, exists: true, count: data.length }
  } catch (e) {
    return { table: tableName, exists: false, error: e.message }
  }
}

async function main() {
  const tables = [
    'companies',
    'user_profiles',
    'sectors',
    'company_sectors',
    'products',
    'product_categories',
    'stock_locations',
    'stock_movements',
    'sales_orders',
    'sales_order_items',
    'cash_registers',
    'cash_closures',
    'cash_movements',
    'customers',
    'customer_repayments',
    'suppliers',
    'purchase_orders',
    'expenses',
    'treasury_accounts',
    'treasury_transfers',
    'audit_logs'
  ]

  console.log('Inspection des tables Supabase...')
  for (const t of tables) {
    const res = await testTable(t)
    if (res.exists) {
      console.log(`✓ Table [${res.table}] EXISTE`)
    } else {
      console.log(`✗ Table [${res.table}] N'EXISTE PAS ou erreur: ${res.error}`)
    }
  }
}

main()
