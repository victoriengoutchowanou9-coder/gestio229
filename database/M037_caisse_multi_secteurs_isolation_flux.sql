-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M037 : ISOLATION ABSOLUE CAISSE MULTI-SECTEURS,
-- FLUX DES MOUVEMENTS DE CAISSE ET PERFORMANCES
-- =============================================================================

-- 1. EXTENSION DE LA TABLE CAISSE_MOUVEMENTS (Silo étanche company_id + caisse_id + sector_slug)
CREATE TABLE IF NOT EXISTS public.caisse_mouvements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    caisse_id UUID NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
    caisse_session_id UUID REFERENCES public.caisse_sessions(id) ON DELETE SET NULL,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'boutique',
    secteur_slug VARCHAR(100),
    type VARCHAR(50) NOT NULL DEFAULT 'vente', -- 'vente', 'depense', 'reglement_client', 'paiement_fournisseur', 'retrait', 'versement', 'ajustement', 'cloture'
    sens VARCHAR(20) NOT NULL DEFAULT 'entree', -- 'entree', 'sortie'
    montant_especes NUMERIC(15, 2) NOT NULL DEFAULT 0,
    montant_momo NUMERIC(15, 2) NOT NULL DEFAULT 0,
    montant NUMERIC(15, 2) NOT NULL DEFAULT 0,
    source_module VARCHAR(100) NOT NULL DEFAULT 'vente_pos', -- 'vente_pos', 'clients_creances', 'depenses', 'fournisseurs_achats', 'tresorerie', 'microfinance', 'station', 'brasserie', 'hotel'
    source_id VARCHAR(100),
    motif TEXT,
    reference_id TEXT,
    user_name VARCHAR(255),
    user_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Rétro-compatibilité : colonnes supplémentaires si caisse_mouvements existait déjà
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_mouvements' AND column_name = 'caisse_session_id') THEN
        ALTER TABLE public.caisse_mouvements ADD COLUMN caisse_session_id UUID REFERENCES public.caisse_sessions(id) ON DELETE SET NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_mouvements' AND column_name = 'montant_especes') THEN
        ALTER TABLE public.caisse_mouvements ADD COLUMN montant_especes NUMERIC(15, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_mouvements' AND column_name = 'montant_momo') THEN
        ALTER TABLE public.caisse_mouvements ADD COLUMN montant_momo NUMERIC(15, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_mouvements' AND column_name = 'source_module') THEN
        ALTER TABLE public.caisse_mouvements ADD COLUMN source_module VARCHAR(100) DEFAULT 'vente_pos';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_mouvements' AND column_name = 'source_id') THEN
        ALTER TABLE public.caisse_mouvements ADD COLUMN source_id VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_mouvements' AND column_name = 'user_name') THEN
        ALTER TABLE public.caisse_mouvements ADD COLUMN user_name VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_mouvements' AND column_name = 'user_id') THEN
        ALTER TABLE public.caisse_mouvements ADD COLUMN user_id UUID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_mouvements' AND column_name = 'secteur_slug') THEN
        ALTER TABLE public.caisse_mouvements ADD COLUMN secteur_slug VARCHAR(100);
    END IF;
END $$;

-- Synchroniser secteur_slug
UPDATE public.caisse_mouvements SET secteur_slug = sector_slug WHERE secteur_slug IS NULL;

-- 2. INDEX OPTIMISÉS DE PERFORMANCE (OBJECTIFS 1 & 7)
CREATE INDEX IF NOT EXISTS idx_caisse_sessions_lookup ON public.caisse_sessions(company_id, caisse_id, statut, date_ouverture DESC);
CREATE INDEX IF NOT EXISTS idx_caisse_sessions_sector ON public.caisse_sessions(company_id, sector_slug, statut);
CREATE INDEX IF NOT EXISTS idx_caisse_sessions_date ON public.caisse_sessions(company_id, date_ouverture DESC);

CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_caisse_date ON public.caisse_mouvements(company_id, caisse_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_session ON public.caisse_mouvements(caisse_session_id);
CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_sector ON public.caisse_mouvements(company_id, sector_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_source ON public.caisse_mouvements(source_module, source_id);

CREATE INDEX IF NOT EXISTS idx_caisse_clotures_caisse ON public.caisse_clotures(company_id, caisse_id, date_cloture DESC);
CREATE INDEX IF NOT EXISTS idx_caisse_clotures_sector ON public.caisse_clotures(company_id, sector_slug, date_cloture DESC);

-- Index composites haute performance sur les grandes tables du logiciel
CREATE INDEX IF NOT EXISTS idx_sales_orders_comp_sec_date ON public.sales_orders(company_id, sector_slug, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customers_comp_sec ON public.customers(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_products_comp_sec ON public.products(company_id, sector_slug);

-- 3. POLITIQUES RLS MULTI-TENANT SUR CAISSE_MOUVEMENTS
ALTER TABLE public.caisse_mouvements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'caisse_mouvements_iso') THEN
        CREATE POLICY caisse_mouvements_iso ON public.caisse_mouvements
        FOR ALL USING (
            company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1)
        );
    END IF;
END $$;
