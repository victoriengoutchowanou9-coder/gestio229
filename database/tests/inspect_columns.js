import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://inknljnhqmrykcrgglts.supabase.co',
  'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
)

async function inspectColumns(table) {
  const { data, error } = await supabase.from(table).select('*').limit(1)
  if (error) {
    console.log(`Table ${table} error:`, error.message)
    return
  }
  const cols = data.length > 0 ? Object.keys(data[0]) : '(vide)'
  console.log(`Colonnes ${table} :`, cols)
}

async function main() {
  await inspectColumns('cash_registers')
  await inspectColumns('treasury_accounts')
  await inspectColumns('customers')
  await inspectColumns('products')
}

main()
