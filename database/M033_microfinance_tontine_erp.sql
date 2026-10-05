-- =============================================================================
-- GESTIO 229 SaaS — M033 : ERP Spécialisé Microfinance, Épargne & Tontine
-- =============================================================================
-- Migration exclusive pour le secteur : "microfinance"
-- Conforme aux directives UEMOA et à la loi n°2025-14 du 2 juillet 2025 (Bénin)
-- Isolation stricte : company_id + sector_slug = 'microfinance'
-- IDEMPOTENT, NON DESTRUCTIF & SÉCURISÉ CONTRE LES TABLES PRÉ-EXISTANTES
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- 0. GARANTIR EN TOUTE PRIORITÉ LA PRÉSENCE DE company_id ET sector_slug
--    SUR TOUTES LES TABLES (Évite l'erreur 42703 si les tables existaient déjà)
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Tables potentiellement préexistantes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'microfinance_membres') THEN
    ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
    ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'microfinance_comptes') THEN
    ALTER TABLE public.microfinance_comptes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
    ALTER TABLE public.microfinance_comptes ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'microfinance_credits') THEN
    ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
    ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tontine_cycles') THEN
    ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
    ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tontine_cotisations') THEN
    ALTER TABLE public.tontine_cotisations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
    ALTER TABLE public.tontine_cotisations ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'microfinance_agents') THEN
    ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
    ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 1. RÉPERTOIRE DES MEMBRES & FICHIER ADHÉRENTS (avec KYC / LBC-FT)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_membres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    numero_membre TEXT NOT NULL,
    civilite TEXT DEFAULT 'M.' CHECK (civilite IN ('M.', 'Mme', 'Mlle', 'Groupe', 'Entreprise')),
    nom_complet TEXT NOT NULL,
    sexe TEXT CHECK (sexe IN ('M', 'F', 'AUTRE')),
    date_naissance DATE,
    lieu_naissance TEXT,
    telephone TEXT NOT NULL,
    email TEXT,
    adresse TEXT,
    ville TEXT DEFAULT 'Cotonou',
    profession TEXT,
    secteur_activite TEXT,
    piece_identite_type TEXT DEFAULT 'CIP' CHECK (piece_identite_type IN ('CNI', 'CIP', 'PASSEPORT', 'PERMIS', 'RAVE', 'AUTRE')),
    piece_identite_numero TEXT,
    piece_expire_le DATE,
    ifu TEXT,
    personne_contact_nom TEXT,
    personne_contact_tel TEXT,
    beneficiaire_nom TEXT,
    beneficiaire_tel TEXT,
    kyc_statut TEXT NOT NULL DEFAULT 'COMPLET' CHECK (kyc_statut IN ('COMPLET', 'INCOMPLET', 'EN_ATTENTE', 'REJETE')),
    kyc_niveau_risque TEXT NOT NULL DEFAULT 'FAIBLE' CHECK (kyc_niveau_risque IN ('FAIBLE', 'MOYEN', 'ELEVE')),
    kyc_notes TEXT,
    agent_collecteur_id UUID,
    agent_collecteur_nom TEXT,
    solde_epargne_total NUMERIC(15,2) DEFAULT 0,
    encours_credit_total NUMERIC(15,2) DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'SUSPENDU', 'CONTENTIEUX', 'FERME')),
    date_adhesion DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Colonnes additionnelles rétro-compatibles
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS civilite TEXT DEFAULT 'M.';
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS sexe TEXT;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS date_naissance DATE;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS lieu_naissance TEXT;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS ville TEXT DEFAULT 'Cotonou';
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS profession TEXT;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS secteur_activite TEXT;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS piece_identite_type TEXT DEFAULT 'CIP';
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS piece_identite_numero TEXT;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS piece_expire_le DATE;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS ifu TEXT;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS personne_contact_nom TEXT;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS personne_contact_tel TEXT;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS beneficiaire_nom TEXT;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS beneficiaire_tel TEXT;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS kyc_statut TEXT DEFAULT 'COMPLET';
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS kyc_niveau_risque TEXT DEFAULT 'FAIBLE';
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS kyc_notes TEXT;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS agent_collecteur_id UUID;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS agent_collecteur_nom TEXT;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS solde_epargne_total NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS encours_credit_total NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.microfinance_membres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_membres;
CREATE POLICY "company_isolation" ON public.microfinance_membres FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


