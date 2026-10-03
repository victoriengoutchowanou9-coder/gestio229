-- ==============================================================================
-- M029 : BRASSERIE & DÉPÔT DE BOISSONS — GESTION DES CONSIGNATIONS / EMBALLAGES
-- Périmètre STRICT : sector_slug = 'brasserie' uniquement
-- Structure extensible : company_id + sector_slug sur toutes les tables
-- Additif uniquement — ne modifie aucune table existante des autres secteurs
-- ==============================================================================

-- 1. Types d'emballages (Casier 12T, 20T, 24T + extensible)
CREATE TABLE IF NOT EXISTS public.brasserie_emballages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    code TEXT NOT NULL,               -- ex: 'C12T', 'C20T', 'C24T'
    designation TEXT NOT NULL,        -- ex: 'Casier 12 Bouteilles', 'Casier 20 Bouteilles'
    type TEXT DEFAULT 'casier',       -- 'casier' | 'bouteille' | 'fut' | 'autre'
    unite TEXT DEFAULT 'unité',       -- unité de décompte
    valeur_consignation NUMERIC DEFAULT 0, -- valeur financière si applicable
    stock_depot INTEGER DEFAULT 0,    -- stock disponible au dépôt
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT brasserie_emballages_company_sector CHECK (sector_slug = 'brasserie')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brasserie_emb_code
    ON public.brasserie_emballages (company_id, code)
    WHERE sector_slug = 'brasserie';

CREATE INDEX IF NOT EXISTS idx_brasserie_emb_company
    ON public.brasserie_emballages (company_id, sector_slug, is_active);

-- 2. Association produit → emballage (brasserie uniquement)
CREATE TABLE IF NOT EXISTS public.brasserie_produit_emballage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    product_id UUID NOT NULL,         -- référence products.id
    emballage_id UUID NOT NULL REFERENCES public.brasserie_emballages(id) ON DELETE CASCADE,
    qte_emballage_par_unite NUMERIC DEFAULT 1,  -- nb d'emballages par unité vendue
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT brasserie_pe_sector CHECK (sector_slug = 'brasserie')
);

CREATE INDEX IF NOT EXISTS idx_brasserie_pe_product
    ON public.brasserie_produit_emballage (company_id, product_id)
    WHERE sector_slug = 'brasserie';

