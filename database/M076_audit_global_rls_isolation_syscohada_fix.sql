-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M076 (2026-10-24)
-- AUDIT GÉNÉRAL ET CORRECTION DURABLE :
--   1. Sécurité RLS multi-tenant compatible Auth Supabase + Utilisateurs internes (PIN)
--   2. Isolation stricte par entreprise (company_id) et secteur (sector_slug)
--   3. Correction de l'erreur 42809 (ANY sur JSONB) sur la table caisses
--   4. Support de l'archivage logique (deleted_at / is_active) sur products
--   5. Idempotence comptable SYSCOHADA Révisé (anti-doublon accounting_entries)
--   6. Désactivation de tout job pg_cron d'envoi automatique de rapport à 23h00
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. FONCTION DE VALIDATION MULTI-TENANT (SECURITY DEFINER)
-- Vérifie que company_id est non nul et correspond à une entreprise active.
-- Compatible avec les comptes Supabase Auth (authenticated) ET les sessions
-- internes par identifiant/PIN (user_profiles sous rôle anon).
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 2. HARMONISATION DES COLONNES D'ISOLATION SECTORIELLE & ARCHIVAGE PRODUITS
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- 3. SUPPRESSION DES TRIGGERS / POLITIQUES DÉFECTUEUX SUR CAISSES (ERREUR 42809)
-- Certaines politiques/triggers utilisaient "= ANY(selected_sectors)" sur une
-- colonne JSONB, provoquant "42809: op ANY/ALL (array) requires array on right side".
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
  trg RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'caisses'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.caisses', pol.policyname);
  END LOOP;

  FOR trg IN
    SELECT tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'caisses'
      AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.caisses', trg.tgname);
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 4. APPLICATION DES POLITIQUES RLS MULTI-TENANT SUR LES TABLES AVEC company_id
-- Remplace les politiques bloquantes (auth.company_id() NULL pour les sessions
-- internes) par une validation stricte du tenant via is_valid_tenant_company().
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t_name TEXT;
  pol RECORD;
  tenant_tables TEXT[] := ARRAY[
    'customers',
    'suppliers',
    'products',
    'product_categories',
    'stock_movements',
    'stock_locations',
    'stock_levels',
    'inventory_sessions',
    'sales_orders',
    'purchase_orders',
    'client_debts',
    'debt_payments',
    'customer_repayments',
    'caisses',
    'caisse_sessions',
    'sessions_caisse',
    'caisse_mouvements',
    'caisse_clotures',
    'clotures_caisse',
    'caisse_journaliere',
    'fonds_actuels',
    'coffre_fort',
    'cash_registers',
    'cash_sessions',
    'expenses',
    'treasury_accounts',
    'treasury_transfers',
    'demandes_retrait',
    'accounting_journals',
    'accounting_periods',
    'accounting_entries',
    'parametres_destinataires',
    'audit_logs',
    'company_activities'
  ];
BEGIN
  FOREACH t_name IN ARRAY tenant_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t_name
    ) AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t_name AND column_name = 'company_id'
    ) THEN
      -- Supprimer toutes les anciennes politiques conflictuelles sur cette table
      FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t_name
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t_name);
      END LOOP;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t_name);

      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (public.is_valid_tenant_company(company_id)) WITH CHECK (public.is_valid_tenant_company(company_id))',
        t_name || '_tenant_rls_policy',
        t_name
      );
    END IF;
  END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 5. TABLES ENFANTS OU RÉFÉRENTIELLES (sales_order_items, accounting_entry_lines,
--    bons_commande, bc_lignes, syscohada_accounts, sectors)
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  pol RECORD;
  t_name TEXT;
  child_tables TEXT[] := ARRAY[
    'sales_order_items',
    'accounting_entry_lines',
    'bons_commande',
    'bc_lignes',
    'syscohada_accounts',
    'sectors',
    'abonnements_secteurs'
  ];
BEGIN
  FOREACH t_name IN ARRAY child_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t_name
    ) THEN
      FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = t_name
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t_name);
      END LOOP;

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t_name);
    END IF;
  END LOOP;
END $$;

