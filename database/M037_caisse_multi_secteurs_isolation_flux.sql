-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M037 : ISOLATION ABSOLUE CAISSE MULTI-SECTEURS,
-- FLUX DES MOUVEMENTS DE CAISSE ET PERFORMANCES
-- =============================================================================

-- 1. S'ASSURER QUE LA TABLE CAISSES EXISTE ET CONTIENT LES BONNES COLONNES
CREATE TABLE IF NOT EXISTS public.caisses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code VARCHAR(100),
    nom VARCHAR(255),
    statut VARCHAR(30) DEFAULT 'actif',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS secteur_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS code VARCHAR(100);
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS nom VARCHAR(255);
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS statut VARCHAR(30) DEFAULT 'actif';
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS date_ouverture TIMESTAMPTZ;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS date_fermeture TIMESTAMPTZ;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS fond_ouverture_especes NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS fond_ouverture_momo NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS ouvert_par VARCHAR(255);
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. TABLE CAISSE_SESSIONS
CREATE TABLE IF NOT EXISTS public.caisse_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caisse_id UUID,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS caisse_id UUID;
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS secteur_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS ouvert_par UUID;
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS ouvert_par_nom VARCHAR(255);
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS date_ouverture TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS date_fermeture TIMESTAMPTZ;
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS statut VARCHAR(30) DEFAULT 'ouverte';
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS fond_ouverture_especes NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS fond_actuel_especes NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS fond_actuel_momo NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS especes_du_jour NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS momo_du_jour NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS ca_du_jour NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS especes_theorique NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS especes_comptees NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS ecart NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS cloture_par VARCHAR(255);
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS notes_fermeture TEXT;
ALTER TABLE public.caisse_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 3. TABLE CAISSE_MOUVEMENTS
CREATE TABLE IF NOT EXISTS public.caisse_mouvements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS caisse_id UUID;
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS caisse_session_id UUID;
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS secteur_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'vente';
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS sens VARCHAR(20) DEFAULT 'entree';
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS montant_especes NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS montant_momo NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS montant NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS source_module VARCHAR(100) DEFAULT 'vente_pos';
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS source_id VARCHAR(100);
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS motif TEXT;
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS reference_id TEXT;
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS user_name VARCHAR(255);
ALTER TABLE public.caisse_mouvements ADD COLUMN IF NOT EXISTS user_id UUID;

-- 4. TABLE CAISSE_CLOTURES
CREATE TABLE IF NOT EXISTS public.caisse_clotures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.caisse_clotures ADD COLUMN IF NOT EXISTS caisse_id UUID;
ALTER TABLE public.caisse_clotures ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.caisse_clotures ADD COLUMN IF NOT EXISTS secteur_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.caisse_clotures ADD COLUMN IF NOT EXISTS total_especes_jour NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_clotures ADD COLUMN IF NOT EXISTS total_momo_jour NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_clotures ADD COLUMN IF NOT EXISTS fond_actuel_especes_apres NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_clotures ADD COLUMN IF NOT EXISTS fond_actuel_momo_apres NUMERIC(15, 2) DEFAULT 0;
ALTER TABLE public.caisse_clotures ADD COLUMN IF NOT EXISTS cloture_par VARCHAR(255);
ALTER TABLE public.caisse_clotures ADD COLUMN IF NOT EXISTS date_cloture TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.caisse_clotures ADD COLUMN IF NOT EXISTS notes TEXT;

-- 5. SYNCHRONISATION DES SLUGS
UPDATE public.caisses SET secteur_slug = sector_slug WHERE secteur_slug IS NULL AND sector_slug IS NOT NULL;
UPDATE public.caisses SET sector_slug = secteur_slug WHERE sector_slug IS NULL AND secteur_slug IS NOT NULL;

UPDATE public.caisse_sessions SET secteur_slug = sector_slug WHERE secteur_slug IS NULL AND sector_slug IS NOT NULL;
UPDATE public.caisse_sessions SET sector_slug = secteur_slug WHERE sector_slug IS NULL AND sector_slug IS NOT NULL;

UPDATE public.caisse_mouvements SET secteur_slug = sector_slug WHERE secteur_slug IS NULL AND secteur_slug IS NOT NULL;
UPDATE public.caisse_mouvements SET sector_slug = secteur_slug WHERE sector_slug IS NULL AND sector_slug IS NOT NULL;

UPDATE public.caisse_clotures SET secteur_slug = sector_slug WHERE secteur_slug IS NULL AND secteur_slug IS NOT NULL;
UPDATE public.caisse_clotures SET sector_slug = secteur_slug WHERE sector_slug IS NULL AND secteur_slug IS NOT NULL;

-- 6. INDEX DE PERFORMANCE SÉCURISÉS (UNIQUEMENT SUR LES TABLES DE CAISSE)
CREATE INDEX IF NOT EXISTS idx_caisses_comp_sec ON public.caisses(company_id, sector_slug);

CREATE INDEX IF NOT EXISTS idx_caisse_sessions_lookup ON public.caisse_sessions(company_id, caisse_id, statut, date_ouverture DESC);
CREATE INDEX IF NOT EXISTS idx_caisse_sessions_sector ON public.caisse_sessions(company_id, sector_slug, statut);
CREATE INDEX IF NOT EXISTS idx_caisse_sessions_date ON public.caisse_sessions(company_id, date_ouverture DESC);

CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_caisse_date ON public.caisse_mouvements(company_id, caisse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_session ON public.caisse_mouvements(caisse_session_id);
CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_sector ON public.caisse_mouvements(company_id, sector_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_source ON public.caisse_mouvements(source_module, source_id);

CREATE INDEX IF NOT EXISTS idx_caisse_clotures_caisse ON public.caisse_clotures(company_id, caisse_id, date_cloture DESC);
CREATE INDEX IF NOT EXISTS idx_caisse_clotures_sector ON public.caisse_clotures(company_id, sector_slug, date_cloture DESC);

-- Index sur les tables existantes (company_id)
CREATE INDEX IF NOT EXISTS idx_sales_orders_comp_date ON public.sales_orders(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_comp ON public.customers(company_id);
CREATE INDEX IF NOT EXISTS idx_products_comp ON public.products(company_id);

-- 7. POLITIQUES RLS MULTI-TENANT SUR CAISSE_MOUVEMENTS
ALTER TABLE public.caisse_mouvements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'caisse_mouvements_iso') THEN
        CREATE POLICY caisse_mouvements_iso ON public.caisse_mouvements
        FOR ALL USING (
            company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
        );
    END IF;
END $$;
