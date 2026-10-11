-- =============================================================================
-- GESTIO 229 SaaS — Migration M060 : Pack Collecte Terrain & Agents Collecteurs
-- =============================================================================
-- Cette migration CRÉE toutes les tables nécessaires pour le module Collecte Terrain
-- si elles n'existent pas encore dans Supabase, puis applique les RLS permissives.
-- 100% IDEMPOTENT et SANS DÉPENDANCES BLOQUANTES.
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. TABLE : microfinance_agents (Agents Collecteurs)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.microfinance_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    matricule TEXT NOT NULL,
    nom_complet TEXT NOT NULL,
    telephone TEXT NOT NULL,
    email TEXT,
    zone_collecte TEXT NOT NULL DEFAULT '',
    plafond_especes NUMERIC(15,2) DEFAULT 1000000,
    commission_taux_pct NUMERIC(5,2) DEFAULT 2,
    solde_especes_detenu NUMERIC(15,2) DEFAULT 0,
    total_collecte_jour NUMERIC(15,2) DEFAULT 0,
    nb_membres_actifs INT DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'ACTIF',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Colonnes de sécurité si la table existait déjà
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS matricule TEXT;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS nom_complet TEXT;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS telephone TEXT;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS zone_collecte TEXT DEFAULT '';
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS plafond_especes NUMERIC(15,2) DEFAULT 1000000;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS commission_taux_pct NUMERIC(5,2) DEFAULT 2;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS solde_especes_detenu NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS total_collecte_jour NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS nb_membres_actifs INT DEFAULT 0;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'ACTIF';
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_mf_agents_tenant ON public.microfinance_agents (company_id, sector_slug);


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. TABLE : microfinance_adherents (Adhérents & Cotisations)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.microfinance_adherents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    numero_adherent TEXT,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL DEFAULT '',
    telephone TEXT NOT NULL,
    telephone_alt TEXT,
    adresse TEXT,
    ville TEXT DEFAULT 'Cotonou',
    type_cotisation TEXT NOT NULL DEFAULT 'EPARGNE',
    montant_cotisation_habituel NUMERIC(15,2) DEFAULT 0,
    periodicite TEXT DEFAULT 'JOURNALIER',
    statut TEXT NOT NULL DEFAULT 'ACTIF',
    cree_par TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS numero_adherent TEXT;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS prenom TEXT DEFAULT '';
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS telephone_alt TEXT;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS adresse TEXT;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS ville TEXT DEFAULT 'Cotonou';
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS type_cotisation TEXT DEFAULT 'EPARGNE';
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS montant_cotisation_habituel NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS periodicite TEXT DEFAULT 'JOURNALIER';
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'ACTIF';
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS cree_par TEXT;
ALTER TABLE public.microfinance_adherents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_mf_adherents_tenant ON public.microfinance_adherents (company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_mf_adherents_tel ON public.microfinance_adherents (company_id, telephone);


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. TABLE : microfinance_affectations_agents (Liaison Agent <-> Adhérents)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.microfinance_affectations_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    agent_id UUID REFERENCES public.microfinance_agents(id) ON DELETE CASCADE,
    adherent_id UUID REFERENCES public.microfinance_adherents(id) ON DELETE CASCADE,
    ordre_tournee INT DEFAULT 0,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_affectations_agents ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.microfinance_affectations_agents ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_affectations_agents ADD COLUMN IF NOT EXISTS ordre_tournee INT DEFAULT 0;
ALTER TABLE public.microfinance_affectations_agents ADD COLUMN IF NOT EXISTS note TEXT;

CREATE INDEX IF NOT EXISTS idx_mf_aff_agent ON public.microfinance_affectations_agents (company_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_mf_aff_adherent ON public.microfinance_affectations_agents (company_id, adherent_id);


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. TABLE : microfinance_collectes_terrain (Pointages des collectes)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.microfinance_collectes_terrain (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT,
    agent_id UUID,
    agent_nom TEXT NOT NULL DEFAULT '',
    membre_id UUID,
    adherent_id UUID,
    membre_nom TEXT NOT NULL DEFAULT '',
    type_collecte TEXT NOT NULL DEFAULT 'EPARGNE',
    compte_id UUID,
    credit_id UUID,
    cycle_id UUID,
    montant NUMERIC(15,2) NOT NULL DEFAULT 0,
    date_collecte TIMESTAMPTZ DEFAULT NOW(),
    reversement_id UUID,
    statut_reversement TEXT DEFAULT 'NON_REVERSE',
    observation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS agent_nom TEXT DEFAULT '';
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS membre_id UUID;
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS adherent_id UUID;
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS membre_nom TEXT DEFAULT '';
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS type_collecte TEXT DEFAULT 'EPARGNE';
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS montant NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS date_collecte TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS statut_reversement TEXT DEFAULT 'NON_REVERSE';
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS observation TEXT;

CREATE INDEX IF NOT EXISTS idx_mf_col_tenant ON public.microfinance_collectes_terrain (company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_mf_col_agent ON public.microfinance_collectes_terrain (company_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_mf_col_adherent ON public.microfinance_collectes_terrain (company_id, adherent_id);


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. TABLE : microfinance_reversements_agents (Versements en Caisse)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.microfinance_reversements_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT,
    agent_id UUID,
    agent_nom TEXT NOT NULL DEFAULT '',
    montant_declare NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_recu NUMERIC(15,2) DEFAULT 0,
    ecart NUMERIC(15,2) DEFAULT 0,
    date_declaration TIMESTAMPTZ DEFAULT NOW(),
    date_validation TIMESTAMPTZ,
    caissier_nom TEXT,
    statut TEXT NOT NULL DEFAULT 'DECLARE',
    observation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_reversements_agents ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.microfinance_reversements_agents ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_reversements_agents ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.microfinance_reversements_agents ADD COLUMN IF NOT EXISTS agent_id UUID;
ALTER TABLE public.microfinance_reversements_agents ADD COLUMN IF NOT EXISTS agent_nom TEXT DEFAULT '';
ALTER TABLE public.microfinance_reversements_agents ADD COLUMN IF NOT EXISTS montant_declare NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_reversements_agents ADD COLUMN IF NOT EXISTS montant_recu NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_reversements_agents ADD COLUMN IF NOT EXISTS ecart NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_reversements_agents ADD COLUMN IF NOT EXISTS date_declaration TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.microfinance_reversements_agents ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'DECLARE';

CREATE INDEX IF NOT EXISTS idx_mf_rev_tenant ON public.microfinance_reversements_agents (company_id, sector_slug);


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. TABLE : microfinance_tournees_clotures (Clôtures journalières)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.microfinance_tournees_clotures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT,
    agent_id UUID,
    agent_nom TEXT NOT NULL DEFAULT '',
    date_tournee DATE DEFAULT CURRENT_DATE,
    zone_collecte TEXT,
    nb_membres_visites INT DEFAULT 0,
    nb_paiements INT DEFAULT 0,
    total_collecte NUMERIC(15,2) DEFAULT 0,
    commissions_agent NUMERIC(15,2) DEFAULT 0,
    montant_reverse_caisse NUMERIC(15,2) DEFAULT 0,
    ecart NUMERIC(15,2) DEFAULT 0,
    heure_cloture TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_tournees_clotures ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.microfinance_tournees_clotures ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';

CREATE INDEX IF NOT EXISTS idx_mf_clo_tenant ON public.microfinance_tournees_clotures (company_id, sector_slug);


-- ══════════════════════════════════════════════════════════════════════════════
-- 7. TABLE : microfinance_commissions_tmf (Commissions des agents)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.microfinance_commissions_tmf (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    agent_id UUID,
    agent_nom TEXT NOT NULL DEFAULT '',
    type_produit TEXT DEFAULT 'COLLECTE_JOUR',
    base_calcul NUMERIC(15,2) DEFAULT 0,
    taux_commission NUMERIC(5,2) DEFAULT 2,
    montant_commission NUMERIC(15,2) DEFAULT 0,
    statut_paiement TEXT DEFAULT 'A_PAYER',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_commissions_tmf ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.microfinance_commissions_tmf ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';

CREATE INDEX IF NOT EXISTS idx_mf_com_tenant ON public.microfinance_commissions_tmf (company_id, sector_slug);


-- ══════════════════════════════════════════════════════════════════════════════
-- 8. POLITIQUES RLS PERMISSIVES POUR TOUTES LES TABLES DU MODULE
--    (Autorise les utilisateurs connectés à lire et écrire sans blocage)
-- ══════════════════════════════════════════════════════════════════════════════

-- microfinance_agents
ALTER TABLE public.microfinance_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_auth_microfinance_agents" ON public.microfinance_agents;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_agents;
DROP POLICY IF EXISTS "agents_company_isolation" ON public.microfinance_agents;
CREATE POLICY "allow_auth_microfinance_agents" ON public.microfinance_agents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- microfinance_adherents
ALTER TABLE public.microfinance_adherents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_auth_microfinance_adherents" ON public.microfinance_adherents;
DROP POLICY IF EXISTS "adherents_company_isolation" ON public.microfinance_adherents;
CREATE POLICY "allow_auth_microfinance_adherents" ON public.microfinance_adherents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- microfinance_affectations_agents
ALTER TABLE public.microfinance_affectations_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_auth_microfinance_affectations" ON public.microfinance_affectations_agents;
DROP POLICY IF EXISTS "affectations_company_isolation" ON public.microfinance_affectations_agents;
CREATE POLICY "allow_auth_microfinance_affectations" ON public.microfinance_affectations_agents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- microfinance_collectes_terrain
ALTER TABLE public.microfinance_collectes_terrain ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_auth_microfinance_collectes" ON public.microfinance_collectes_terrain;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_collectes_terrain;
DROP POLICY IF EXISTS "collectes_company_isolation" ON public.microfinance_collectes_terrain;
CREATE POLICY "allow_auth_microfinance_collectes" ON public.microfinance_collectes_terrain
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- microfinance_reversements_agents
ALTER TABLE public.microfinance_reversements_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_auth_microfinance_reversements" ON public.microfinance_reversements_agents;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_reversements_agents;
DROP POLICY IF EXISTS "reversements_company_isolation" ON public.microfinance_reversements_agents;
CREATE POLICY "allow_auth_microfinance_reversements" ON public.microfinance_reversements_agents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- microfinance_tournees_clotures
ALTER TABLE public.microfinance_tournees_clotures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_auth_microfinance_tournees" ON public.microfinance_tournees_clotures;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_tournees_clotures;
DROP POLICY IF EXISTS "tournees_company_isolation" ON public.microfinance_tournees_clotures;
CREATE POLICY "allow_auth_microfinance_tournees" ON public.microfinance_tournees_clotures
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- microfinance_commissions_tmf
ALTER TABLE public.microfinance_commissions_tmf ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_auth_microfinance_commissions" ON public.microfinance_commissions_tmf;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_commissions_tmf;
DROP POLICY IF EXISTS "commissions_company_isolation" ON public.microfinance_commissions_tmf;
CREATE POLICY "allow_auth_microfinance_commissions" ON public.microfinance_commissions_tmf
  FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════════════════════
-- 9. RECHARGEMENT DU CACHE POSTGREST
-- ══════════════════════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';
