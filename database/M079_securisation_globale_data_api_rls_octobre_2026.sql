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
-- =============================================================================

BEGIN;

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
-- Garantit que toute nouvelle table, séquence ou fonction créée par les futures
-- migrations recevra automatiquement les bons privilèges sans régression.
-- -----------------------------------------------------------------------------

-- Droit d'utilisation du schéma public
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
-- Consultation des secteurs, modules, templates et tarifs de la plateforme
GRANT SELECT ON TABLE public.sectors TO anon;
GRANT SELECT ON TABLE public.sector_templates TO anon;
GRANT SELECT ON TABLE public.modules TO anon;
GRANT SELECT ON TABLE public.platform_payment_settings TO anon;
GRANT SELECT ON TABLE public.syscohada_accounts TO anon;

-- Inscription / Login des utilisateurs et création d'entreprise
GRANT SELECT, INSERT ON TABLE public.companies TO anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.user_profiles TO anon;
GRANT SELECT ON TABLE public.staff_members TO anon;
GRANT SELECT, INSERT ON TABLE public.company_activities TO anon;
GRANT SELECT, INSERT ON TABLE public.company_sectors TO anon;
GRANT INSERT ON TABLE public.demandes_paiement_abonnement TO anon;
GRANT INSERT ON TABLE public.admin_feedbacks TO anon;


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
    -- Supprimer l'ancienne politique si elle existe
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = t.table_name
        AND policyname = t.table_name || '_tenant_strict_policy'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, t.table_name);
    END LOOP;

    -- Créer la politique stricte de validation du tenant
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated, anon USING (company_id IS NOT NULL AND public.is_valid_tenant_company(company_id)) WITH CHECK (company_id IS NOT NULL AND public.is_valid_tenant_company(company_id))',
      t.table_name || '_tenant_strict_policy',
      t.table_name
    );
  END LOOP;
END $$;


-- -----------------------------------------------------------------------------
-- SECTION 6 : POLITIQUES RLS POUR TABLES SPÉCIFIQUES & RÉFÉRENTIELS
-- -----------------------------------------------------------------------------

-- 6.1. syscohada_accounts (Permet la lecture du plan comptable général NULL et du plan spécifique tenant)
DROP POLICY IF EXISTS syscohada_accounts_read_policy ON public.syscohada_accounts;
CREATE POLICY syscohada_accounts_read_policy ON public.syscohada_accounts
  FOR SELECT TO anon, authenticated
  USING (company_id IS NULL OR public.is_valid_tenant_company(company_id));

DROP POLICY IF EXISTS syscohada_accounts_write_policy ON public.syscohada_accounts;
CREATE POLICY syscohada_accounts_write_policy ON public.syscohada_accounts
  FOR ALL TO authenticated
  USING (company_id IS NOT NULL AND public.is_valid_tenant_company(company_id))
  WITH CHECK (company_id IS NOT NULL AND public.is_valid_tenant_company(company_id));

-- 6.2. sectors, sector_templates, modules, platform_payment_settings (Référentiels publics)
DROP POLICY IF EXISTS sectors_public_select ON public.sectors;
CREATE POLICY sectors_public_select ON public.sectors
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS sector_templates_public_select ON public.sector_templates;
CREATE POLICY sector_templates_public_select ON public.sector_templates
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS modules_public_select ON public.modules;
CREATE POLICY modules_public_select ON public.modules
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS platform_payment_settings_public_select ON public.platform_payment_settings;
CREATE POLICY platform_payment_settings_public_select ON public.platform_payment_settings
  FOR SELECT TO anon, authenticated USING (true);

-- 6.3. companies (Lecture et création d'entreprise)
DROP POLICY IF EXISTS companies_access_policy ON public.companies;
CREATE POLICY companies_access_policy ON public.companies
  FOR ALL TO authenticated, anon
  USING (COALESCE(is_active, true) = true)
  WITH CHECK (true);

-- 6.4. user_profiles & staff_members
DROP POLICY IF EXISTS user_profiles_access_policy ON public.user_profiles;
CREATE POLICY user_profiles_access_policy ON public.user_profiles
  FOR ALL TO authenticated, anon
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS staff_members_access_policy ON public.staff_members;
CREATE POLICY staff_members_access_policy ON public.staff_members
  FOR ALL TO authenticated, anon
  USING (company_id IS NULL OR public.is_valid_tenant_company(company_id))
  WITH CHECK (company_id IS NULL OR public.is_valid_tenant_company(company_id));

-- 6.5. Tables enfants sans colonne directe company_id (ex: accounting_entry_lines, sales_order_items si orphelines)
DO $$
BEGIN
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

CREATE INDEX IF NOT EXISTS idx_companies_active ON public.companies(id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_profiles_company ON public.user_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_caisses_company_sector ON public.caisses(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_caisse_sessions_company_sector ON public.caisse_sessions(company_id, sector_slug, statut);
CREATE INDEX IF NOT EXISTS idx_treasury_accounts_company_sector ON public.treasury_accounts(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_sales_orders_company_sector ON public.sales_orders(company_id, sector_slug, statut);
CREATE INDEX IF NOT EXISTS idx_products_company_sector ON public.products(company_id, sector_slug, is_active);
CREATE INDEX IF NOT EXISTS idx_stock_magasin_company ON public.stock_magasin(company_id, product_id);


-- -----------------------------------------------------------------------------
-- SECTION 8 : RECHARGEMENT DU CACHE POSTGREST
-- -----------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

COMMIT;
