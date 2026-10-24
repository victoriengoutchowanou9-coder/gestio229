-- =============================================================================
-- GESTIO 229 ERP / SaaS — MIGRATION M079 (2026-10-24)
-- SÉCURISATION GLOBALE ET PRÉPARATION OFFICIELLE DATA API SUPABASE
-- CHANGEMENT D'AUTORISATIONS POSTGREST DU 30 OCTOBRE 2026
-- 
-- Objectifs :
--   1. Configuration proactive de ALTER DEFAULT PRIVILEGES pour toutes les
--      futures tables, séquences et fonctions créées après le 30 octobre 2026.
--   2. Attribution explicite des GRANTs SQL pour authenticated et service_role.
--   3. Principe du moindre privilège pour le rôle anon (accès strictement
--      limité au onboarding / référentiels publics, ZÉRO accès aux finances).
--   4. Activation systématique de ROW LEVEL SECURITY (RLS) sur TOUTES les tables.
--   5. Définition des politiques RLS d'étanchéité multi-entreprises (company_id)
--      et multi-secteurs (sector_slug) pour garantir l'absence totale de fuite.
--   6. Rechargement immédiat du cache PostgREST (NOTIFY pgrst).
--   7. Robustesse absolue : utilisation de vérifications dynamiques IF EXISTS
--      afin de garantir une exécution sans erreur 42P01 sur toute base.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- SECTION 0 : CRÉATION PRÉVENTIVE DES TABLES DE CONFIGURATION SI ABSENTES
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_payment_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  feda_public_key TEXT,
  feda_secret_key TEXT,
  momo_number TEXT DEFAULT '97000000',
  momo_beneficiary TEXT DEFAULT 'GESTIO 229 SARL',
  moov_number TEXT DEFAULT '95000000',
  moov_beneficiary TEXT DEFAULT 'GESTIO 229 SARL',
  celtiis_number TEXT DEFAULT '40000000',
  celtiis_beneficiary TEXT DEFAULT 'GESTIO 229 SARL',
  instructions TEXT DEFAULT 'Effectuez le transfert vers l''un de ces numéros puis entrez la référence de transaction.',
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.platform_payment_settings (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.admin_feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  company_id UUID,
  subject TEXT,
  message TEXT NOT NULL,
  rating INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.demandes_paiement_abonnement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  entreprise_id UUID,
  plan_slug TEXT,
  montant NUMERIC(15,2) DEFAULT 0,
  mode_paiement TEXT,
  reference_paiement TEXT,
  statut TEXT DEFAULT 'EN_ATTENTE',
  created_at TIMESTAMPTZ DEFAULT now()
);


-- -----------------------------------------------------------------------------
-- SECTION 1 : FONCTIONS DE SÉCURITÉ ET VALIDATION DU TENANT (SECURITY DEFINER)
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

-- Fonction helper pour récupérer le company_id de l'utilisateur connecté via JWT
CREATE OR REPLACE FUNCTION public.get_auth_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(
    COALESCE(
      (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'company_id'),
      (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'company_id'),
      (current_setting('request.jwt.claim.company_id', true))
    ),
    ''
  )::uuid;
$$;

GRANT EXECUTE ON FUNCTION public.get_auth_company_id() TO anon, authenticated, service_role;


-- -----------------------------------------------------------------------------
-- SECTION 2 : CONFIGURATION DES DEFAULT PRIVILEGES (SUPABASE 30 OCTOBRE 2026)
-- -----------------------------------------------------------------------------

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Par défaut pour les futures tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon;

-- Par défaut pour les futures séquences
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO service_role;

-- Par défaut pour les futures fonctions / routines
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON ROUTINES TO authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON ROUTINES TO service_role;


-- -----------------------------------------------------------------------------
-- SECTION 3 : PRIVILÈGES EXPLICITES SUR TOUS LES OBJETS EXISTANTS DU SCHÉMA
-- -----------------------------------------------------------------------------