-- ══════════════════════════════════════════════════════════════════════════════
-- 2. COMPTES D'ÉPARGNE (Libre, Obligatoire, Tontine, Bloquée, Projet)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_comptes_epargne (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    numero_compte TEXT NOT NULL,
    membre_id UUID REFERENCES public.microfinance_membres(id) ON DELETE CASCADE,
    membre_nom TEXT NOT NULL,
    type_compte TEXT NOT NULL DEFAULT 'EPARGNE_LIBRE' CHECK (type_compte IN ('EPARGNE_LIBRE', 'EPARGNE_OBLIGATOIRE', 'EPARGNE_TONTINE', 'EPARGNE_PROJET', 'EPARGNE_BLOQUEE', 'DEPOT_A_TERME')),
    solde NUMERIC(15,2) NOT NULL DEFAULT 0,
    taux_remuneration NUMERIC(5,2) DEFAULT 0,
    date_ouverture DATE DEFAULT CURRENT_DATE,
    date_echeance DATE,
    agence TEXT DEFAULT 'Siège Principal',
    agent_assigne TEXT,
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'BLOQUE', 'CLOTURE')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_comptes_epargne ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_comptes_epargne ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_comptes_epargne ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.microfinance_comptes_epargne ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.microfinance_comptes_epargne ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_comptes_epargne;
CREATE POLICY "company_isolation" ON public.microfinance_comptes_epargne FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


-- ══════════════════════════════════════════════════════════════════════════════
-- 3. OPÉRATIONS D'ÉPARGNE (Dépôts, Retraits, Reçus traçables)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_epargne_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT UNIQUE DEFAULT concat('OP-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    compte_id UUID REFERENCES public.microfinance_comptes_epargne(id) ON DELETE CASCADE,
    numero_compte TEXT NOT NULL,
    membre_id UUID REFERENCES public.microfinance_membres(id) ON DELETE SET NULL,
    membre_nom TEXT NOT NULL,
    type_operation TEXT NOT NULL CHECK (type_operation IN ('DEPOT', 'RETRAIT', 'VIREMENT_INTERNE', 'INTERET_CREDITE', 'FRAIS_GESTION')),
    montant NUMERIC(15,2) NOT NULL,
    frais_operation NUMERIC(15,2) DEFAULT 0,
    solde_avant NUMERIC(15,2) DEFAULT 0,
    solde_apres NUMERIC(15,2) DEFAULT 0,
    mode_reglement TEXT DEFAULT 'ESPECES' CHECK (mode_reglement IN ('ESPECES', 'MOBILE_MONEY', 'VIREMENT_BANCAIRE', 'COMPTE_A_COMPTE', 'COLLECTEUR')),
    agent_nom TEXT DEFAULT 'Guichet Caisse',
    caisse_nom TEXT DEFAULT 'Caisse Principale',
    observation TEXT,
    date_operation TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_epargne_operations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_epargne_operations ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_epargne_operations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.microfinance_epargne_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_epargne_operations;
CREATE POLICY "company_isolation" ON public.microfinance_epargne_operations FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


