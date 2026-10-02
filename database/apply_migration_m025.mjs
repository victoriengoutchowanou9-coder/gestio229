/**
 * apply_migration_m025.mjs
 * Applique la migration M025 sur Supabase via l'API Management
 * Exécute chaque ALTER TABLE / CREATE TABLE séparément pour éviter les timeouts
 */

const SUPABASE_URL = 'https://inknljnhqmrykcrgglts.supabase.co'
const ANON_KEY = 'sb_publishable_GxeQWvSKrMpnH9VkAEfGFQ_I_uKxaXr'
// Note: Pour les DDL, on utilise l'API REST + rpc exec_sql si disponible,
// sinon on passe par la fonction Supabase Edge ou on utilise des requêtes directes

// Stratégie: utiliser supabase.rpc('exec_sql', { sql: ... }) 
// OU utiliser l'API /rest/v1/rpc/exec_sql
// Si indisponible, on découpe en mini-transactions via fetch

const headers = {
  'apikey': ANON_KEY,
  'Authorization': `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
}

async function execSQL(sql, description) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sql })
  })
  
  if (resp.ok) {
    console.log(`✅ OK: ${description}`)
    return true
  }
  
  const body = await resp.text()
  console.error(`❌ ERREUR [${resp.status}]: ${description}`)
  console.error(`   Détail: ${body}`)
  return false
}

// Découper le SQL en statements individuels
const sql = `
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS credit_authorized BOOLEAN DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS discount_eligible BOOLEAN DEFAULT false;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2) DEFAULT 0.00;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS current_debt NUMERIC(15,2) DEFAULT 0.00;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS expense_date DATE DEFAULT CURRENT_DATE;

ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50);
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'COMPLET';
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reference_type VARCHAR(100);
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100);
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS previous_stock NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS new_stock NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS total_cost NUMERIC(15,2) DEFAULT 0.00;
`

const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0)

let success = 0
let errors = 0

for (const stmt of statements) {
  const ok = await execSQL(stmt + ';', stmt.substring(0, 80))
  if (ok) success++
  else errors++
}

console.log(`\n📊 Résumé: ${success} succès, ${errors} erreurs`)

// Essayer aussi les nouvelles tables
const newTables = `
CREATE TABLE IF NOT EXISTS public.coffre_fort (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sector_slug VARCHAR(100) NOT NULL DEFAULT 'boutique',
  solde_especes NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  solde_momo_marchand NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  solde_banque NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, sector_slug)
)
`
await execSQL(newTables + ';', 'CREATE TABLE coffre_fort')

const caissesMvt = `
CREATE TABLE IF NOT EXISTS public.caisse_mouvements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sector_slug VARCHAR(100) NOT NULL DEFAULT 'boutique',
  caisse_id UUID,
  type VARCHAR(50) NOT NULL DEFAULT 'especes',
  sens VARCHAR(10) NOT NULL DEFAULT 'entree',
  montant NUMERIC(15,2) NOT NULL DEFAULT 0.00,
  motif TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
)
`
await execSQL(caissesMvt + ';', 'CREATE TABLE caisse_mouvements')

const caisses = `
CREATE TABLE IF NOT EXISTS public.caisses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sector_slug VARCHAR(100) NOT NULL DEFAULT 'boutique',
  statut VARCHAR(20) NOT NULL DEFAULT 'fermee',
  date_ouverture TIMESTAMPTZ DEFAULT now(),
  date_fermeture TIMESTAMPTZ,
  fond_ouverture_especes NUMERIC(15,2) DEFAULT 0.00,
  fond_ouverture_momo NUMERIC(15,2) DEFAULT 0.00,
  solde_especes_final NUMERIC(15,2) DEFAULT 0.00,
  solde_momo_final NUMERIC(15,2) DEFAULT 0.00,
  ouvert_par UUID,
  ferme_par UUID,
  created_at TIMESTAMPTZ DEFAULT now()
)
`
await execSQL(caisses + ';', 'CREATE TABLE caisses')

// NOTIFY schema reload
await execSQL("NOTIFY pgrst, 'reload schema'", 'NOTIFY pgrst reload schema')

console.log('\n✅ Migration M025 terminée!')
