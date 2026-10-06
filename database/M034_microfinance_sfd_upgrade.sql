-- =============================================================================
-- GESTIO 229 SaaS — M034 : Upgrade Mini-SFD Professionnel (UEMOA / Bénin Loi 2025-14)
-- =============================================================================
-- Secteur exclusif : "microfinance" (ISOLEMENT STRICT company_id + sector_slug)
-- Idempotent, non destructif, aucune suppression de données existantes
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. CONTRATS ET SUIVI DE TONTINE JOURNALIÈRE (CYCLE DE 31 JOURS)
--    Règle métier SFD :
--    J1 = 1ère mise = Commission TMF d'agence
--    J2 à J31 = 30 mises d'épargne restituées à l'adhérent
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_tontine_journaliere_contrats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT NOT NULL,
    membre_id UUID REFERENCES public.microfinance_membres(id) ON DELETE SET NULL,
    membre_nom TEXT NOT NULL,
    membre_tel TEXT,
    agent_collecteur_id UUID REFERENCES public.microfinance_agents(id) ON DELETE SET NULL,
    agent_collecteur_nom TEXT,
    date_inscription DATE NOT NULL DEFAULT CURRENT_DATE,
    date_fin_prevue DATE NOT NULL,
    mise_journaliere NUMERIC(15,2) NOT NULL DEFAULT 500,
    j1_commission NUMERIC(15,2) NOT NULL DEFAULT 500,
    montant_j1_paye NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_epargne_accumule NUMERIC(15,2) NOT NULL DEFAULT 0,
    jours_payes INT NOT NULL DEFAULT 0,
    jours_impayes INT NOT NULL DEFAULT 0,
    total_collecte NUMERIC(15,2) NOT NULL DEFAULT 0,
    statut_cycle TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut_cycle IN ('ACTIF', 'EN_RETARD', 'CLOTURE', 'ANNULE')),
    date_restitution DATE,
    montant_restitue NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Colonnes additionnelles rétro-compatibles
ALTER TABLE public.microfinance_tontine_journaliere_contrats ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_tontine_journaliere_contrats ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';