-- ══════════════════════════════════════════════════════════════════════════════
-- 4. DOSSIERS DE CRÉDIT & PORTEFEUILLE PRÊTS (Workflow complet)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT UNIQUE DEFAULT concat('CRD-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    membre_id UUID REFERENCES public.microfinance_membres(id) ON DELETE CASCADE,
    membre_nom TEXT NOT NULL,
    membre_tel TEXT,
    activite_financee TEXT,
    objet_credit TEXT NOT NULL,
    montant_demande NUMERIC(15,2) NOT NULL,
    montant_accorde NUMERIC(15,2) NOT NULL,
    duree_mois INT NOT NULL DEFAULT 12,
    periodicite TEXT NOT NULL DEFAULT 'MENSUELLE' CHECK (periodicite IN ('MENSUELLE', 'HEBDOMADAIRE', 'JOURNALIERE', 'QUINDENAIRE')),
    taux_interet NUMERIC(5,2) NOT NULL DEFAULT 12,
    montant_interet NUMERIC(15,2) NOT NULL DEFAULT 0,
    frais_dossier NUMERIC(15,2) DEFAULT 0,
    montant_total_du NUMERIC(15,2) NOT NULL,
    montant_rembourse NUMERIC(15,2) DEFAULT 0,
    solde_restant NUMERIC(15,2) NOT NULL,
    garanties TEXT,
    caution_nom TEXT,
    caution_tel TEXT,
    statut TEXT NOT NULL DEFAULT 'DEMANDE' CHECK (statut IN ('DEMANDE', 'ANALYSE', 'VALIDE', 'APPROUVE', 'DECAISSE', 'EN_COURS', 'SOLDE', 'EN_RETARD', 'CONTENTIEUX', 'REJETE')),
    date_demande DATE DEFAULT CURRENT_DATE,
    date_approbation DATE,
    date_decaissement DATE,
    date_echeance_finale DATE,
    agent_credit_nom TEXT,
    valide_par TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rétrocompatibilité : Ajout des colonnes au cas où la table existait dans un ancien schéma
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS membre_id UUID;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS membre_nom TEXT;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS membre_tel TEXT;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS activite_financee TEXT;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS objet_credit TEXT;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS montant_demande NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS montant_accorde NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS duree_mois INT DEFAULT 12;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS periodicite TEXT DEFAULT 'MENSUELLE';
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS taux_interet NUMERIC(5,2) DEFAULT 12;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS montant_interet NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS frais_dossier NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS montant_total_du NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS montant_rembourse NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS solde_restant NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS garanties TEXT;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS caution_nom TEXT;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS caution_tel TEXT;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS date_demande DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS date_approbation DATE;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS date_decaissement DATE;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS date_echeance_finale DATE;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS agent_credit_nom TEXT;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS valide_par TEXT;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.microfinance_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_credits;
CREATE POLICY "company_isolation" ON public.microfinance_credits FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


-- ══════════════════════════════════════════════════════════════════════════════
-- 5. ÉCHÉANCIERS DÉTAILLÉS & REMBOURSEMENTS PARTIELS / COMPLETS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_credit_echeances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    credit_id UUID REFERENCES public.microfinance_credits(id) ON DELETE CASCADE,
    credit_ref TEXT NOT NULL,
    membre_id UUID REFERENCES public.microfinance_membres(id) ON DELETE SET NULL,
    membre_nom TEXT NOT NULL,
    numero_echeance INT NOT NULL,
    date_echeance DATE NOT NULL,
    part_principal NUMERIC(15,2) NOT NULL,
    part_interet NUMERIC(15,2) NOT NULL,
    part_frais NUMERIC(15,2) DEFAULT 0,
    montant_total NUMERIC(15,2) NOT NULL,
    montant_paye NUMERIC(15,2) DEFAULT 0,
    solde_echeance NUMERIC(15,2) NOT NULL,
    date_paiement DATE,
    jours_retard INT DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'A_VENIR' CHECK (statut IN ('A_VENIR', 'ECHUE', 'PARTIELLEMENT_PAYEE', 'PAYEE', 'EN_RETARD', 'IMPAYEE')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_credit_echeances ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_credit_echeances ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_credit_echeances ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.microfinance_credit_echeances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_credit_echeances;
CREATE POLICY "company_isolation" ON public.microfinance_credit_echeances FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


CREATE TABLE IF NOT EXISTS public.microfinance_credit_remboursements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT UNIQUE DEFAULT concat('REM-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    credit_id UUID REFERENCES public.microfinance_credits(id) ON DELETE CASCADE,
    credit_ref TEXT NOT NULL,
    echeance_id UUID REFERENCES public.microfinance_credit_echeances(id) ON DELETE SET NULL,
    membre_id UUID REFERENCES public.microfinance_membres(id) ON DELETE SET NULL,
    membre_nom TEXT NOT NULL,
    montant_verse NUMERIC(15,2) NOT NULL,
    ventilation_principal NUMERIC(15,2) DEFAULT 0,
    ventilation_interet NUMERIC(15,2) DEFAULT 0,
    ventilation_penalite NUMERIC(15,2) DEFAULT 0,
    ventilation_frais NUMERIC(15,2) DEFAULT 0,
    mode_paiement TEXT DEFAULT 'ESPECES' CHECK (mode_paiement IN ('ESPECES', 'MOBILE_MONEY', 'VIREMENT', 'COLLECTEUR')),
    recu_par TEXT DEFAULT 'Caissier',
    date_remboursement TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_credit_remboursements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_credit_remboursements ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_credit_remboursements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.microfinance_credit_remboursements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_credit_remboursements;
CREATE POLICY "company_isolation" ON public.microfinance_credit_remboursements FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


-- ══════════════════════════════════════════════════════════════════════════════
-- 6. TONTINE & COLLECTES (Groupes, Cycles, Cotisations, Décaissements)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.tontine_groupes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    code_groupe TEXT NOT NULL,
    nom_groupe TEXT NOT NULL,
    responsable_nom TEXT NOT NULL,
    responsable_tel TEXT,
    periodicite TEXT NOT NULL DEFAULT 'QUOTIDIENNE' CHECK (periodicite IN ('QUOTIDIENNE', 'HEBDOMADAIRE', 'MENSUELLE')),
    montant_mise NUMERIC(15,2) NOT NULL,
    nb_membres_max INT DEFAULT 12,
    date_creation DATE DEFAULT CURRENT_DATE,
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'EN_FORMATION', 'CLOTURE')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tontine_groupes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tontine_groupes ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.tontine_groupes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.tontine_groupes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.tontine_groupes;
CREATE POLICY "company_isolation" ON public.tontine_groupes FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


CREATE TABLE IF NOT EXISTS public.tontine_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    groupe_id UUID REFERENCES public.tontine_groupes(id) ON DELETE CASCADE,
    groupe_nom TEXT NOT NULL,
    numero_cycle INT DEFAULT 1,
    date_debut DATE NOT NULL DEFAULT CURRENT_DATE,
    date_fin DATE,
    montant_mise NUMERIC(15,2) NOT NULL,
    cagnotte_par_tour NUMERIC(15,2) NOT NULL,
    tour_actuel INT DEFAULT 1,
    nb_tours_total INT DEFAULT 12,
    montant_collecte_cumul NUMERIC(15,2) DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'EN_COURS' CHECK (statut IN ('EN_COURS', 'CLOTURE', 'PLANIFIE')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rétrocompatibilité : Ajout des colonnes au cas où tontine_cycles existait déjà
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS groupe_id UUID;
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS groupe_nom TEXT;
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS numero_cycle INT DEFAULT 1;
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS date_fin DATE;
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS montant_mise NUMERIC(15,2) DEFAULT 1000;
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS cagnotte_par_tour NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS tour_actuel INT DEFAULT 1;
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS nb_tours_total INT DEFAULT 12;
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS montant_collecte_cumul NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.tontine_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.tontine_cycles;
CREATE POLICY "company_isolation" ON public.tontine_cycles FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


CREATE TABLE IF NOT EXISTS public.tontine_cotisations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT UNIQUE DEFAULT concat('COT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    cycle_id UUID REFERENCES public.tontine_cycles(id) ON DELETE CASCADE,
    groupe_id UUID REFERENCES public.tontine_groupes(id) ON DELETE SET NULL,
    membre_id UUID REFERENCES public.microfinance_membres(id) ON DELETE SET NULL,
    membre_nom TEXT NOT NULL,
    date_cotisation DATE DEFAULT CURRENT_DATE,
    montant NUMERIC(15,2) NOT NULL,
    tour_numero INT DEFAULT 1,
    statut TEXT NOT NULL DEFAULT 'PAYE' CHECK (statut IN ('PAYE', 'EN_ATTENTE', 'RETARD')),
    agent_collecteur_nom TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rétrocompatibilité : Ajout des colonnes si tontine_cotisations existait déjà
ALTER TABLE public.tontine_cotisations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tontine_cotisations ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.tontine_cotisations ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.tontine_cotisations ADD COLUMN IF NOT EXISTS groupe_id UUID;
ALTER TABLE public.tontine_cotisations ADD COLUMN IF NOT EXISTS membre_id UUID;
ALTER TABLE public.tontine_cotisations ADD COLUMN IF NOT EXISTS membre_nom TEXT;
ALTER TABLE public.tontine_cotisations ADD COLUMN IF NOT EXISTS tour_numero INT DEFAULT 1;
ALTER TABLE public.tontine_cotisations ADD COLUMN IF NOT EXISTS agent_collecteur_nom TEXT;
ALTER TABLE public.tontine_cotisations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.tontine_cotisations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.tontine_cotisations;
CREATE POLICY "company_isolation" ON public.tontine_cotisations FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


CREATE TABLE IF NOT EXISTS public.tontine_decaissements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT UNIQUE DEFAULT concat('TDEC-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    cycle_id UUID REFERENCES public.tontine_cycles(id) ON DELETE CASCADE,
    groupe_id UUID REFERENCES public.tontine_groupes(id) ON DELETE SET NULL,
    beneficiaire_id UUID REFERENCES public.microfinance_membres(id) ON DELETE SET NULL,
    beneficiaire_nom TEXT NOT NULL,
    tour_numero INT NOT NULL,
    montant_brut NUMERIC(15,2) NOT NULL,
    deductions_penalites NUMERIC(15,2) DEFAULT 0,
    montant_net_verse NUMERIC(15,2) NOT NULL,
    date_versement DATE DEFAULT CURRENT_DATE,
    valide_par TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tontine_decaissements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tontine_decaissements ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.tontine_decaissements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.tontine_decaissements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.tontine_decaissements;
CREATE POLICY "company_isolation" ON public.tontine_decaissements FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


-- ══════════════════════════════════════════════════════════════════════════════
-- 7. AGENTS COLLECTEURS TERRAIN, TOURNÉES & CONTRÔLE DES ESPÈCES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    matricule TEXT NOT NULL,
    nom_complet TEXT NOT NULL,
    telephone TEXT NOT NULL,
    email TEXT,
    zone_collecte TEXT NOT NULL,
    plafond_especes NUMERIC(15,2) DEFAULT 1000000,
    commission_taux_pct NUMERIC(5,2) DEFAULT 2,
    solde_especes_detenu NUMERIC(15,2) DEFAULT 0,
    total_collecte_jour NUMERIC(15,2) DEFAULT 0,
    nb_membres_actifs INT DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'CONGE', 'SUSPENDU', 'INACTIF')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS matricule TEXT;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS plafond_especes NUMERIC(15,2) DEFAULT 1000000;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS solde_especes_detenu NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS total_collecte_jour NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.microfinance_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_agents;
CREATE POLICY "company_isolation" ON public.microfinance_agents FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


CREATE TABLE IF NOT EXISTS public.microfinance_collectes_terrain (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT UNIQUE DEFAULT concat('COL-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    agent_id UUID REFERENCES public.microfinance_agents(id) ON DELETE CASCADE,
    agent_nom TEXT NOT NULL,
    membre_id UUID REFERENCES public.microfinance_membres(id) ON DELETE SET NULL,
    membre_nom TEXT NOT NULL,
    type_collecte TEXT NOT NULL CHECK (type_collecte IN ('EPARGNE', 'TONTINE', 'REMBOURSEMENT_CREDIT')),
    compte_id UUID,
    credit_id UUID,
    cycle_id UUID,
    montant NUMERIC(15,2) NOT NULL,
    date_collecte TIMESTAMPTZ DEFAULT NOW(),
    reversement_id UUID,
    statut_reversement TEXT DEFAULT 'NON_REVERSE' CHECK (statut_reversement IN ('NON_REVERSE', 'EN_ATTENTE_VALIDATION', 'REVERSE_VALIDE')),
    observation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_collectes_terrain ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.microfinance_collectes_terrain ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_collectes_terrain;
CREATE POLICY "company_isolation" ON public.microfinance_collectes_terrain FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


CREATE TABLE IF NOT EXISTS public.microfinance_reversements_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT UNIQUE DEFAULT concat('REV-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    agent_id UUID REFERENCES public.microfinance_agents(id) ON DELETE CASCADE,
    agent_nom TEXT NOT NULL,
    montant_declare NUMERIC(15,2) NOT NULL,
    montant_recu NUMERIC(15,2) DEFAULT 0,
    ecart NUMERIC(15,2) DEFAULT 0,
    date_declaration TIMESTAMPTZ DEFAULT NOW(),
    date_validation TIMESTAMPTZ,
    caissier_nom TEXT,
    statut TEXT NOT NULL DEFAULT 'DECLARE' CHECK (statut IN ('DECLARE', 'VALIDE', 'REJETE', 'AVEC_ECART')),
    observation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_reversements_agents ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_reversements_agents ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_reversements_agents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.microfinance_reversements_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_reversements_agents;
CREATE POLICY "company_isolation" ON public.microfinance_reversements_agents FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- Compatibilité rétroactive au cas où une table 'microfinance_reversements' existait déjà
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'microfinance_reversements') THEN
    ALTER TABLE public.microfinance_reversements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
    ALTER TABLE public.microfinance_reversements ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
    ALTER TABLE public.microfinance_reversements ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;


-- ══════════════════════════════════════════════════════════════════════════════
-- 8. RISQUES, LBC/FT/FP & CONFORMITÉ RÉGLEMENTAIRE (Loi 2025-14 Bénin)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_conformite_alertes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT UNIQUE DEFAULT concat('ALT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    type_alerte TEXT NOT NULL CHECK (type_alerte IN ('DEPASSEMENT_SEUIL_ESPECES', 'OPERATION_INHABITUELLE', 'PIECE_EXPIREE', 'RETARD_CRITIQUE_PAR', 'REVERSEMENT_TARDIF', 'SOUPCON_BLANCHIMENT')),
    gravite TEXT NOT NULL DEFAULT 'MOYENNE' CHECK (gravite IN ('FAIBLE', 'MOYENNE', 'CRITIQUE')),
    entite_type TEXT NOT NULL CHECK (entite_type IN ('MEMBRE', 'AGENT', 'CREDIT', 'TRANSACTION')),
    entite_id TEXT,
    entite_nom TEXT,
    description TEXT NOT NULL,
    montant_concerne NUMERIC(15,2) DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'OUVERTE' CHECK (statut IN ('OUVERTE', 'EN_COURS', 'RESOLUE', 'CLASSEE')),
    traite_par TEXT,
    date_alerte TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_conformite_alertes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_conformite_alertes ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_conformite_alertes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.microfinance_conformite_alertes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_conformite_alertes;
CREATE POLICY "company_isolation" ON public.microfinance_conformite_alertes FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


-- ══════════════════════════════════════════════════════════════════════════════
-- 9. DÉPENSES & ACHATS D'EXPLOITATION DE L'IMF
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_achats_exploitation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT UNIQUE DEFAULT concat('ACH-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    fournisseur_nom TEXT NOT NULL,
    fournisseur_tel TEXT,
    categorie TEXT NOT NULL CHECK (categorie IN ('Fournitures_Bureau', 'Loyer_Agence', 'Informatique_Logiciel', 'Carburant_Deplacements', 'Maintenance_Locaux', 'Honoraires_Prestations', 'Communication_Marketing', 'Autre')),
    description TEXT NOT NULL,
    montant_ttc NUMERIC(15,2) NOT NULL,
    mode_reglement TEXT DEFAULT 'ESPECES' CHECK (mode_reglement IN ('ESPECES', 'VIREMENT_BANCAIRE', 'CHEQUE', 'MOBILE_MONEY')),
    date_depense DATE DEFAULT CURRENT_DATE,
    piece_jointe_ref TEXT,
    statut_paiement TEXT DEFAULT 'PAYE' CHECK (statut_paiement IN ('PAYE', 'A_PAYER', 'PARTIEL')),
    engage_par TEXT NOT NULL,
    valide_par TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.microfinance_achats_exploitation ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_achats_exploitation ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_achats_exploitation ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.microfinance_achats_exploitation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_achats_exploitation;
CREATE POLICY "company_isolation" ON public.microfinance_achats_exploitation FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));


-- ══════════════════════════════════════════════════════════════════════════════
-- 10. INDEX DE RECHERCHE ET PERFORMANCE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_microfinance_membres_comp ON public.microfinance_membres(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_comptes_comp ON public.microfinance_comptes_epargne(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_epargne_ops_comp ON public.microfinance_epargne_operations(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_credits_comp ON public.microfinance_credits(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_echeances_comp ON public.microfinance_credit_echeances(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_remb_comp ON public.microfinance_credit_remboursements(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_tontine_groupes_comp ON public.tontine_groupes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_tontine_cycles_comp ON public.tontine_cycles(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_tontine_cotisations_comp ON public.tontine_cotisations(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_tontine_decaissements_comp ON public.tontine_decaissements(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_agents_comp ON public.microfinance_agents(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_collectes_comp ON public.microfinance_collectes_terrain(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_reversements_comp ON public.microfinance_reversements_agents(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_conformite_comp ON public.microfinance_conformite_alertes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_achats_comp ON public.microfinance_achats_exploitation(company_id, sector_slug);

-- FIN DE MIGRATION M033
