-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M035 : CAISSE MULTI-SECTEURS & ROLES METIERS
-- =============================================================================
-- 1. Table caisses (1 caisse par secteur d'activité, isolée par company_id)
-- 2. Table caisse_sessions (Sessions journalières, contrôle de clôture antérieure)
-- 3. Table roles_metiers (Rôles spécialisés par secteur d'activité)
-- =============================================================================

-- 1. TABLE CAISSES
CREATE TABLE IF NOT EXISTS public.caisses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    secteur_slug TEXT,
    code VARCHAR(50) NOT NULL,
    nom VARCHAR(150) NOT NULL,
    statut VARCHAR(30) NOT NULL DEFAULT 'actif',
    is_active BOOLEAN NOT NULL DEFAULT true,
    date_ouverture TIMESTAMPTZ,
    date_fermeture TIMESTAMPTZ,
    fond_ouverture_especes NUMERIC(15, 2) NOT NULL DEFAULT 0,
    fond_ouverture_momo NUMERIC(15, 2) NOT NULL DEFAULT 0,
    ouvert_par TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rétro-compatibilité : colonnes supplémentaires si caisses existait déjà
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisses' AND column_name = 'secteur_slug') THEN
        ALTER TABLE public.caisses ADD COLUMN secteur_slug TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisses' AND column_name = 'code') THEN
        ALTER TABLE public.caisses ADD COLUMN code VARCHAR(50) DEFAULT 'CS-DEFAULT';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisses' AND column_name = 'nom') THEN
        ALTER TABLE public.caisses ADD COLUMN nom VARCHAR(150) DEFAULT 'Caisse Principale';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisses' AND column_name = 'is_active') THEN
        ALTER TABLE public.caisses ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisses' AND column_name = 'date_fermeture') THEN
        ALTER TABLE public.caisses ADD COLUMN date_fermeture TIMESTAMPTZ;
    END IF;
END $$;

-- Synchroniser secteur_slug avec sector_slug
UPDATE public.caisses SET secteur_slug = sector_slug WHERE secteur_slug IS NULL;

CREATE INDEX IF NOT EXISTS idx_caisses_company_sector ON public.caisses(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_caisses_statut ON public.caisses(company_id, statut);


-- 2. TABLE CAISSE_SESSIONS
CREATE TABLE IF NOT EXISTS public.caisse_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caisse_id UUID NOT NULL REFERENCES public.caisses(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    secteur_slug TEXT,
    ouvert_par UUID,
    ouvert_par_nom TEXT,
    date_ouverture TIMESTAMPTZ NOT NULL DEFAULT now(),
    date_fermeture TIMESTAMPTZ,
    statut VARCHAR(30) NOT NULL DEFAULT 'ouverte',
    fond_ouverture_especes NUMERIC(15, 2) NOT NULL DEFAULT 0,
    fond_actuel_especes NUMERIC(15, 2) NOT NULL DEFAULT 0,
    fond_actuel_momo NUMERIC(15, 2) NOT NULL DEFAULT 0,
    especes_du_jour NUMERIC(15, 2) NOT NULL DEFAULT 0,
    momo_du_jour NUMERIC(15, 2) NOT NULL DEFAULT 0,
    ca_du_jour NUMERIC(15, 2) NOT NULL DEFAULT 0,
    especes_theorique NUMERIC(15, 2) NOT NULL DEFAULT 0,
    especes_comptees NUMERIC(15, 2) NOT NULL DEFAULT 0,
    ecart NUMERIC(15, 2) NOT NULL DEFAULT 0,
    cloture_par TEXT,
    notes_fermeture TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rétro-compatibilité : colonnes supplémentaires si table préexistante
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_sessions' AND column_name = 'secteur_slug') THEN
        ALTER TABLE public.caisse_sessions ADD COLUMN secteur_slug TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_sessions' AND column_name = 'ouvert_par_nom') THEN
        ALTER TABLE public.caisse_sessions ADD COLUMN ouvert_par_nom TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_sessions' AND column_name = 'fond_actuel_especes') THEN
        ALTER TABLE public.caisse_sessions ADD COLUMN fond_actuel_especes NUMERIC(15, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_sessions' AND column_name = 'fond_actuel_momo') THEN
        ALTER TABLE public.caisse_sessions ADD COLUMN fond_actuel_momo NUMERIC(15, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_sessions' AND column_name = 'especes_du_jour') THEN
        ALTER TABLE public.caisse_sessions ADD COLUMN especes_du_jour NUMERIC(15, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_sessions' AND column_name = 'momo_du_jour') THEN
        ALTER TABLE public.caisse_sessions ADD COLUMN momo_du_jour NUMERIC(15, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_sessions' AND column_name = 'ca_du_jour') THEN
        ALTER TABLE public.caisse_sessions ADD COLUMN ca_du_jour NUMERIC(15, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_sessions' AND column_name = 'especes_theorique') THEN
        ALTER TABLE public.caisse_sessions ADD COLUMN especes_theorique NUMERIC(15, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_sessions' AND column_name = 'especes_comptees') THEN
        ALTER TABLE public.caisse_sessions ADD COLUMN especes_comptees NUMERIC(15, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_sessions' AND column_name = 'ecart') THEN
        ALTER TABLE public.caisse_sessions ADD COLUMN ecart NUMERIC(15, 2) DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_sessions' AND column_name = 'cloture_par') THEN
        ALTER TABLE public.caisse_sessions ADD COLUMN cloture_par TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'caisse_sessions' AND column_name = 'notes_fermeture') THEN
        ALTER TABLE public.caisse_sessions ADD COLUMN notes_fermeture TEXT;
    END IF;
END $$;

UPDATE public.caisse_sessions SET secteur_slug = sector_slug WHERE secteur_slug IS NULL;

CREATE INDEX IF NOT EXISTS idx_caisse_sessions_caisse ON public.caisse_sessions(caisse_id, statut);
CREATE INDEX IF NOT EXISTS idx_caisse_sessions_company_date ON public.caisse_sessions(company_id, sector_slug, date_ouverture DESC);


-- 3. TABLE ROLES_METIERS
CREATE TABLE IF NOT EXISTS public.roles_metiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL,
    secteur_slug TEXT,
    code VARCHAR(50) NOT NULL,
    label VARCHAR(150) NOT NULL,
    description TEXT,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'roles_metiers' AND column_name = 'secteur_slug') THEN
        ALTER TABLE public.roles_metiers ADD COLUMN secteur_slug TEXT;
    END IF;
END $$;

UPDATE public.roles_metiers SET secteur_slug = sector_slug WHERE secteur_slug IS NULL;

CREATE INDEX IF NOT EXISTS idx_roles_metiers_sector ON public.roles_metiers(sector_slug);
CREATE INDEX IF NOT EXISTS idx_roles_metiers_company ON public.roles_metiers(company_id, sector_slug);

-- Rôles référentiels par secteur
INSERT INTO public.roles_metiers (sector_slug, secteur_slug, code, label, description, permissions)
VALUES
    -- Quincaillerie
    ('quincaillerie', 'quincaillerie', 'vendeur_quincaillerie', 'Vendeur Quincaillerie', 'Comptoir vente, devis BTP, bons de livraison', '{"ventes": true, "caisse": true, "stock": false, "clients": true}'::jsonb),
    ('quincaillerie', 'quincaillerie', 'gestionnaire_stock_quincaillerie', 'Gestionnaire Stock Quincaillerie', 'Réception matériaux, pesée fer/ciment, inventaires', '{"stock": true, "fournisseurs": true, "materiaux": true, "caisse": false}'::jsonb),
    
    -- Hôtel
    ('hotel', 'hotel', 'receptionniste', 'Réceptionniste / Agent d''Accueil', 'Réservations, check-in, check-out, facturation nuitées', '{"chambres": true, "ventes": true, "caisse": true, "clients": true}'::jsonb),
    ('hotel', 'hotel', 'housekeeping', 'Gouvernante / Housekeeping', 'État des chambres, entretien, réapprovisionnement linge', '{"housekeeping": true, "stock": true}'::jsonb),
    
    -- Station-Service
    ('station-service', 'station-service', 'pompiste', 'Pompiste / Opérateur de Piste', 'Service au volant, relevés d''index pompe, encaissement carburant', '{"ventes": true, "caisse": true, "pompes": true}'::jsonb),
    ('station-service', 'station-service', 'chef_piste', 'Chef de Piste', 'Supervision des pompes, relevés cuves, gestion des quarts', '{"ventes": true, "caisse": true, "pompes": true, "postes": true, "stock": true}'::jsonb),
    
    -- Microfinance
    ('microfinance', 'microfinance', 'agent_credit', 'Agent de Crédit / Chargé de Prêt', 'Instruction dossiers, validation garanties, suivi échéanciers', '{"credits": true, "membres": true, "reporting": true}'::jsonb),
    ('microfinance', 'microfinance', 'agent_collecteur', 'Agent Collecteur Terrain', 'Collectes tontine journalière, cotisations membres', '{"tontine": true, "membres": true, "agents": true}'::jsonb),
    ('microfinance', 'microfinance', 'caissier_sfd', 'Caissier SFD / Guichetier', 'Dépôts, retraits, reversements des collecteurs, arrêté de caisse', '{"caisse": true, "tresorerie": true, "membres": true}'::jsonb),
    
    -- Poissonnerie
    ('poissonnerie', 'poissonnerie', 'vendeur_poissonnerie', 'Vendeur Poissonnerie', 'Pesée, vente au carton ou détail, encaissement', '{"ventes": true, "caisse": true, "pesee": true}'::jsonb),
    ('poissonnerie', 'poissonnerie', 'gestionnaire_chambre_froide', 'Gestionnaire Chambre Froide', 'Températures, avaries, réceptions maritimes', '{"chambres_froides": true, "stock": true, "avaries": true}'::jsonb),
    
    -- Brasserie
    ('brasserie', 'brasserie', 'gestionnaire_depot', 'Gestionnaire de Dépôt / Maquis', 'Gestion des fûts, casiers, consignations et livraisons', '{"ventes": true, "stock": true, "consignation": true, "caisse": true}'::jsonb)
ON CONFLICT DO NOTHING;

-- SÉCURITÉ ROW LEVEL SECURITY (RLS)
ALTER TABLE public.caisses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caisse_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles_metiers ENABLE ROW LEVEL SECURITY;

-- Politiques RLS avec fallback public pour SELECT si company_id NULL
DROP POLICY IF EXISTS caisses_company_policy ON public.caisses;
CREATE POLICY caisses_company_policy ON public.caisses
    FOR ALL
    USING (
        auth.role() = 'authenticated' OR 
        company_id IS NULL OR 
        company_id = auth.uid()
    );

DROP POLICY IF EXISTS caisse_sessions_company_policy ON public.caisse_sessions;
CREATE POLICY caisse_sessions_company_policy ON public.caisse_sessions
    FOR ALL
    USING (
        auth.role() = 'authenticated' OR 
        company_id IS NULL OR 
        company_id = auth.uid()
    );

DROP POLICY IF EXISTS roles_metiers_policy ON public.roles_metiers;
CREATE POLICY roles_metiers_policy ON public.roles_metiers
    FOR ALL
    USING (true);
