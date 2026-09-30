import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function inspectMore() {
  const tables = ['customers', 'suppliers', 'sales_orders', 'expenses', 'audit_logs', 'treasury_accounts'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`Table ${t} error:`, error.message);
    } else {
      console.log(`Table ${t} sample row keys:`, data && data.length > 0 ? Object.keys(data[0]) : 'empty table (select succeeded)');
    }
  }
}

inspectMore();
