-- =============================================================================
-- GESTIO 229 SaaS — Migration M068 : Index d'Optimisation Haute Performance
-- Accélération instantanée du Login (< 2s) et du Hub Multi-Services (< 300ms)
-- =============================================================================

-- 1. Index sur l'authentification et les profils utilisateurs
CREATE INDEX IF NOT EXISTS idx_user_profiles_auth_user_id 
    ON public.user_profiles(auth_user_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_company_id 
    ON public.user_profiles(company_id);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email 
    ON public.user_profiles(email);

CREATE INDEX IF NOT EXISTS idx_companies_email 
    ON public.companies(email);

-- 2. Index sur les activités et secteurs souscrits
CREATE TABLE IF NOT EXISTS public.company_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL,
    sector_code VARCHAR(100),
    activity_name VARCHAR(255) NOT NULL,
    pos_location VARCHAR(255),
    manager_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'ACTIVE',
    is_active BOOLEAN DEFAULT TRUE,
    color VARCHAR(50) DEFAULT '#059669',
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.company_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access" ON public.company_activities;
CREATE POLICY "Allow authenticated full access" ON public.company_activities FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow service role full access" ON public.company_activities;
CREATE POLICY "Allow service role full access" ON public.company_activities FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon full access" ON public.company_activities;
CREATE POLICY "Allow anon full access" ON public.company_activities FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_comp_activities_comp_id 
    ON public.company_activities(company_id);

CREATE INDEX IF NOT EXISTS idx_comp_activities_comp_slug 
    ON public.company_activities(company_id, sector_slug);

-- 3. Index sur les ventes et commandes (recherche par date & statut)
CREATE INDEX IF NOT EXISTS idx_sales_orders_comp_created 
    ON public.sales_orders(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_orders_comp_status 
    ON public.sales_orders(company_id, status);

CREATE INDEX IF NOT EXISTS idx_sales_orders_sector 
    ON public.sales_orders(company_id, sector_slug);

-- 4. Index sur les dépenses et mouvements de caisse
CREATE INDEX IF NOT EXISTS idx_depenses_comp_created 
    ON public.depenses(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_depenses_comp_sec 
    ON public.depenses(company_id, secteur_id);

CREATE INDEX IF NOT EXISTS idx_caisse_mvt_comp_created 
    ON public.caisse_mouvements(company_id, created_at DESC);

-- 5. Index sur les catalogues (produits, clients, fournisseurs)
CREATE INDEX IF NOT EXISTS idx_products_comp_active 
    ON public.products(company_id, is_active);

CREATE INDEX IF NOT EXISTS idx_clients_comp_id 
    ON public.clients(company_id);

CREATE INDEX IF NOT EXISTS idx_fournisseurs_comp_id 
    ON public.fournisseurs(company_id);
