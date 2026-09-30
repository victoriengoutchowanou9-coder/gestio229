import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function check() {
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
  ];

  console.log('Testing Supabase tables accessibility:');
  for (const table of tables) {
    try {
      const { data, error, count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        console.log(`❌ Table [${table}]: ERROR - ${error.code} - ${error.message}`);
      } else {
        console.log(`✅ Table [${table}]: OK (count: ${count})`);
      }
    } catch (e) {
      console.log(`⚠️ Table [${table}]: EXCEPTION - ${e.message}`);
    }
  }
}

check();
