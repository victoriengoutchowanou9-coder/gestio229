-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M042 : BRASSERIE & DÉPÔT DE BOISSONS
-- REFONTE PROFESSIONNELLE DU MODULE « GRILLES GROS & MAQUIS »
-- TARIFICATION DYNAMIQUE PAR PALIERS & PRIX PERSONNALISÉS CLIENTS
-- =============================================================================

-- 1. TABLE DES GRILLES TARIFAIRES PAR PALIERS DE QUANTITÉ
CREATE TABLE IF NOT EXISTS public.brasserie_grilles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    nom TEXT NOT NULL,
    seuil_min NUMERIC(10,2) NOT NULL DEFAULT 1.00 CHECK (seuil_min >= 0),
    seuil_max NUMERIC(10,2) CHECK (seuil_max IS NULL OR seuil_max >= seuil_min),
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'INACTIF')),
    description TEXT,
    ordre_priorite INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brasserie_grilles_comp_sec ON public.brasserie_grilles(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_brasserie_grilles_seuils ON public.brasserie_grilles(company_id, seuil_min, seuil_max);

-- 2. TABLE DES PRIX PAR PRODUIT ET PAR GRILLE
CREATE TABLE IF NOT EXISTS public.brasserie_grille_prix (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    grille_id UUID NOT NULL REFERENCES public.brasserie_grilles(id) ON DELETE CASCADE,
    produit_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    prix_standard_fcfa NUMERIC(15,2) DEFAULT 0,
    prix_grille_fcfa NUMERIC(15,2) NOT NULL CHECK (prix_grille_fcfa >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(grille_id, produit_id)
);

CREATE INDEX IF NOT EXISTS idx_brasserie_grille_prix_grille ON public.brasserie_grille_prix(grille_id);
CREATE INDEX IF NOT EXISTS idx_brasserie_grille_prix_prod ON public.brasserie_grille_prix(produit_id);
CREATE INDEX IF NOT EXISTS idx_brasserie_grille_prix_comp ON public.brasserie_grille_prix(company_id);

-- 3. TABLE DES PRIX PERSONNALISÉS PAR CLIENT ET PAR PRODUIT (EXCEPTION PRIORITÉ 1)
CREATE TABLE IF NOT EXISTS public.brasserie_client_prix_personnalises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    client_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    produit_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    prix_personnalise_fcfa NUMERIC(15,2) NOT NULL CHECK (prix_personnalise_fcfa >= 0),
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'INACTIF')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(company_id, client_id, produit_id)
);

CREATE INDEX IF NOT EXISTS idx_brasserie_client_prix_cli ON public.brasserie_client_prix_personnalises(company_id, client_id);
CREATE INDEX IF NOT EXISTS idx_brasserie_client_prix_prod ON public.brasserie_client_prix_personnalises(produit_id);

-- 4. COLONNES D'IMMUTABILITÉ ET D'AUDIT SUR LES LIGNES DE VENTES (HISTORIQUE GELÉ)
ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS type_tarification TEXT DEFAULT 'STANDARD';
ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS grille_utilisee TEXT;
ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS grille_id UUID;
ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS prix_standard NUMERIC(15,2);
ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS prix_applique NUMERIC(15,2);
ALTER TABLE public.sales_order_items ADD COLUMN IF NOT EXISTS marge_unitaire NUMERIC(15,2);

-- Colonne d'information sur la commande globale
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS grille_appliquee TEXT;
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS grille_id UUID;

-- 5. FONCTION DE CONTRÔLE ANTI-CHEVAUCHEMENT DES PALIERS DE QUANTITÉ
CREATE OR REPLACE FUNCTION fn_check_brasserie_grille_overlap()
RETURNS TRIGGER AS $$
DECLARE
    v_conflict_nom TEXT;
BEGIN
    -- Ne vérifier que les grilles actives
    IF NEW.statut = 'ACTIF' THEN
        SELECT nom INTO v_conflict_nom
        FROM public.brasserie_grilles
        WHERE company_id = NEW.company_id
          AND sector_slug = NEW.sector_slug
          AND statut = 'ACTIF'
          AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
          AND (
            GREATEST(seuil_min, NEW.seuil_min) <= LEAST(COALESCE(seuil_max, 999999999), COALESCE(NEW.seuil_max, 999999999))
          )
        LIMIT 1;

        IF v_conflict_nom IS NOT NULL THEN
            RAISE EXCEPTION 'Chevauchement de palier interdit : Le palier [% - %] entre en conflit avec la grille active « % »',
                NEW.seuil_min,
                COALESCE(NEW.seuil_max::TEXT, 'Illimité'),
                v_conflict_nom;
        END IF;
    END IF;

    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_brasserie_grille_overlap ON public.brasserie_grilles;
CREATE TRIGGER trg_check_brasserie_grille_overlap
BEFORE INSERT OR UPDATE ON public.brasserie_grilles
FOR EACH ROW
EXECUTE FUNCTION fn_check_brasserie_grille_overlap();

-- 6. POLITIQUES RLS (ROW LEVEL SECURITY)
ALTER TABLE public.brasserie_grilles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasserie_grille_prix ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brasserie_client_prix_personnalises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rls_brasserie_grilles_all" ON public.brasserie_grilles;
CREATE POLICY "rls_brasserie_grilles_all" ON public.brasserie_grilles
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "rls_brasserie_grille_prix_all" ON public.brasserie_grille_prix;
CREATE POLICY "rls_brasserie_grille_prix_all" ON public.brasserie_grille_prix
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "rls_brasserie_client_prix_all" ON public.brasserie_client_prix_personnalises;
CREATE POLICY "rls_brasserie_client_prix_all" ON public.brasserie_client_prix_personnalises
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);
