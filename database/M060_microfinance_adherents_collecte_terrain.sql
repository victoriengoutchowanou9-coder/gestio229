-- =============================================================================
-- GESTIO 229 SaaS — M060 : Gestion Adhérents & Affectations Agents Collecteurs
-- =============================================================================
-- Objectifs :
--   1. Créer la table microfinance_adherents (fiche adhérent complète)
--   2. Créer la table microfinance_affectations_agents (liaison agent <-> adhérent)
--   3. Corriger les politiques RLS des tables agents collecteurs existantes
--   4. Ajouter un champ agent_id sur les collectes terrain
-- =============================================================================
-- IDEMPOTENT — Non destructif — Sécurisé contre ré-exécution
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. TABLE ADHÉRENTS (fiche membre allégée pour collecte terrain)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_adherents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',

    -- Identité
    numero_adherent TEXT UNIQUE,           -- Identifiant unique auto-généré (ADH-XXXXXX)
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL DEFAULT '',
    telephone TEXT NOT NULL,
    telephone_alt TEXT,
    adresse TEXT,
    ville TEXT DEFAULT 'Cotonou',

    -- Type de cotisation et cycle
    type_cotisation TEXT NOT NULL DEFAULT 'EPARGNE'
        CHECK (type_cotisation IN ('EPARGNE', 'TONTINE', 'CREDIT', 'MIXTE')),
    montant_cotisation_habituel NUMERIC(15,2) DEFAULT 0,
    periodicite TEXT DEFAULT 'JOURNALIER'
        CHECK (periodicite IN ('JOURNALIER', 'HEBDOMADAIRE', 'MENSUEL')),

    -- Statut
    statut TEXT NOT NULL DEFAULT 'ACTIF'
        CHECK (statut IN ('ACTIF', 'INACTIF', 'SUSPENDU')),

    -- Traçabilité
    cree_par TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotence colonnes
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS numero_adherent TEXT;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS prenom TEXT;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS telephone_alt TEXT;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS ville TEXT;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS type_cotisation TEXT;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS montant_cotisation_habituel NUMERIC(15,2);
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS periodicite TEXT;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS statut TEXT;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS cree_par TEXT;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index
CREATE INDEX IF NOT EXISTS idx_mf_adherents_tenant
  ON public.microfinance_adherents (company_id, sector_slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mf_adherents_numero
  ON public.microfinance_adherents (company_id, numero_adherent)
  WHERE numero_adherent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mf_adherents_telephone
  ON public.microfinance_adherents (company_id, telephone);

-- RLS
ALTER TABLE public.microfinance_adherents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "adherents_company_isolation" ON public.microfinance_adherents;
CREATE POLICY "adherents_company_isolation" ON public.microfinance_adherents
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. TABLE AFFECTATIONS AGENT <-> ADHÉRENT
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_affectations_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',

    agent_id UUID REFERENCES public.microfinance_agents(id) ON DELETE CASCADE,
    adherent_id UUID REFERENCES public.microfinance_adherents(id) ON DELETE CASCADE,

    -- Ordre de passage dans la tournée
    ordre_tournee INT DEFAULT 0,
    note TEXT,

    -- Prévention des doublons
    UNIQUE (company_id, agent_id, adherent_id),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_affectations_agents ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_affectations_agents ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_affectations_agents ADD COLUMN IF NOT EXISTS ordre_tournee INT DEFAULT 0;
ALTER TABLE public.microfinance_affectations_agents ADD COLUMN IF NOT EXISTS note TEXT;

-- Index
CREATE INDEX IF NOT EXISTS idx_mf_affectations_agent
  ON public.microfinance_affectations_agents (company_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_mf_affectations_adherent
  ON public.microfinance_affectations_agents (company_id, adherent_id);

-- RLS
ALTER TABLE public.microfinance_affectations_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "affectations_company_isolation" ON public.microfinance_affectations_agents;
CREATE POLICY "affectations_company_isolation" ON public.microfinance_affectations_agents
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. CORRECTION DES POLITIQUES RLS SUR LES TABLES AGENTS EXISTANTES
--    (garantit que les utilisateurs authentifiés peuvent lire leurs données)
-- ══════════════════════════════════════════════════════════════════════════════

-- microfinance_agents : corriger la politique unique "company_isolation"
ALTER TABLE public.microfinance_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_agents;
DROP POLICY IF EXISTS "agents_rls" ON public.microfinance_agents;
CREATE POLICY "agents_company_isolation" ON public.microfinance_agents
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- microfinance_collectes_terrain
ALTER TABLE public.microfinance_collectes_terrain ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_collectes_terrain;
DROP POLICY IF EXISTS "collectes_rls" ON public.microfinance_collectes_terrain;
CREATE POLICY "collectes_company_isolation" ON public.microfinance_collectes_terrain
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- microfinance_reversements_agents
ALTER TABLE public.microfinance_reversements_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_reversements_agents;
DROP POLICY IF EXISTS "reversements_rls" ON public.microfinance_reversements_agents;
CREATE POLICY "reversements_company_isolation" ON public.microfinance_reversements_agents
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- microfinance_tournees_clotures
ALTER TABLE public.microfinance_tournees_clotures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_tournees_clotures;
DROP POLICY IF EXISTS "tenant_isolation" ON public.microfinance_tournees_clotures;
CREATE POLICY "tournees_company_isolation" ON public.microfinance_tournees_clotures
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- microfinance_commissions_tmf
ALTER TABLE public.microfinance_commissions_tmf ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_commissions_tmf;
DROP POLICY IF EXISTS "tenant_isolation" ON public.microfinance_commissions_tmf;
CREATE POLICY "commissions_company_isolation" ON public.microfinance_commissions_tmf
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- microfinance_membres (lecture élargie)
ALTER TABLE public.microfinance_membres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_membres;
DROP POLICY IF EXISTS "membres_rls" ON public.microfinance_membres;
CREATE POLICY "membres_company_isolation" ON public.microfinance_membres
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. CHAMP adherent_id SUR microfinance_collectes_terrain (référence directe)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.microfinance_collectes_terrain
  ADD COLUMN IF NOT EXISTS adherent_id UUID REFERENCES public.microfinance_adherents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mf_collectes_adherent
  ON public.microfinance_collectes_terrain (company_id, adherent_id);


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. NOTIFICATION POSTGREST
-- ══════════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
