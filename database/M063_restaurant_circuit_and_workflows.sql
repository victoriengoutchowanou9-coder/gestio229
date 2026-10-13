-- =============================================================================
-- GESTIO 229 SaaS — Migration M063 : Extension Bar, Restaurant, Maquis & Fast-Food
-- =============================================================================
-- Complément fonctionnel du cahier des charges :
-- 1. Support du circuit BAR / CUISINE sur les produits et matières premières
-- 2. Workflow de commande 4 minutes (pending_confirmation, confirmed_at, expires_at)
-- 3. Suivi individuel des créances et consignes serveuses
-- =============================================================================

-- 1. Colonne circuit sur les produits (BAR vs CUISINE)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS restaurant_circuit TEXT DEFAULT 'BAR';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_matiere_premiere BOOLEAN DEFAULT FALSE;

-- 2. Champs de validation avec délai 4 minutes sur les commandes
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS circuit TEXT DEFAULT 'BAR';
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'CONFIRME';
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS confirmation_expires_at TIMESTAMPTZ;
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 3. Table des créances individuelles par serveuse
CREATE TABLE IF NOT EXISTS public.restaurant_creances_serveuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    session_id UUID REFERENCES public.restaurant_sessions_serveurs(id) ON DELETE SET NULL,
    order_id UUID,
    order_number TEXT NOT NULL,
    serveur_nom TEXT NOT NULL,
    circuit TEXT NOT NULL DEFAULT 'BAR',
    montant_initial NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_paye NUMERIC(15,2) NOT NULL DEFAULT 0,
    solde_restant NUMERIC(15,2) NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'NON_PAYE' CHECK (statut IN ('NON_PAYE', 'PARTIEL', 'PAYE', 'ANNULE')),
    consignes_bouteilles_dues INT NOT NULL DEFAULT 0,
    consignes_bouteilles_rendues INT NOT NULL DEFAULT 0,
    details JSONB,
    date_creation TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rest_creances_serv ON public.restaurant_creances_serveuses(company_id, serveur_nom, statut);
ALTER TABLE public.restaurant_creances_serveuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation_rest_creances" ON public.restaurant_creances_serveuses;
CREATE POLICY "company_isolation_rest_creances" ON public.restaurant_creances_serveuses FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- 4. Règlements détaillés des créances serveuses
CREATE TABLE IF NOT EXISTS public.restaurant_reglements_serveuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    creance_id UUID REFERENCES public.restaurant_creances_serveuses(id) ON DELETE CASCADE,
    serveur_nom TEXT NOT NULL,
    montant NUMERIC(15,2) NOT NULL DEFAULT 0,
    mode_reglement TEXT NOT NULL DEFAULT 'ESPECES',
    reference TEXT,
    recu_par TEXT,
    date_reglement TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rest_reglements_serv ON public.restaurant_reglements_serveuses(company_id, serveur_nom);
ALTER TABLE public.restaurant_reglements_serveuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation_rest_reglements" ON public.restaurant_reglements_serveuses;
CREATE POLICY "company_isolation_rest_reglements" ON public.restaurant_reglements_serveuses FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- FIN MIGRATION M063
