-- =============================================================================
-- GESTIO 229 SaaS — Migration M068 : Parc Matériels BTP & Maintenance Multisite
-- Modules étendus :
-- 1. Ordres de Réparation (OR) BTP & Affectation des Mécaniciens
-- 2. Suivi Logistique, Mouvements & Transferts Intersites
-- 3. Gestion Complète des Assurances, Échéances, Paiements & Sinistres Flotte
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. ORDRES DE RÉPARATION (OR) PARC MATÉRIEL BTP
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.btp_ordres_reparation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    numero_or VARCHAR(50) NOT NULL,
    date_ouverture TIMESTAMPTZ DEFAULT NOW(),
    site_id UUID REFERENCES public.btp_sites(id) ON DELETE SET NULL,
    chantier_id UUID REFERENCES public.btp_chantiers(id) ON DELETE SET NULL,
    materiel_id UUID NOT NULL REFERENCES public.btp_materiels(id) ON DELETE CASCADE,
    code_materiel VARCHAR(50),
    immatriculation VARCHAR(50),
    marque VARCHAR(100),
    modele VARCHAR(100),
    numero_serie VARCHAR(100),
    compteur_valeur NUMERIC(12,1) DEFAULT 0,
    demandeur_nom VARCHAR(150),
    description_panne TEXT NOT NULL,
    symptomes_constates TEXT,
    priorite VARCHAR(20) DEFAULT 'NORMALE', -- FAIBLE, NORMALE, ELEVEE, URGENTE
    type_intervention VARCHAR(40) DEFAULT 'CORRECTIVE', -- CORRECTIVE, PREVENTIVE, DIAGNOSTIC, REVISION, CONTROLE_TECHNIQUE
    diagnostic_mecanicien TEXT,
    travaux_a_effectuer TEXT,
    cout_previsionnel NUMERIC(15,2) DEFAULT 0,
    cout_reel_mo NUMERIC(15,2) DEFAULT 0,
    cout_reel_pieces NUMERIC(15,2) DEFAULT 0,
    cout_reel_consommables NUMERIC(15,2) DEFAULT 0,
    cout_reel_sous_traitance NUMERIC(15,2) DEFAULT 0,
    cout_reel_total NUMERIC(15,2) DEFAULT 0,
    date_debut_prevue TIMESTAMPTZ,
    date_fin_prevue TIMESTAMPTZ,
    date_debut_reelle TIMESTAMPTZ,
    date_fin_reelle TIMESTAMPTZ,
    statut VARCHAR(40) DEFAULT 'BROUILLON', -- BROUILLON, EN_ATTENTE_VALIDATION, VALIDE, MECANICIEN_AFFECTE, EN_DIAGNOSTIC, EN_COURS, ATTENTE_PIECES, VALIDATION_TECHNIQUE, REPARE, TEST_EFFECTUE, CLOTURE, ANNULE
    motif_annulation TEXT,
    essais_techniques_details TEXT,
    essais_reussis BOOLEAN DEFAULT FALSE,
    autorisation_remise_en_service BOOLEAN DEFAULT FALSE,
    valide_par VARCHAR(150),
    cloture_par VARCHAR(150),
    pieces_destockees BOOLEAN DEFAULT FALSE,
    documents JSONB DEFAULT '[]'::jsonb,
    observations TEXT,
    sinistre_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_or_comp_num 
    ON public.btp_ordres_reparation(company_id, numero_or);
CREATE INDEX IF NOT EXISTS idx_btp_or_mat_statut 
    ON public.btp_ordres_reparation(company_id, materiel_id, statut);
CREATE INDEX IF NOT EXISTS idx_btp_or_site 
    ON public.btp_ordres_reparation(company_id, site_id);

-- Affectation des Mécaniciens aux Ordres de Réparation (Multi-mécaniciens avec historique complet)
CREATE TABLE IF NOT EXISTS public.btp_reparation_mecaniciens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    ordre_id UUID NOT NULL REFERENCES public.btp_ordres_reparation(id) ON DELETE CASCADE,
    mecanicien_id UUID REFERENCES public.garage_mecaniciens(id) ON DELETE SET NULL,
    nom_mecanicien VARCHAR(150) NOT NULL,
    specialite VARCHAR(100) DEFAULT 'Mécanique générale',
    fonction_intervention VARCHAR(150) DEFAULT 'Intervenant principal',
    date_affectation TIMESTAMPTZ DEFAULT NOW(),
    date_debut_travail TIMESTAMPTZ,
    date_fin_travail TIMESTAMPTZ,
    temps_prevu_heures NUMERIC(6,2) DEFAULT 0,
    temps_reel_heures NUMERIC(6,2) DEFAULT 0,
    taches_attribuees TEXT,
    compte_rendu TEXT,
    difficultes_rencontrees TEXT,
    statut_tache VARCHAR(30) DEFAULT 'EN_ATTENTE', -- EN_ATTENTE, EN_COURS, TERMINE, SUSPENDU
    observations_chef_atelier TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_rep_mec_ordre 
    ON public.btp_reparation_mecaniciens(company_id, ordre_id);