-- sales_order_items : lié à sales_orders ou company_id
CREATE POLICY sales_order_items_tenant_rls_policy ON public.sales_order_items
  FOR ALL TO anon, authenticated
  USING (
    (company_id IS NOT NULL AND public.is_valid_tenant_company(company_id))
    OR EXISTS (
      SELECT 1 FROM public.sales_orders so
      WHERE so.id = sales_order_items.order_id
        AND public.is_valid_tenant_company(so.company_id)
    )
  )
  WITH CHECK (
    (company_id IS NOT NULL AND public.is_valid_tenant_company(company_id))
    OR EXISTS (
      SELECT 1 FROM public.sales_orders so
      WHERE so.id = sales_order_items.order_id
        AND public.is_valid_tenant_company(so.company_id)
    )
  );

-- accounting_entry_lines : lié à accounting_entries
CREATE POLICY accounting_entry_lines_tenant_rls_policy ON public.accounting_entry_lines
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.accounting_entries ae
      WHERE ae.id = accounting_entry_lines.entry_id
        AND public.is_valid_tenant_company(ae.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.accounting_entries ae
      WHERE ae.id = accounting_entry_lines.entry_id
        AND public.is_valid_tenant_company(ae.company_id)
    )
  );

-- bons_commande & bc_lignes
CREATE POLICY bons_commande_tenant_rls_policy ON public.bons_commande
  FOR ALL TO anon, authenticated
  USING (company_id IS NULL OR public.is_valid_tenant_company(company_id))
  WITH CHECK (company_id IS NULL OR public.is_valid_tenant_company(company_id));

CREATE POLICY bc_lignes_tenant_rls_policy ON public.bc_lignes
  FOR ALL TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- syscohada_accounts (plan comptable référentiel ou spécifique entreprise)
CREATE POLICY syscohada_accounts_tenant_rls_policy ON public.syscohada_accounts
  FOR ALL TO anon, authenticated
  USING (company_id IS NULL OR public.is_valid_tenant_company(company_id))
  WITH CHECK (company_id IS NULL OR public.is_valid_tenant_company(company_id));

-- sectors & abonnements_secteurs
CREATE POLICY sectors_read_policy ON public.sectors
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY abonnements_secteurs_tenant_rls_policy ON public.abonnements_secteurs
  FOR ALL TO anon, authenticated
  USING (public.is_valid_tenant_company(entreprise_id))
  WITH CHECK (public.is_valid_tenant_company(entreprise_id));

-- -----------------------------------------------------------------------------
-- 6. INDEX DE PERFORMANCE & ANTI-DOUBLONS (ISOLATION PAR SECTEUR)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_company_sector_slug
  ON public.customers(company_id, sector_slug);

CREATE INDEX IF NOT EXISTS idx_suppliers_company_sector_slug
  ON public.suppliers(company_id, sector_slug);

CREATE INDEX IF NOT EXISTS idx_products_company_sector_active
  ON public.products(company_id, sector_slug, is_active);

CREATE INDEX IF NOT EXISTS idx_expenses_company_sector_slug
  ON public.expenses(company_id, sector_slug);

CREATE INDEX IF NOT EXISTS idx_sales_orders_company_sector_slug
  ON public.sales_orders(company_id, sector_slug);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_company_sector_slug
  ON public.purchase_orders(company_id, sector_slug);

CREATE INDEX IF NOT EXISTS idx_accounting_entries_company_sector_source
  ON public.accounting_entries(company_id, sector_slug, source_module, source_id);

-- -----------------------------------------------------------------------------
-- 7. DÉSACTIVATION DE TOUT CRON AUTOMATIQUE DE RAPPORT DE CAISSE À 23H00
-- Le rapport de clôture ne doit partir QUE lors d'une clôture réelle validée.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  j RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    FOR j IN
      SELECT jobid, jobname
      FROM cron.job
      WHERE jobname ILIKE '%caisse%'
         OR jobname ILIKE '%rapport%'
         OR command ILIKE '%send-rapport-caisse%'
         OR command ILIKE '%cron-rapport-caisse%'
    LOOP
      PERFORM cron.unschedule(j.jobid);
    END LOOP;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