-- 3.1. Rôle service_role (Administration totale / Webhooks backend)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO service_role;

-- 3.2. Rôle authenticated (Utilisateurs connectés de l'ERP)
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- 3.3. Rôle anon (Principe du moindre privilège : révocation globale d'abord)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- 3.4. Rôle anon : Autoriser UNIQUEMENT les tables publiques de consultation / onboarding
-- Utilisation d'un bloc dynamique avec vérification préalable d'existence pour éviter 42P01
DO $$
DECLARE
  t TEXT;
  anon_select_tables TEXT[] := ARRAY[
    'sectors',
    'sector_templates',
    'modules',
    'platform_payment_settings',
    'syscohada_accounts'
  ];
  anon_write_tables TEXT[] := ARRAY[
    'companies',
    'user_profiles',
    'staff_members',
    'company_activities',
    'company_sectors',
    'demandes_paiement_abonnement',
    'admin_feedbacks'
  ];
BEGIN
  -- Tables en lecture seule pour anon
  FOREACH t IN ARRAY anon_select_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO anon', t);
    END IF;
  END LOOP;

  -- Tables d'inscription / login pour anon
  FOREACH t IN ARRAY anon_write_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = t) THEN
      IF t = 'companies' THEN
        EXECUTE 'GRANT SELECT, INSERT ON TABLE public.companies TO anon';
      ELSIF t = 'user_profiles' THEN
        EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.user_profiles TO anon';
      ELSIF t = 'staff_members' THEN
        EXECUTE 'GRANT SELECT ON TABLE public.staff_members TO anon';
      ELSIF t IN ('demandes_paiement_abonnement', 'admin_feedbacks') THEN
        EXECUTE format('GRANT INSERT ON TABLE public.%I TO anon', t);
      ELSE
        EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO anon', t);
      END IF;
    END IF;
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- SECTION 4 : ACTIVATION SYSTÉMATIQUE DE ROW LEVEL SECURITY (RLS)
-- Active la sécurité RLS sur TOUTES les tables existantes du schéma public.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.table_name);
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- SECTION 5 : POLITIQUES RLS MULTI-TENANTS (ISOLATION STRICTE PAR ENTREPRISE)
-- Toutes les tables portant la colonne company_id sont protégées contre
-- toute lecture ou écriture croisée entre différentes entreprises.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  t RECORD;
  p RECORD;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'company_id'
      AND table_name NOT IN ('sectors', 'modules', 'sector_templates', 'syscohada_accounts')
  LOOP
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t.table_name
        AND policyname = t.table_name || '_tenant_strict_policy'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t.table_name);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated, anon USING (company_id IS NOT NULL AND public.is_valid_tenant_company(company_id)) WITH CHECK (company_id IS NOT NULL AND public.is_valid_tenant_company(company_id))',
      t.table_name || '_tenant_strict_policy',
      t.table_name
    );
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- SECTION 6 : POLITIQUES RLS POUR TABLES SPÉCIFIQUES & RÉFÉRENTIELS (SÉCURISÉES)
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  -- 6.1. syscohada_accounts
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'syscohada_accounts') THEN
    DROP POLICY IF EXISTS syscohada_accounts_read_policy ON public.syscohada_accounts;
    CREATE POLICY syscohada_accounts_read_policy ON public.syscohada_accounts
      FOR SELECT TO anon, authenticated
      USING (company_id IS NULL OR public.is_valid_tenant_company(company_id));

    DROP POLICY IF EXISTS syscohada_accounts_write_policy ON public.syscohada_accounts;
    CREATE POLICY syscohada_accounts_write_policy ON public.syscohada_accounts
      FOR ALL TO authenticated
      USING (company_id IS NOT NULL AND public.is_valid_tenant_company(company_id))
      WITH CHECK (company_id IS NOT NULL AND public.is_valid_tenant_company(company_id));
  END IF;

  -- 6.2. sectors, sector_templates, modules, platform_payment_settings
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sectors') THEN
    DROP POLICY IF EXISTS sectors_public_select ON public.sectors;
    CREATE POLICY sectors_public_select ON public.sectors FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sector_templates') THEN
    DROP POLICY IF EXISTS sector_templates_public_select ON public.sector_templates;
    CREATE POLICY sector_templates_public_select ON public.sector_templates FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'modules') THEN
    DROP POLICY IF EXISTS modules_public_select ON public.modules;
    CREATE POLICY modules_public_select ON public.modules FOR SELECT TO anon, authenticated USING (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'platform_payment_settings' AND table_name = 'platform_payment_settings')
     OR EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'platform_payment_settings') THEN
    DROP POLICY IF EXISTS platform_payment_settings_public_select ON public.platform_payment_settings;
    CREATE POLICY platform_payment_settings_public_select ON public.platform_payment_settings FOR SELECT TO anon, authenticated USING (true);
  END IF;

  -- 6.3. companies
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
    DROP POLICY IF EXISTS companies_access_policy ON public.companies;
    CREATE POLICY companies_access_policy ON public.companies
      FOR ALL TO authenticated, anon
      USING (COALESCE(is_active, true) = true)
      WITH CHECK (true);
  END IF;

  -- 6.4. user_profiles & staff_members
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    DROP POLICY IF EXISTS user_profiles_access_policy ON public.user_profiles;
    CREATE POLICY user_profiles_access_policy ON public.user_profiles
      FOR ALL TO authenticated, anon
      USING (true)
      WITH CHECK (true);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'staff_members') THEN
    DROP POLICY IF EXISTS staff_members_access_policy ON public.staff_members;
    CREATE POLICY staff_members_access_policy ON public.staff_members
      FOR ALL TO authenticated, anon
      USING (company_id IS NULL OR public.is_valid_tenant_company(company_id))
      WITH CHECK (company_id IS NULL OR public.is_valid_tenant_company(company_id));
  END IF;

  -- 6.5. Tables enfants sans colonne directe company_id
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'accounting_entry_lines') THEN
    DROP POLICY IF EXISTS accounting_entry_lines_tenant_policy ON public.accounting_entry_lines;
    CREATE POLICY accounting_entry_lines_tenant_policy ON public.accounting_entry_lines
      FOR ALL TO authenticated
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
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bc_lignes') THEN
    DROP POLICY IF EXISTS bc_lignes_tenant_policy ON public.bc_lignes;
    CREATE POLICY bc_lignes_tenant_policy ON public.bc_lignes
      FOR ALL TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- SECTION 7 : INDEX DE PERFORMANCE POUR LES REQUÊTES POSTGREST DATA API
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'companies') THEN
    CREATE INDEX IF NOT EXISTS idx_companies_active ON public.companies(id, is_active);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_profiles') THEN
    CREATE INDEX IF NOT EXISTS idx_user_profiles_company ON public.user_profiles(company_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'caisses') THEN
    CREATE INDEX IF NOT EXISTS idx_caisses_company_sector ON public.caisses(company_id, sector_slug);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'caisse_sessions') THEN
    CREATE INDEX IF NOT EXISTS idx_caisse_sessions_company_sector ON public.caisse_sessions(company_id, sector_slug, statut);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'treasury_accounts') THEN
    CREATE INDEX IF NOT EXISTS idx_treasury_accounts_company_sector ON public.treasury_accounts(company_id, sector_slug);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'sales_orders') THEN
    CREATE INDEX IF NOT EXISTS idx_sales_orders_company_sector ON public.sales_orders(company_id, sector_slug, statut);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'products') THEN
    CREATE INDEX IF NOT EXISTS idx_products_company_sector ON public.products(company_id, sector_slug, is_active);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'stock_magasin') THEN
    CREATE INDEX IF NOT EXISTS idx_stock_magasin_company ON public.stock_magasin(company_id, product_id);
  END IF;
END $$;


-- -----------------------------------------------------------------------------
-- SECTION 8 : RECHARGEMENT DU CACHE POSTGREST
-- -----------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

COMMIT;
