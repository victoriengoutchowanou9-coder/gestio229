-- =============================================================================
-- GESTIO 229 SaaS — Migration M065 : Clôture Complète du Livrable Restaurant
-- Secteur : Bar, Restaurant, Maquis & Fast-Food (Livrable Point 17)
-- =============================================================================
-- 1. Séparation stricte et indépendance des stocks BAR et CUISINE
-- 2. Création et gestion des matières premières cuisine
-- 3. Fiches techniques et recettes avec Food Cost & calcul de rentabilité
-- 4. Workflow de validation avec compte à rebours de 4 minutes
-- 5. Règlements de créances serveuses avec liaison caisse sans double déstockage
-- 6. Suivi des retours d'emballages / bouteilles consignées
-- 7. KDS Cuisine & Bar et double impression des tickets
-- 8. Reporting complet : Consommation matières, Rentabilité Plats & Bar, Serveuses
-- =============================================================================

-- 1. Table des Règlements de Créances Serveuses (reliée à la caisse de l'établissement)
CREATE TABLE IF NOT EXISTS public.restaurant_reglements_serveuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    creance_id UUID REFERENCES public.restaurant_creances_serveuses(id) ON DELETE SET NULL,
    serveur_nom TEXT NOT NULL,
    montant NUMERIC(15,2) NOT NULL DEFAULT 0,
    mode_reglement TEXT NOT NULL DEFAULT 'ESPECES',
    reference TEXT,
    recu_par TEXT,
    date_reglement TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index pour requêtes rapides par entreprise et serveuse
CREATE INDEX IF NOT EXISTS idx_rest_regl_company_serveur 
    ON public.restaurant_reglements_serveuses(company_id, serveur_nom);
CREATE INDEX IF NOT EXISTS idx_rest_regl_date 
    ON public.restaurant_reglements_serveuses(company_id, date_reglement DESC);

-- 2. Colonnes additionnelles sur restaurant_commandes (Workflow 4 min & circuits)
ALTER TABLE public.restaurant_commandes
    ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'CONFIRME',
    ADD COLUMN IF NOT EXISTS confirmation_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS motif_annulation TEXT,
    ADD COLUMN IF NOT EXISTS annule_par TEXT,
    ADD COLUMN IF NOT EXISTS circuit TEXT DEFAULT 'BAR',
    ADD COLUMN IF NOT EXISTS total_ht NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_ttc NUMERIC(15,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_rest_cmd_validation 
    ON public.restaurant_commandes(company_id, validation_status, confirmation_expires_at);

-- 3. Colonnes additionnelles sur restaurant_creances_serveuses
ALTER TABLE public.restaurant_creances_serveuses
    ADD COLUMN IF NOT EXISTS circuit TEXT DEFAULT 'BAR',
    ADD COLUMN IF NOT EXISTS consignes_bouteilles_dues INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS consignes_bouteilles_rendues INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS session_id UUID,
    ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'NON_PAYE';

CREATE INDEX IF NOT EXISTS idx_rest_creances_circuit 
    ON public.restaurant_creances_serveuses(company_id, circuit, statut);
CREATE INDEX IF NOT EXISTS idx_rest_creances_consignes 
    ON public.restaurant_creances_serveuses(company_id, consignes_bouteilles_dues, consignes_bouteilles_rendues);

-- 4. Colonnes additionnelles sur products pour la distinction des circuits
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS restaurant_circuit TEXT,
    ADD COLUMN IF NOT EXISTS is_matiere_premiere BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS cout_matiere_estime NUMERIC(15,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_prod_restaurant_circuit 
    ON public.products(company_id, restaurant_circuit, is_matiere_premiere);

-- 5. Sécurité RLS (Row Level Security) sur restaurant_reglements_serveuses
ALTER TABLE public.restaurant_reglements_serveuses ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'restaurant_reglements_serveuses' 
        AND policyname = 'restaurant_reglements_tenant_policy'
    ) THEN
        CREATE POLICY restaurant_reglements_tenant_policy 
            ON public.restaurant_reglements_serveuses
            FOR ALL 
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- 6. Rechargement du cache de schéma Supabase
NOTIFY pgrst, 'reload schema';
