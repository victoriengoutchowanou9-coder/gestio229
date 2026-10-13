-- =============================================================================
-- GESTIO 229 SaaS — Migration M064 : Prix de vente et marge des fiches techniques
-- =============================================================================
-- Permet d'enregistrer explicitement le prix de vente unitaire d'un plat/boisson
-- directement sur ses fiches techniques pour le calcul temps réel de la marge brute,
-- du taux de marque et du taux de marge, tout en synchronisant les produits du POS.
-- =============================================================================

ALTER TABLE public.restaurant_fiches_techniques
ADD COLUMN IF NOT EXISTS prix_vente_unitaire NUMERIC(15,2) DEFAULT 0;

COMMENT ON COLUMN public.restaurant_fiches_techniques.prix_vente_unitaire IS
'Prix de vente unitaire TTC en FCFA renseigné par le gérant pour la recette ou portion du plat';

-- Index pour recherche rapide et cohérence financière
CREATE INDEX IF NOT EXISTS idx_rest_fiches_plat_comp ON public.restaurant_fiches_techniques(company_id, plat_nom);
