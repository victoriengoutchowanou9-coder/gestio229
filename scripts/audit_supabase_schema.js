import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co';
const SUPABASE_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function testTables() {
  const tables = [
    'products', 'suppliers', 'customers', 'sales_orders', 'sales_order_items',
    'purchase_orders', 'purchase_order_items', 'expenses', 'invoices',
    'subscriptions', 'subscription_plans', 'cash_sessions', 'cash_registers',
    'companies', 'user_profiles', 'stock_movements', 'audit_logs',
    'vente_lignes', 'v_resume_activite', 'caisses', 'caisse_clotures',
    'caisse_mouvements', 'coffre_fort', 'sectors', 'company_sectors', 'company_activities'
  ];

  console.log('--- AUDIT DES TABLES SUPABASE ---');
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`[-] ${t}: ERROR -> code: ${error.code} | msg: ${error.message}`);
    } else {
      const cols = data && data.length > 0 ? Object.keys(data[0]) : '(table empty)';
      const hasCompanyId = Array.isArray(cols) && cols.includes('company_id');
      const hasSectorSlug = Array.isArray(cols) && cols.includes('sector_slug');
      console.log(`[+] ${t}: OK | company_id: ${hasCompanyId} | sector_slug: ${hasSectorSlug}`);
      if (Array.isArray(cols)) {
        console.log(`    Cols: ${cols.join(', ')}`);
      }
    }
  }

  // Also specifically test querying with .eq('sector_slug', 'boutique') to see exact error message when it fails
  console.log('\n--- TEST DIRECT DU FILTRE .eq(sector_slug) ---');
  for (const t of ['products', 'suppliers', 'customers', 'sales_orders', 'expenses']) {
    const { data, error } = await supabase.from(t).select('id').eq('sector_slug', 'boutique').limit(1);
    if (error) {
      console.log(`[-] ${t}.eq('sector_slug'): CODE ${error.code} | MESSAGE: ${error.message}`);
    } else {
      console.log(`[+] ${t}.eq('sector_slug'): OK column exists`);
    }
  }
}

testTables();