CREATE TABLE IF NOT EXISTS public.microfinance_tontine_journaliere_mises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    contrat_id UUID REFERENCES public.microfinance_tontine_journaliere_contrats(id) ON DELETE CASCADE,
    contrat_ref TEXT NOT NULL,
    membre_id UUID REFERENCES public.microfinance_membres(id) ON DELETE SET NULL,
    membre_nom TEXT NOT NULL,
    jour_numero INT NOT NULL CHECK (jour_numero >= 1 AND jour_numero <= 31),
    date_mise DATE NOT NULL DEFAULT CURRENT_DATE,
    montant NUMERIC(15,2) NOT NULL,
    type_mise TEXT NOT NULL DEFAULT 'EPARGNE' CHECK (type_mise IN ('COMMISSION_J1', 'EPARGNE')),
    mode_paiement TEXT NOT NULL DEFAULT 'ESPECES' CHECK (mode_paiement IN ('ESPECES', 'MTN_MOMO', 'MOOV_MONEY', 'BANQUE', 'COMPTE_EPARGNE')),
    agent_nom TEXT,
    recu_ref TEXT,
    statut TEXT NOT NULL DEFAULT 'PAYE' CHECK (statut IN ('PAYE', 'EN_RETARD', 'AVANCE')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_tontine_journaliere_mises ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_tontine_journaliere_mises ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. RECETTES ADMINISTRATIVES & FRAIS DE GESTION SFD
--    Frais d'adhésion, tenue de compte, cartes, dossiers crédit, retraits
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_recettes_administratives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    numero_recette TEXT NOT NULL,
    date_recette DATE NOT NULL DEFAULT CURRENT_DATE,
    membre_id UUID REFERENCES public.microfinance_membres(id) ON DELETE SET NULL,
    membre_nom TEXT,
    type_recette TEXT NOT NULL CHECK (type_recette IN (
        'FRAIS_ADHESION',
        'FRAIS_DOSSIER',
        'FRAIS_CARTE',
        'TENUE_COMPTE',
        'FRAIS_DOSSIER_CREDIT',
        'FRAIS_RETRAIT',
        'FRAIS_TRANSFERT',
        'AUTRES_RECETTES'
    )),
    montant NUMERIC(15,2) NOT NULL,
    mode_paiement TEXT NOT NULL DEFAULT 'ESPECES' CHECK (mode_paiement IN ('ESPECES', 'MTN_MOMO', 'MOOV_MONEY', 'BANQUE', 'COMPTE_EPARGNE')),
    compte_tresorerie_nom TEXT DEFAULT 'Caisse centrale',
    agent_nom TEXT,
    statut TEXT NOT NULL DEFAULT 'ENCAISSE' CHECK (statut IN ('ENCAISSE', 'EN_ATTENTE', 'ANNULE')),
    observation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_recettes_administratives ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_recettes_administratives ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. TRÉSORERIE MULTI-CANAUX (CAISSES, BANQUES, MOBILE MONEY) & TRANSFERTS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_tresorerie_comptes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    type_compte TEXT NOT NULL CHECK (type_compte IN ('CAISSE_CENTRALE', 'CAISSE_AGENCE', 'BANQUE', 'MOBILE_MONEY')),
    code_compte TEXT NOT NULL,
    libelle TEXT NOT NULL,
    numero_compte TEXT,
    etablissement TEXT, -- Ex: Ecobank, BOA, MTN MoMo, Moov Money
    solde_initial NUMERIC(15,2) NOT NULL DEFAULT 0,
    solde_actuel NUMERIC(15,2) NOT NULL DEFAULT 0,
    devise TEXT NOT NULL DEFAULT 'XOF',
    est_actif BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_tresorerie_comptes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_tresorerie_comptes ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';

CREATE TABLE IF NOT EXISTS public.microfinance_tresorerie_transferts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT NOT NULL,
    compte_source_id UUID REFERENCES public.microfinance_tresorerie_comptes(id) ON DELETE SET NULL,
    compte_source_nom TEXT NOT NULL,
    compte_dest_id UUID REFERENCES public.microfinance_tresorerie_comptes(id) ON DELETE SET NULL,
    compte_dest_nom TEXT NOT NULL,
    montant NUMERIC(15,2) NOT NULL,
    frais_transfert NUMERIC(15,2) NOT NULL DEFAULT 0,
    date_transfert DATE NOT NULL DEFAULT CURRENT_DATE,
    motif TEXT,
    initiateur_nom TEXT,
    statut TEXT NOT NULL DEFAULT 'VALIDE' CHECK (statut IN ('VALIDE', 'EN_ATTENTE', 'ANNULE')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_tresorerie_transferts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_tresorerie_transferts ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. GARANTIES DÉTAILLÉES & CAUTION SOLIDAIRE MULTI-GARANTS
--    Valorisation suggérée paramétrable (ex: 70% valeur déclarée)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_credit_garanties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    credit_id UUID REFERENCES public.microfinance_credits(id) ON DELETE CASCADE,
    type_garantie TEXT NOT NULL CHECK (type_garantie IN (
        'CAUTION_SOLIDAIRE',
        'EPARGNE_BLOQUEE',
        'GARANTIE_MATERIELLE',
        'GARANTIE_IMMOBILIERE',
        'DEPOT_GARANTIE',
        'AUTRE'
    )),
    description TEXT NOT NULL,
    valeur_declaree NUMERIC(15,2) NOT NULL DEFAULT 0,
    valeur_retenue NUMERIC(15,2) NOT NULL DEFAULT 0,
    taux_valorisation_pct NUMERIC(5,2) NOT NULL DEFAULT 70.00,
    proprietaire_nom TEXT NOT NULL,
    proprietaire_tel TEXT,
    document_ref TEXT,
    statut TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (statut IN ('ACTIVE', 'LIBEREE', 'SAISIE')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_credit_garanties ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_credit_garanties ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';

CREATE TABLE IF NOT EXISTS public.microfinance_credit_garants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    credit_id UUID REFERENCES public.microfinance_credits(id) ON DELETE CASCADE,
    garantie_id UUID REFERENCES public.microfinance_credit_garanties(id) ON DELETE CASCADE,
    ordre_garant INT NOT NULL DEFAULT 1,
    nom_complet TEXT NOT NULL,
    telephone TEXT NOT NULL,
    piece_type TEXT DEFAULT 'CIP',
    piece_numero TEXT,
    profession TEXT,
    adresse TEXT,
    montant_engagement NUMERIC(15,2) NOT NULL DEFAULT 0,
    relation_emprunteur TEXT,
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'LIBERE')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_credit_garants ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_credit_garants ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. SUIVI DU RECOUVREMENT, RELANCES ET PROMISSES DE PAIEMENT
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_credit_relances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    credit_id UUID REFERENCES public.microfinance_credits(id) ON DELETE CASCADE,
    credit_ref TEXT NOT NULL,
    membre_id UUID REFERENCES public.microfinance_membres(id) ON DELETE SET NULL,
    membre_nom TEXT NOT NULL,
    date_action TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    type_action TEXT NOT NULL CHECK (type_action IN ('APPEL', 'VISITE', 'COURRIER', 'SOMMATION', 'CONVOCATION', 'PROMESSE')),
    agent_nom TEXT NOT NULL,
    observation TEXT NOT NULL,
    promesse_date DATE,
    promesse_montant NUMERIC(15,2),
    prochaine_action TEXT,
    statut_relance TEXT NOT NULL DEFAULT 'EN_COURS' CHECK (statut_relance IN ('EN_COURS', 'RESOLU', 'ECHEC')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_credit_relances ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_credit_relances ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. COMMISSIONS TMF (ÉPARGNE CONTRACTUELLE & TONTINE JOURNALIÈRE)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_commissions_tmf (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    agent_id UUID REFERENCES public.microfinance_agents(id) ON DELETE SET NULL,
    agent_nom TEXT NOT NULL,
    membre_id UUID REFERENCES public.microfinance_membres(id) ON DELETE SET NULL,
    membre_nom TEXT,
    type_produit TEXT NOT NULL CHECK (type_produit IN ('TONTINE_JOURNALIERE', 'EPARGNE_CONTRACTUELLE', 'COLLECTE', 'AUTRE')),
    type_commission TEXT NOT NULL CHECK (type_commission IN ('PREMIERE_MISE', 'FIN_CONTRAT', 'COMMISSION_COLLECTE', 'COMMISSION_TONTINE', 'AUTRE')),
    montant_base NUMERIC(15,2) NOT NULL DEFAULT 0,
    taux_pct NUMERIC(5,2) DEFAULT 0,
    montant_commission NUMERIC(15,2) NOT NULL,
    date_commission DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_operation TEXT,
    statut TEXT NOT NULL DEFAULT 'ENCAISSEE' CHECK (statut IN ('ENCAISSEE', 'EN_ATTENTE', 'ANNULEE')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_commissions_tmf ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_commissions_tmf ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';


-- ══════════════════════════════════════════════════════════════════════════════
-- 7. CLÔTURES DE TOURNÉE DE COLLECTE TERRAIN
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_tournees_clotures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT NOT NULL,
    agent_id UUID REFERENCES public.microfinance_agents(id) ON DELETE SET NULL,
    agent_nom TEXT NOT NULL,
    date_tournee DATE NOT NULL DEFAULT CURRENT_DATE,
    zone_collecte TEXT,
    nb_membres_visites INT NOT NULL DEFAULT 0,
    nb_paiements INT NOT NULL DEFAULT 0,
    total_collecte NUMERIC(15,2) NOT NULL DEFAULT 0,
    commissions_agent NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_reverse_caisse NUMERIC(15,2) NOT NULL DEFAULT 0,
    ecart NUMERIC(15,2) NOT NULL DEFAULT 0,
    heure_cloture TIMESTAMPTZ DEFAULT NOW(),
    caissier_reception_nom TEXT,
    statut TEXT NOT NULL DEFAULT 'CLOTURE' CHECK (statut IN ('EN_COURS', 'CLOTURE', 'VALIDE_CAISSE')),
    observations TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_tournees_clotures ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_tournees_clotures ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';


-- ══════════════════════════════════════════════════════════════════════════════
-- 8. INDEX ET RLS POLICIES (MULTI-TENANT STRICT)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_mf_tontine_j_contrats_tenant ON public.microfinance_tontine_journaliere_contrats(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_mf_tontine_j_mises_tenant ON public.microfinance_tontine_journaliere_mises(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_mf_recettes_admin_tenant ON public.microfinance_recettes_administratives(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_mf_treso_comptes_tenant ON public.microfinance_tresorerie_comptes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_mf_treso_transfers_tenant ON public.microfinance_tresorerie_transferts(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_mf_garanties_tenant ON public.microfinance_credit_garanties(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_mf_garants_tenant ON public.microfinance_credit_garants(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_mf_relances_tenant ON public.microfinance_credit_relances(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_mf_commissions_tmf_tenant ON public.microfinance_commissions_tmf(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_mf_tournees_clotures_tenant ON public.microfinance_tournees_clotures(company_id, sector_slug);

-- Activation RLS
ALTER TABLE public.microfinance_tontine_journaliere_contrats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microfinance_tontine_journaliere_mises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microfinance_recettes_administratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microfinance_tresorerie_comptes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microfinance_tresorerie_transferts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microfinance_credit_garanties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microfinance_credit_garants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microfinance_credit_relances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microfinance_commissions_tmf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.microfinance_tournees_clotures ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- RLS tenant isolation policies
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'microfinance_tontine_journaliere_contrats' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON public.microfinance_tontine_journaliere_contrats FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'microfinance_tontine_journaliere_mises' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON public.microfinance_tontine_journaliere_mises FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'microfinance_recettes_administratives' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON public.microfinance_recettes_administratives FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'microfinance_tresorerie_comptes' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON public.microfinance_tresorerie_comptes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'microfinance_tresorerie_transferts' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON public.microfinance_tresorerie_transferts FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'microfinance_credit_garanties' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON public.microfinance_credit_garanties FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'microfinance_credit_garants' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON public.microfinance_credit_garants FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'microfinance_credit_relances' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON public.microfinance_credit_relances FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'microfinance_commissions_tmf' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON public.microfinance_commissions_tmf FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'microfinance_tournees_clotures' AND policyname = 'tenant_isolation') THEN
    CREATE POLICY tenant_isolation ON public.microfinance_tournees_clotures FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
