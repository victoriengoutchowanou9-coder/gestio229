-- =============================================================================
-- GESTIO 229 SaaS — SECTEUR GESTION LOCATIVE & IMMOBILIÈRE (PRO UPGRADE)
-- Fichier : database/M057_gestion_locative_immobiliere_complete.sql
-- Conforme : SYSCOHADA Révisé, Normes Immobilières UEMOA / Bénin
-- Isolation stricte par company_id, secteur_id et sector_slug ('immobilier' / 'location')
-- =============================================================================

-- ─── 1. TABLE PROPRIÉTAIRES (Bailleurs) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_proprietaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    secteur_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'immobilier',
    nom_complet TEXT NOT NULL,
    telephone TEXT NOT NULL,
    email TEXT,
    cni_numero TEXT,
    adresse TEXT,
    ville TEXT DEFAULT 'Cotonou',
    banque_nom TEXT,
    rib_iban TEXT,
    mode_reversement TEXT DEFAULT 'Virement', -- Virement, Cheque, Especes, MoMo
    notes TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loc_proprios_c_s ON public.location_proprietaires(company_id, sector_slug);
ALTER TABLE public.location_proprietaires ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_proprios" ON public.location_proprietaires;
CREATE POLICY "allow_all_proprios" ON public.location_proprietaires FOR ALL USING (true) WITH CHECK (true);


-- ─── 2. TABLE BIENS / LOGEMENTS (Enrichissement et rétrocompatibilité) ─────────
-- Table existante : location_biens. On ajoute les colonnes parent-enfant et gestion avancée
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS secteur_id UUID;
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS immeuble_parent_id UUID;
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS proprietaire_id UUID REFERENCES public.location_proprietaires(id) ON DELETE SET NULL;
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS ville TEXT DEFAULT 'Cotonou';
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS quartier TEXT;
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS etage TEXT;
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS porte_numero TEXT;
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS equipements TEXT[]; -- Eau, Electricité, Climatisation, Parking, Gardiennage, Wifi, etc.
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS loyer_reference NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS charges_incluses NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS photos TEXT[];
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS documents TEXT[];
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_location_biens_proprio ON public.location_biens(proprietaire_id);
CREATE INDEX IF NOT EXISTS idx_location_biens_parent ON public.location_biens(immeuble_parent_id);


-- ─── 3. TABLE MANDATS DE GESTION ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_mandats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    secteur_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'immobilier',
    numero_mandat TEXT NOT NULL,
    proprietaire_id UUID NOT NULL REFERENCES public.location_proprietaires(id) ON DELETE CASCADE,
    date_debut DATE NOT NULL DEFAULT CURRENT_DATE,
    date_fin DATE,
    type_commission TEXT DEFAULT 'POURCENTAGE', -- 'POURCENTAGE' ou 'FIXE'
    taux_commission_pourcent NUMERIC(5,2) DEFAULT 10.00, -- ex: 10%
    montant_commission_fixe NUMERIC(15,2) DEFAULT 0,
    base_calcul TEXT DEFAULT 'LOYER_ENCAISSE', -- LOYER_ENCAISSE, LOYER_CONTRACTUEL
    conditions_particulieres TEXT,
    statut TEXT DEFAULT 'ACTIF', -- ACTIF, EXPIRE, RESILIE
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loc_mandats_c_s ON public.location_mandats(company_id, sector_slug);
ALTER TABLE public.location_mandats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_mandats" ON public.location_mandats;
CREATE POLICY "allow_all_mandats" ON public.location_mandats FOR ALL USING (true) WITH CHECK (true);


-- ─── 4. TABLE CONTRATS (Enrichissement) ────────────────────────────────────────
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS secteur_id UUID;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS bien_id UUID REFERENCES public.location_biens(id) ON DELETE SET NULL;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS proprietaire_id UUID REFERENCES public.location_proprietaires(id) ON DELETE SET NULL;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS locataire_id UUID;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS locataire_cni TEXT;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS contact_urgence TEXT;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS jour_echeance_mensuelle INT DEFAULT 5;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS montant_charges_mensuel NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS frais_dossier NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS mois_caution_nb INT DEFAULT 3;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS mois_avance_nb INT DEFAULT 1;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS preavis_mois INT DEFAULT 3;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS contrat_pdf_url TEXT;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();


