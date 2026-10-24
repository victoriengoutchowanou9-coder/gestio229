-- =============================================================================
-- SUPABASE MIGRATION : 20261024_audit_global_rls_isolation_fix.sql
-- Miroir de database/M076_audit_global_rls_isolation_syscohada_fix.sql pour CLI Supabase
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_valid_tenant_company(p_company_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_company_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.companies c
       WHERE c.id = p_company_id
         AND COALESCE(c.is_active, true) = true
     );
$$;

GRANT EXECUTE ON FUNCTION public.is_valid_tenant_company(UUID) TO anon, authenticated, service_role;

ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique',
  ADD COLUMN IF NOT EXISTS secteur_slug VARCHAR(100) DEFAULT 'boutique',
  ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE IF EXISTS public.customers
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique',
  ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS ifu_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE IF EXISTS public.suppliers
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique',
  ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS ifu_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS current_debt NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

ALTER TABLE IF EXISTS public.sales_orders
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique',
  ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.sales_order_items
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique',
  ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.purchase_orders
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique',
  ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.bons_commande
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

ALTER TABLE IF EXISTS public.expenses
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique',
  ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS expense_date DATE DEFAULT CURRENT_DATE;

ALTER TABLE IF EXISTS public.treasury_accounts
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

ALTER TABLE IF EXISTS public.treasury_transfers
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

ALTER TABLE IF EXISTS public.accounting_journals
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

ALTER TABLE IF EXISTS public.accounting_periods
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

ALTER TABLE IF EXISTS public.accounting_entries
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique',
  ADD COLUMN IF NOT EXISTS source_module VARCHAR(100),
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS journal_code VARCHAR(20);

DO $$
DECLARE
  pol RECORD;
  trg RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'caisses'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.caisses', pol.policyname);
  END LOOP;

  FOR trg IN
    SELECT tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'caisses' AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.caisses', trg.tgname);
  END LOOP;
END $$;

DO $$
DECLARE
  t_name TEXT;
  pol RECORD;
  tenant_tables TEXT[] := ARRAY[
    'customers', 'suppliers', 'products', 'product_categories', 'stock_movements',
    'stock_locations', 'stock_levels', 'inventory_sessions', 'sales_orders',
    'purchase_orders', 'client_debts', 'debt_payments', 'customer_repayments',
    'caisses', 'caisse_sessions', 'sessions_caisse', 'caisse_mouvements',
    'caisse_clotures', 'clotures_caisse', 'caisse_journaliere', 'fonds_actuels',
    'coffre_fort', 'cash_registers', 'cash_sessions', 'expenses',
    'treasury_accounts', 'treasury_transfers', 'demandes_retrait',
    'accounting_journals', 'accounting_periods', 'accounting_entries',
    'parametres_destinataires', 'audit_logs', 'company_activities'
  ];
BEGIN
  FOREACH t_name IN ARRAY tenant_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t_name)
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t_name AND column_name = 'company_id')
    THEN
      FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t_name
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t_name);
      END LOOP;
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t_name);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (public.is_valid_tenant_company(company_id)) WITH CHECK (public.is_valid_tenant_company(company_id))',
        t_name || '_tenant_rls_policy', t_name
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
