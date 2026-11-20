-- =============================================================================
-- GESTIO 229 SaaS — Migration M089 : Circuit de Vente, Suivi Serveuses et Clôture Caisse
-- Secteur : BAR, RESTAURANT ET MAQUIS
-- =============================================================================
-- 1. Suivi distinct et accumulation des produits BAR et plats RESTAURANT par session
-- 2. Colonnes total_bar_ttc, total_restaurant_ttc et details_suivi sur restaurant_sessions_serveurs
-- 3. Sécurité des statuts autorisés sur restaurant_commandes
-- =============================================================================

-- 1. Colonnes de suivi et d'accumulation sur restaurant_sessions_serveurs
ALTER TABLE public.restaurant_sessions_serveurs
    ADD COLUMN IF NOT EXISTS total_bar_ttc NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_restaurant_ttc NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS details_suivi JSONB DEFAULT '{"bar_items":[],"restaurant_items":[],"historique_ventes":[]}'::jsonb;

-- 2. Sécurisation de la contrainte CHECK sur restaurant_commandes
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'restaurant_commandes_statut_check'
    ) THEN
        ALTER TABLE public.restaurant_commandes DROP CONSTRAINT restaurant_commandes_statut_check;
    END IF;

    ALTER TABLE public.restaurant_commandes
        ADD CONSTRAINT restaurant_commandes_statut_check
        CHECK (statut IN ('OUVERTE', 'EN_PREPARATION', 'PRETE', 'SERVIE', 'EN_PAIEMENT', 'CLOTUREE', 'ANNULEE'));
END $$;

-- 3. Index d'isolation et de performance pour sessions et commandes
CREATE INDEX IF NOT EXISTS idx_rest_sessions_serveur_statut
    ON public.restaurant_sessions_serveurs(company_id, serveur_nom, statut);

CREATE INDEX IF NOT EXISTS idx_rest_commandes_serveur_session
    ON public.restaurant_commandes(company_id, serveur_nom, statut);

COMMENT ON TABLE public.restaurant_sessions_serveurs IS 'Sessions uniques de service par serveuse avec deux suivis indépendants BAR et RESTAURANT/MAQUIS';