-- ─── 5. TABLE ÉCHÉANCES DE LOYERS (Génération auto & Échéancier) ──────────────
CREATE TABLE IF NOT EXISTS public.location_echeances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    secteur_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'immobilier',
    contrat_id UUID NOT NULL REFERENCES public.location_contrats(id) ON DELETE CASCADE,
    bien_id UUID REFERENCES public.location_biens(id) ON DELETE SET NULL,
    periode_mois TEXT NOT NULL, -- Ex: '2026-10'
    date_echeance DATE NOT NULL,
    montant_attendu NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_loyer NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_charges NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_paye NUMERIC(15,2) NOT NULL DEFAULT 0,
    reste_a_payer NUMERIC(15,2) NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'ATTENTE', -- 'ATTENTE', 'PARTIEL', 'PAYE', 'RETARD'
    derniere_date_paiement DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_contrat_echeance_mois UNIQUE (contrat_id, periode_mois)
);

CREATE INDEX IF NOT EXISTS idx_loc_echeances_c_s ON public.location_echeances(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_loc_echeances_statut ON public.location_echeances(statut);
ALTER TABLE public.location_echeances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_echeances" ON public.location_echeances;
CREATE POLICY "allow_all_echeances" ON public.location_echeances FOR ALL USING (true) WITH CHECK (true);


-- ─── 6. TABLE QUITTANCES & REÇUS (Enrichissement) ─────────────────────────────
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS secteur_id UUID;
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS echeance_id UUID REFERENCES public.location_echeances(id) ON DELETE SET NULL;
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS caisse_id UUID;
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS caisse_mouvement_id UUID;
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS type_document TEXT DEFAULT 'QUITTANCE'; -- 'QUITTANCE' (solde) ou 'RECU' (acompte/partiel)
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS montant_paye NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS solde_restant NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS commission_agence NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS part_proprietaire NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS reverser_au_proprio BOOLEAN DEFAULT FALSE;
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS date_reversement_proprio DATE;


-- ─── 7. TABLE CAUTIONS & DÉPÔTS DE GARANTIE ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_cautions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    secteur_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'immobilier',
    contrat_id UUID NOT NULL REFERENCES public.location_contrats(id) ON DELETE CASCADE,
    bien_id UUID REFERENCES public.location_biens(id) ON DELETE SET NULL,
    locataire_nom TEXT NOT NULL,
    montant_prevu NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_recu NUMERIC(15,2) NOT NULL DEFAULT 0,
    date_encaissement DATE DEFAULT CURRENT_DATE,
    caisse_mouvement_id UUID,
    retenues_justifiees NUMERIC(15,2) DEFAULT 0,
    motif_retenue TEXT,
    montant_restitue NUMERIC(15,2) DEFAULT 0,
    date_restitution DATE,
    solde_restitution NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'CONSERVEE', -- 'CONSERVEE', 'PARTIELLEMENT_RESTITUEE', 'RESTITUEE', 'RETENUE_TOTALE'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loc_cautions_c_s ON public.location_cautions(company_id, sector_slug);
ALTER TABLE public.location_cautions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_cautions" ON public.location_cautions;
CREATE POLICY "allow_all_cautions" ON public.location_cautions FOR ALL USING (true) WITH CHECK (true);


-- ─── 8. TABLE ÉTATS DES LIEUX ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_etats_lieux (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    secteur_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'immobilier',
    contrat_id UUID NOT NULL REFERENCES public.location_contrats(id) ON DELETE CASCADE,
    bien_id UUID REFERENCES public.location_biens(id) ON DELETE SET NULL,
    type_etat TEXT NOT NULL, -- 'ENTREE' ou 'SORTIE'
    date_constat DATE NOT NULL DEFAULT CURRENT_DATE,
    agent_constat TEXT,
    locataire_present TEXT,
    compteur_eau_index NUMERIC(10,2),
    compteur_elec_index NUMERIC(10,2),
    grille_pieces JSONB DEFAULT '[]'::jsonb, -- [{ piece: 'Salon', murs: 'Bon', sol: 'Moyen', elec: 'Bon', remarques: '' }]
    photos_pieces TEXT[],
    retenue_recommandee NUMERIC(15,2) DEFAULT 0,
    signature_locataire_url TEXT,
    signature_agent_url TEXT,
    notes_globales TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loc_etats_c_s ON public.location_etats_lieux(company_id, sector_slug);
ALTER TABLE public.location_etats_lieux ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_etats_lieux" ON public.location_etats_lieux;
CREATE POLICY "allow_all_etats_lieux" ON public.location_etats_lieux FOR ALL USING (true) WITH CHECK (true);


-- ─── 9. TABLE MAINTENANCE & INTERVENTIONS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_maintenances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    secteur_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'immobilier',
    reference TEXT DEFAULT concat('MAINT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    bien_id UUID NOT NULL REFERENCES public.location_biens(id) ON DELETE CASCADE,
    signale_par TEXT, -- Locataire, Gardien, Propriétaire, Visite
    description_probleme TEXT NOT NULL,
    priorite TEXT DEFAULT 'NORMALE', -- 'BASSE', 'NORMALE', 'URGENTE', 'CRITIQUE'
    statut TEXT DEFAULT 'OUVERT', -- 'OUVERT', 'DEVIS_EN_COURS', 'VALIDE', 'TRAVAUX_EN_COURS', 'TERMINE', 'ANNULE'
    date_signalement DATE DEFAULT CURRENT_DATE,
    date_intervention DATE,
    prestataire_fournisseur_id UUID,
    prestataire_nom TEXT,
    prestataire_tel TEXT,
    devis_estime NUMERIC(15,2) DEFAULT 0,
    cout_final NUMERIC(15,2) DEFAULT 0,
    charge_de TEXT DEFAULT 'PROPRIETAIRE', -- 'PROPRIETAIRE' ou 'LOCATAIRE' ou 'AGENCE'
    depense_id UUID, -- Lié à la table depenses existante
    photos_avant TEXT[],
    photos_apres TEXT[],
    rapport_intervention TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loc_maint_c_s ON public.location_maintenances(company_id, sector_slug);
ALTER TABLE public.location_maintenances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_maintenances" ON public.location_maintenances;
CREATE POLICY "allow_all_maintenances" ON public.location_maintenances FOR ALL USING (true) WITH CHECK (true);


-- ─── 10. TABLE ALERTES & NOTIFICATIONS IMMO ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_alertes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    secteur_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'immobilier',
    type_alerte TEXT NOT NULL, -- 'ECHEANCE_J_MOINS_3', 'RETARD_LOYER', 'EXPIRATION_BAIL', 'MANDAT_EXPIRE', 'CAUTION_A_RESTITUER', 'MAINTENANCE_RETARD'
    titre TEXT NOT NULL,
    message TEXT NOT NULL,
    contrat_id UUID,
    bien_id UUID,
    locataire_nom TEXT,
    montant_concerne NUMERIC(15,2) DEFAULT 0,
    date_declenchement DATE DEFAULT CURRENT_DATE,
    statut TEXT DEFAULT 'NON_LUE', -- 'NON_LUE', 'TRAITEE', 'IGNORE'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loc_alertes_c_s ON public.location_alertes(company_id, sector_slug);
ALTER TABLE public.location_alertes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_alertes" ON public.location_alertes;
CREATE POLICY "allow_all_alertes" ON public.location_alertes FOR ALL USING (true) WITH CHECK (true);


-- ─── 11. TABLE MODÈLES DE DOCUMENTS IMMOBILIERS ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_doc_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    secteur_id UUID,
    sector_slug TEXT NOT NULL DEFAULT 'immobilier',
    type_modele TEXT NOT NULL, -- 'BAIL_HABITATION', 'BAIL_COMMERCIAL', 'QUITTANCE', 'RECU_ACOMPTE', 'MISE_EN_DEMEURE', 'ETAT_LIEUX'
    titre TEXT NOT NULL,
    contenu_modele TEXT NOT NULL,
    variables_disponibles TEXT[],
    is_actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loc_templates_c_s ON public.location_doc_templates(company_id, sector_slug);
ALTER TABLE public.location_doc_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_templates" ON public.location_doc_templates;
CREATE POLICY "allow_all_templates" ON public.location_doc_templates FOR ALL USING (true) WITH CHECK (true);