-- 3. Consignation client (solde d'emballages par client et par type)
CREATE TABLE IF NOT EXISTS public.brasserie_consignations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    client_id UUID NOT NULL,          -- référence customers.id
    emballage_id UUID NOT NULL REFERENCES public.brasserie_emballages(id) ON DELETE CASCADE,
    total_sorti INTEGER DEFAULT 0,    -- cumul total emballages sortis chez ce client
    total_retourne INTEGER DEFAULT 0, -- cumul total emballages retournés par ce client
    solde_du INTEGER DEFAULT 0,       -- = total_sorti - total_retourne
    derniere_sortie TIMESTAMPTZ,
    dernier_retour TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT brasserie_consig_sector CHECK (sector_slug = 'brasserie'),
    CONSTRAINT brasserie_consig_positive CHECK (solde_du >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brasserie_consig_client_emb
    ON public.brasserie_consignations (company_id, client_id, emballage_id)
    WHERE sector_slug = 'brasserie';

CREATE INDEX IF NOT EXISTS idx_brasserie_consig_client
    ON public.brasserie_consignations (company_id, sector_slug, client_id);

-- 4. Mouvements d'emballages — historique complet immuable
CREATE TABLE IF NOT EXISTS public.brasserie_mouvements_emballages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    emballage_id UUID NOT NULL REFERENCES public.brasserie_emballages(id) ON DELETE CASCADE,
    client_id UUID,                   -- nullable pour inventaires/ajustements
    type_mouvement TEXT NOT NULL,     -- voir contrainte ci-dessous
    quantite INTEGER NOT NULL,        -- toujours positif, le type indique le sens
    reference TEXT,                   -- ex: 'VTE-2026001', 'RET-2026042'
    vente_id UUID,                    -- lien sale_orders.id si vente
    avoir_id UUID,                    -- lien si avoir
    retour_id UUID,                   -- lien si retour autonome
    inventaire_id UUID,               -- lien si inventaire
    ajustement_motif TEXT,            -- motif si AJUSTEMENT
    stock_depot_avant INTEGER,        -- stock dépôt avant mouvement
    stock_depot_apres INTEGER,        -- stock dépôt après mouvement
    solde_client_avant INTEGER,       -- solde client avant
    solde_client_apres INTEGER,       -- solde client après
    notes TEXT,
    created_by UUID,                  -- user_profiles.id
    created_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT brasserie_mouv_sector CHECK (sector_slug = 'brasserie'),
    CONSTRAINT brasserie_mouv_type CHECK (type_mouvement IN (
        'SORTIE_VENTE',         -- sortie lors d'une vente
        'RETOUR_IMMEDIAT',      -- retour lors de la vente même
        'RETOUR_CLIENT',        -- retour différé après vente
        'AJUSTEMENT_ENTREE',    -- correction positive (admin)
        'AJUSTEMENT_SORTIE',    -- correction négative (admin)
        'INVENTAIRE',           -- mise à jour inventaire physique
        'AVOIR_RETOUR'          -- retour lié à un avoir
    )),
    CONSTRAINT brasserie_mouv_qte_positive CHECK (quantite > 0)
);

CREATE INDEX IF NOT EXISTS idx_brasserie_mouv_company
    ON public.brasserie_mouvements_emballages (company_id, sector_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_brasserie_mouv_client
    ON public.brasserie_mouvements_emballages (company_id, client_id, created_at DESC)
    WHERE sector_slug = 'brasserie';

CREATE INDEX IF NOT EXISTS idx_brasserie_mouv_emballage
    ON public.brasserie_mouvements_emballages (company_id, emballage_id, created_at DESC)
    WHERE sector_slug = 'brasserie';

-- 5. Sessions d'inventaire d'emballages
CREATE TABLE IF NOT EXISTS public.brasserie_inventaires_emballages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    reference TEXT NOT NULL,          -- ex: 'INV-EMB-2026001'
    date_inventaire DATE DEFAULT CURRENT_DATE,
    statut TEXT DEFAULT 'en_cours',   -- 'en_cours' | 'valide' | 'annule'
    notes TEXT,
    valide_par UUID,
    valide_par_name TEXT,
    valide_at TIMESTAMPTZ,
    created_by UUID,
    created_by_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT brasserie_inv_sector CHECK (sector_slug = 'brasserie'),
    CONSTRAINT brasserie_inv_statut CHECK (statut IN ('en_cours', 'valide', 'annule'))
);

CREATE TABLE IF NOT EXISTS public.brasserie_inventaire_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventaire_id UUID NOT NULL REFERENCES public.brasserie_inventaires_emballages(id) ON DELETE CASCADE,
    emballage_id UUID NOT NULL REFERENCES public.brasserie_emballages(id) ON DELETE CASCADE,
    stock_theorique INTEGER DEFAULT 0,
    stock_physique INTEGER DEFAULT 0,
    ecart INTEGER GENERATED ALWAYS AS (stock_physique - stock_theorique) STORED,
    observation TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. RLS — isolation stricte par company_id
ALTER TABLE public.brasserie_emballages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brasserie_emb_all" ON public.brasserie_emballages;
CREATE POLICY "brasserie_emb_all" ON public.brasserie_emballages FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.brasserie_produit_emballage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brasserie_pe_all" ON public.brasserie_produit_emballage;
CREATE POLICY "brasserie_pe_all" ON public.brasserie_produit_emballage FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.brasserie_consignations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brasserie_consig_all" ON public.brasserie_consignations;
CREATE POLICY "brasserie_consig_all" ON public.brasserie_consignations FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.brasserie_mouvements_emballages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brasserie_mouv_all" ON public.brasserie_mouvements_emballages;
CREATE POLICY "brasserie_mouv_all" ON public.brasserie_mouvements_emballages FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.brasserie_inventaires_emballages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brasserie_inv_all" ON public.brasserie_inventaires_emballages;
CREATE POLICY "brasserie_inv_all" ON public.brasserie_inventaires_emballages FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.brasserie_inventaire_lignes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "brasserie_invl_all" ON public.brasserie_inventaire_lignes;
CREATE POLICY "brasserie_invl_all" ON public.brasserie_inventaire_lignes FOR ALL USING (true) WITH CHECK (true);

-- 7. Données initiales : 3 types d'emballages par défaut
-- (seront insérées côté app lors de la première ouverture du module)

-- 8. Rechargement schéma PostgREST
NOTIFY pgrst, 'reload schema';