-- Pièces Prévues & Consommées avec Traçabilité Stock
CREATE TABLE IF NOT EXISTS public.btp_reparation_pieces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    ordre_id UUID NOT NULL REFERENCES public.btp_ordres_reparation(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    reference VARCHAR(100),
    designation TEXT NOT NULL,
    quantite_prevue NUMERIC(10,2) DEFAULT 1,
    quantite_utilisee NUMERIC(10,2) DEFAULT 0,
    prix_unitaire_ht NUMERIC(15,2) DEFAULT 0,
    cout_total_ht NUMERIC(15,2) DEFAULT 0,
    est_destocke BOOLEAN DEFAULT FALSE,
    date_sortie_stock TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_rep_pieces_ordre 
    ON public.btp_reparation_pieces(ordre_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. GESTION DES ASSURANCES DU PARC BTP & CONTRATS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.btp_assurances_contrats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    numero_contrat VARCHAR(100) NOT NULL,
    compagnie_assurance VARCHAR(150) NOT NULL,
    courtier_intermediaire VARCHAR(150),
    type_assurance VARCHAR(100) NOT NULL DEFAULT 'Tous Risques Engins BTP',
    engins_couverts JSONB DEFAULT '[]'::jsonb, -- tableau d'IDs ou codes d'engins
    garanties_souscrites TEXT,
    plafond_garantie NUMERIC(15,2) DEFAULT 0,
    franchise NUMERIC(15,2) DEFAULT 0,
    date_souscription DATE DEFAULT CURRENT_DATE,
    date_prise_effet DATE DEFAULT CURRENT_DATE,
    date_expiration DATE NOT NULL,
    montant_prime_annuelle NUMERIC(15,2) NOT NULL DEFAULT 0,
    frequence_paiement VARCHAR(30) DEFAULT 'ANNUELLE', -- ANNUELLE, SEMESTRIELLE, TRIMESTRIELLE, MENSUELLE
    statut VARCHAR(30) DEFAULT 'ACTIF', -- EN_PREPARATION, EN_ATTENTE_VALIDATION, ACTIF, ECHEANCE_PROCHE, PAIEMENT_EN_ATTENTE, EXPIRE, RESILIE
    delai_alerte_jours INTEGER DEFAULT 30,
    montant_total_paye NUMERIC(15,2) DEFAULT 0,
    solde_restant NUMERIC(15,2) DEFAULT 0,
    contact_assureur TEXT,
    documents JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_ass_contrat_comp 
    ON public.btp_assurances_contrats(company_id, statut);
CREATE INDEX IF NOT EXISTS idx_btp_ass_contrat_exp 
    ON public.btp_assurances_contrats(company_id, date_expiration);

-- Paiements des Primes d'Assurance
CREATE TABLE IF NOT EXISTS public.btp_assurances_paiements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    contrat_id UUID NOT NULL REFERENCES public.btp_assurances_contrats(id) ON DELETE CASCADE,
    echeance_label VARCHAR(100),
    montant_du NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_paye NUMERIC(15,2) NOT NULL DEFAULT 0,
    solde_echeance NUMERIC(15,2) DEFAULT 0,
    date_paiement DATE DEFAULT CURRENT_DATE,
    mode_paiement VARCHAR(50) DEFAULT 'Virement',
    reference_transaction VARCHAR(100),
    statut_validation VARCHAR(30) DEFAULT 'VALIDE',
    utilisateur_nom VARCHAR(150),
    justificatif_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_ass_paiement_contrat 
    ON public.btp_assurances_paiements(company_id, contrat_id);

-- Registre des Sinistres BTP (Lié aux engins et aux ordres de réparation)
CREATE TABLE IF NOT EXISTS public.btp_sinistres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    numero_declaration VARCHAR(50) NOT NULL,
    contrat_id UUID REFERENCES public.btp_assurances_contrats(id) ON DELETE SET NULL,
    materiel_id UUID REFERENCES public.btp_materiels(id) ON DELETE SET NULL,
    ordre_reparation_id UUID REFERENCES public.btp_ordres_reparation(id) ON DELETE SET NULL,
    code_materiel VARCHAR(50),
    immatriculation VARCHAR(50),
    date_incident TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lieu_incident TEXT,
    description_faits TEXT NOT NULL,
    personnes_impliquees TEXT,
    responsable_declaration VARCHAR(150),
    reference_assureur VARCHAR(100),
    estimation_dommages NUMERIC(15,2) DEFAULT 0,
    montant_reclame NUMERIC(15,2) DEFAULT 0,
    franchise_applicable NUMERIC(15,2) DEFAULT 0,
    montant_propose_assureur NUMERIC(15,2) DEFAULT 0,
    montant_indemnise NUMERIC(15,2) DEFAULT 0,
    statut VARCHAR(40) DEFAULT 'DECLARE', -- DECLARE, EN_COURS_CONSTITUTION, TRANSMIS_ASSUREUR, EN_EXPERTISE, ATTENTE_DECISION, ACCEPTE, INDEMNISE, CONTESTE, CLOTURE
    prise_en_charge_confirmee BOOLEAN DEFAULT FALSE,
    date_expertise DATE,
    date_accord DATE,
    date_indemnisation DATE,
    photos_justificatifs JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_sinistres_comp 
    ON public.btp_sinistres(company_id, statut);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. ACTIVATION RLS SUR TOUTES LES NOUVELLES TABLES
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    tbl text;
    new_btp_tables text[] := ARRAY[
        'btp_ordres_reparation',
        'btp_reparation_mecaniciens',
        'btp_reparation_pieces',
        'btp_assurances_contrats',
        'btp_assurances_paiements',
        'btp_sinistres'
    ];
BEGIN
    FOREACH tbl IN ARRAY new_btp_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        
        -- Authenticated full access
        EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', tbl);
        
        -- Service role full access
        EXECUTE format('DROP POLICY IF EXISTS "Allow service role full access" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow service role full access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', tbl);
        
        -- Anon full access
        EXECUTE format('DROP POLICY IF EXISTS "Allow anon full access" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow anon full access" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;
