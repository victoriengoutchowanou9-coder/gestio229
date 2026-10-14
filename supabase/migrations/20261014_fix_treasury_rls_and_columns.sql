-- =============================================================================
-- GESTIO 229 — Fix Trésorerie & Caisse : Colonnes, RLS & Synchronisation
-- Date : 2026-10-14
-- =============================================================================

-- 1. Ajouter la colonne institution dans treasury_accounts si absente
ALTER TABLE IF EXISTS public.treasury_accounts
  ADD COLUMN IF NOT EXISTS institution VARCHAR(150) DEFAULT 'Trésorerie Centrale';

-- 2. Désactiver RLS pour les tables de trésorerie et transferts afin d'assurer
--    l'accès sans blocage pour les utilisateurs internes (PIN / caissier / admin)
ALTER TABLE IF EXISTS public.treasury_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.treasury_transfers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.demandes_retrait DISABLE ROW LEVEL SECURITY;

-- 3. S'assurer que les index de performance existent
CREATE INDEX IF NOT EXISTS idx_treasury_accounts_company_type
  ON public.treasury_accounts(company_id, type);

CREATE INDEX IF NOT EXISTS idx_treasury_transfers_company_status
  ON public.treasury_transfers(company_id, status);

CREATE INDEX IF NOT EXISTS idx_demandes_retrait_company_statut
  ON public.demandes_retrait(company_id, statut);
