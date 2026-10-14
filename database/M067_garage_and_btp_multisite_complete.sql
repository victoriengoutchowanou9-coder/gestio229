-- =============================================================================
-- GESTIO 229 SaaS — Migration M067 : Secteur Atelier, Garage & Mécanique
-- Double Expérience Métier :
-- 1. Garage & Mécanique classique (Garages, Ateliers indépendants, Centres auto)
-- 2. Parc Matériel BTP & Maintenance Multisite (Engins, Flotte lourde, Chantiers)
-- =============================================================================

-- 0. Configuration persistante du mode de version au niveau de l'établissement
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS garage_version_mode VARCHAR(20) DEFAULT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. TABLES COMMUNE & GARAGE CLASSIQUE
-- ══════════════════════════════════════════════════════════════════════════════

-- Fiche complète des Véhicules clients
CREATE TABLE IF NOT EXISTS public.garage_clients_vehicules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    client_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    immatriculation VARCHAR(50) NOT NULL,
    marque VARCHAR(100) NOT NULL,
    modele VARCHAR(100) NOT NULL,
    annee INTEGER,
    vin VARCHAR(100),
    carburant VARCHAR(50) DEFAULT 'Essence', -- Essence, Diesel, Hybride, Electrique, Gaz
    motorisation VARCHAR(100),
    couleur VARCHAR(50),
    date_premiere_circulation DATE,
    date_expiration_assurance DATE,
    date_visite_technique DATE,
    compteur_km NUMERIC(12, 1) DEFAULT 0,
    client_nom TEXT NOT NULL,
    client_telephone VARCHAR(50),
    notes TEXT,
    photos JSONB DEFAULT '[]'::jsonb,
    statut VARCHAR(30) DEFAULT 'ACTIF',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garage_vehic_comp_immat 
    ON public.garage_clients_vehicules(company_id, immatriculation);
CREATE INDEX IF NOT EXISTS idx_garage_vehic_client 
    ON public.garage_clients_vehicules(company_id, client_id);

-- Fiches de Réception & Diagnostic initial à l'entrée en atelier
CREATE TABLE IF NOT EXISTS public.garage_receptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    numero_reception VARCHAR(50) NOT NULL,
    vehicule_id UUID REFERENCES public.garage_clients_vehicules(id) ON DELETE SET NULL,
    immatriculation VARCHAR(50) NOT NULL,
    client_nom VARCHAR(255) NOT NULL,
    client_tel VARCHAR(50),
    date_reception TIMESTAMPTZ DEFAULT NOW(),
    receptionnaire VARCHAR(150),
    km_entree NUMERIC(12, 1) DEFAULT 0,
    niveau_carburant VARCHAR(30) DEFAULT '1/2', -- Reserve, 1/4, 1/2, 3/4, Plein
    plaintes_client TEXT,
    symptomes_constates TEXT,
    dommages_visibles TEXT,
    accessoires_remis JSONB DEFAULT '[]'::jsonb, -- ['Roue secours', 'Cric', 'Documents', ...]
    checklist_securite JSONB DEFAULT '{}'::jsonb,
    statut VARCHAR(30) DEFAULT 'RECU', -- RECU, EN_DIAGNOSTIC, DEVIS_A_FAIRE, OR_CREE, RESTITUE
    signature_client TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garage_rec_company_num 
    ON public.garage_receptions(company_id, numero_reception);

-- Techniciens & Mécaniciens de l'atelier
CREATE TABLE IF NOT EXISTS public.garage_mecaniciens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nom_complet VARCHAR(150) NOT NULL,
    telephone VARCHAR(50),
    specialite VARCHAR(100) DEFAULT 'Mécanique générale', -- Moteur, Électricité, Diagnostic, Carrosserie, Climatisation, Pneumatique
    taux_horaire_facture NUMERIC(12,2) DEFAULT 5000,
    taux_horaire_cout NUMERIC(12,2) DEFAULT 2500,
    statut VARCHAR(30) DEFAULT 'DISPONIBLE', -- DISPONIBLE, EN_INTERVENTION, CONGE, INACTIF
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.garage_mecaniciens
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS statut VARCHAR(30) DEFAULT 'DISPONIBLE';

CREATE INDEX IF NOT EXISTS idx_garage_mec_comp 
    ON public.garage_mecaniciens(company_id, statut);

-- Devis de Réparation
CREATE TABLE IF NOT EXISTS public.garage_devis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    numero_devis VARCHAR(50) NOT NULL,
    reception_id UUID REFERENCES public.garage_receptions(id) ON DELETE SET NULL,
    vehicule_id UUID REFERENCES public.garage_clients_vehicules(id) ON DELETE SET NULL,
    immatriculation VARCHAR(50) NOT NULL,
    client_nom VARCHAR(255) NOT NULL,
    client_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    date_emission DATE DEFAULT CURRENT_DATE,
    date_validite DATE,
    statut VARCHAR(30) DEFAULT 'BROUILLON', -- BROUILLON, EN_ATTENTE_CLIENT, ACCEPTE, REFUSE, CONVERTI_OR
    total_pieces_ht NUMERIC(15,2) DEFAULT 0,
    total_mo_ht NUMERIC(15,2) DEFAULT 0,
    total_ss_traitance_ht NUMERIC(15,2) DEFAULT 0,
    montant_remise NUMERIC(15,2) DEFAULT 0,
    taux_tva NUMERIC(5,2) DEFAULT 18.00,
    montant_tva NUMERIC(15,2) DEFAULT 0,
    montant_total_ttc NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garage_dev_comp_num 
    ON public.garage_devis(company_id, numero_devis);

-- Lignes du Devis
CREATE TABLE IF NOT EXISTS public.garage_devis_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    devis_id UUID NOT NULL REFERENCES public.garage_devis(id) ON DELETE CASCADE,
    type_ligne VARCHAR(30) NOT NULL DEFAULT 'PIECE', -- PIECE, MAIN_DOEUVRE, SOUS_TRAITANCE
    reference VARCHAR(100),
    designation TEXT NOT NULL,
    quantite NUMERIC(10,2) DEFAULT 1,
    prix_unitaire_ht NUMERIC(15,2) DEFAULT 0,
    cout_achat_unitaire NUMERIC(15,2) DEFAULT 0,
    remise_pct NUMERIC(5,2) DEFAULT 0,
    montant_ht NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garage_dev_lignes 
    ON public.garage_devis_lignes(devis_id);

-- Ordres de Réparation (OR) complets
CREATE TABLE IF NOT EXISTS public.garage_ordres_reparation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    numero_or VARCHAR(50),
    immatriculation VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Garantir la présence de toutes les colonnes requises (si la table existait déjà avec un ancien schéma)
ALTER TABLE public.garage_ordres_reparation 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS numero_or VARCHAR(50),
    ADD COLUMN IF NOT EXISTS devis_id UUID REFERENCES public.garage_devis(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reception_id UUID REFERENCES public.garage_receptions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS vehicule_id UUID REFERENCES public.garage_clients_vehicules(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS immatriculation VARCHAR(50),
    ADD COLUMN IF NOT EXISTS client_nom VARCHAR(255) DEFAULT '',
    ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS mecanicien_id UUID REFERENCES public.garage_mecaniciens(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS mecanicien_nom VARCHAR(150),
    ADD COLUMN IF NOT EXISTS statut VARCHAR(40) DEFAULT 'PLANIFIE',
    ADD COLUMN IF NOT EXISTS date_entree TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS date_livraison_prevue TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS date_cloture TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS km_entree NUMERIC(12,1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS description_travaux TEXT,
    ADD COLUMN IF NOT EXISTS total_pieces_ht NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_mo_ht NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_ss_traitance_ht NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS remise_totale NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS taux_tva NUMERIC(5,2) DEFAULT 18.00,
    ADD COLUMN IF NOT EXISTS montant_tva NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS montant_ttc NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cout_revient_interne NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS marge_brute NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS pieces_destockees BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS facture_id UUID,
    ADD COLUMN IF NOT EXISTS controle_qualite_valide BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS notes_mecanicien TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Migration rétroactive des statuts et associations d'anciens enregistrements
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'garage_ordres_reparation' 
          AND column_name = 'statut_reparation'
    ) THEN
        UPDATE public.garage_ordres_reparation
        SET statut = COALESCE(statut_reparation, 'PLANIFIE')
        WHERE statut IS NULL;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'garage_ordres_reparation' 
          AND column_name = 'activity_id'
    ) THEN
        UPDATE public.garage_ordres_reparation g
        SET company_id = a.company_id
        FROM public.company_activities a
        WHERE g.activity_id = a.id AND g.company_id IS NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_garage_or_comp_num 
    ON public.garage_ordres_reparation(company_id, numero_or);
CREATE INDEX IF NOT EXISTS idx_garage_or_statut 
    ON public.garage_ordres_reparation(company_id, statut);

-- Lignes de l'Ordre de Réparation
CREATE TABLE IF NOT EXISTS public.garage_ordre_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ordre_id UUID NOT NULL REFERENCES public.garage_ordres_reparation(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    type_ligne VARCHAR(30) NOT NULL DEFAULT 'PIECE', -- PIECE, MAIN_DOEUVRE, SOUS_TRAITANCE
    reference VARCHAR(100),
    designation TEXT NOT NULL,
    quantite NUMERIC(10,2) DEFAULT 1,
    prix_unitaire_ht NUMERIC(15,2) DEFAULT 0,
    cout_achat_unitaire NUMERIC(15,2) DEFAULT 0,
    remise_pct NUMERIC(5,2) DEFAULT 0,
    montant_ht NUMERIC(15,2) DEFAULT 0,
    mecanicien_nom VARCHAR(150),
    heures_effectives NUMERIC(6,2) DEFAULT 0,
    statut_execution VARCHAR(30) DEFAULT 'A_FAIRE', -- A_FAIRE, EN_COURS, FAIT
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garage_ordre_lignes 
    ON public.garage_ordre_lignes(ordre_id);

-- Assurances et Dossiers Sinistres
CREATE TABLE IF NOT EXISTS public.garage_assurances_sinistres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    numero_dossier VARCHAR(50) NOT NULL,
    compagnie_assurance VARCHAR(150) NOT NULL,
    numero_police VARCHAR(100),
    numero_sinistre VARCHAR(100),
    expert_nom VARCHAR(150),
    expert_tel VARCHAR(50),
    ordre_id UUID REFERENCES public.garage_ordres_reparation(id) ON DELETE SET NULL,
    immatriculation VARCHAR(50) NOT NULL,
    client_nom VARCHAR(255) NOT NULL,
    montant_devis_soumis NUMERIC(15,2) DEFAULT 0,
    montant_accord_assurance NUMERIC(15,2) DEFAULT 0,
    franchise_client NUMERIC(15,2) DEFAULT 0,
    reste_a_charge_client NUMERIC(15,2) DEFAULT 0,
    statut_prise_en_charge VARCHAR(40) DEFAULT 'EN_ATTENTE_ACCORD', -- EN_ATTENTE_ACCORD, ACCORDE, PARTIEL, REFUSE, REGLE
    regle_assurance NUMERIC(15,2) DEFAULT 0,
    regle_client NUMERIC(15,2) DEFAULT 0,
    date_sinistre DATE,
    date_expertise DATE,
    date_accord DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_garage_sinistres_comp 
    ON public.garage_assurances_sinistres(company_id, statut_prise_en_charge);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. TABLES VERSION BTP & MAINTENANCE MULTISITE
-- ══════════════════════════════════════════════════════════════════════════════

-- Sites, Agences, Ateliers & Dépôts
CREATE TABLE IF NOT EXISTS public.btp_sites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code_site VARCHAR(50) NOT NULL,
    nom_site VARCHAR(150) NOT NULL,
    type_site VARCHAR(40) DEFAULT 'CHANTIER', -- SIEGE, AGENCE, ATELIER_CENTRAL, ATELIER_SECONDAIRE, DEPOT, CHANTIER, BASE_VIE
    adresse TEXT,
    ville VARCHAR(100) DEFAULT 'Cotonou',
    responsable_nom VARCHAR(150),
    responsable_tel VARCHAR(50),
    statut VARCHAR(30) DEFAULT 'ACTIF',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_sites_comp 
    ON public.btp_sites(company_id, code_site);

-- Parc Matériel, Camions, Engins & Équipements BTP
CREATE TABLE IF NOT EXISTS public.btp_materiels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code_materiel VARCHAR(50) NOT NULL, -- PEL-01, CAM-05, BULL-02, GRP-03
    designation VARCHAR(255) NOT NULL,
    categorie VARCHAR(100) NOT NULL, -- Pelle mécanique, Bulldozer, Camion-benne, Toupie, Grue, Chargeuse, Niveleuse, Compacteur, Groupe électrogène, etc.
    marque VARCHAR(100) NOT NULL,
    modele VARCHAR(100) NOT NULL,
    annee INTEGER,
    numero_serie VARCHAR(100),
    immatriculation VARCHAR(50),
    site_actuel_id UUID REFERENCES public.btp_sites(id) ON DELETE SET NULL,
    site_nom VARCHAR(150),
    type_compteur VARCHAR(30) DEFAULT 'HEURES_MOTEUR', -- HEURES_MOTEUR, KILOMETRAGE, LES_DEUX
    compteur_heures_actuel NUMERIC(12,1) DEFAULT 0,
    compteur_km_actuel NUMERIC(12,1) DEFAULT 0,
    compteur_derniere_maj TIMESTAMPTZ DEFAULT NOW(),
    statut VARCHAR(40) DEFAULT 'DISPONIBLE', -- DISPONIBLE, AFFECTE_CHANTIER, EN_TRANSIT, EN_MAINTENANCE, EN_PANNE, IMMOBILISE, REFORME, LOUE
    cout_acquisition NUMERIC(15,2) DEFAULT 0,
    date_acquisition DATE,
    capacite_carburant_reservoir NUMERIC(8,1) DEFAULT 200, -- en Litres
    conso_theorique_moyenne NUMERIC(8,2) DEFAULT 25, -- Litres / heure ou Litres / 100km
    date_prochaine_maintenance TIMESTAMPTZ,
    compteur_prochaine_maintenance NUMERIC(12,1) DEFAULT 250,
    conducteur_habituel_nom VARCHAR(150),
    assurance_expiration DATE,
    visite_technique_expiration DATE,
    controle_securite_expiration DATE,
    cout_cumule_maintenance NUMERIC(15,2) DEFAULT 0,
    cout_cumule_carburant NUMERIC(15,2) DEFAULT 0,
    photos JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_mat_comp_code 
    ON public.btp_materiels(company_id, code_materiel);
CREATE INDEX IF NOT EXISTS idx_btp_mat_statut 
    ON public.btp_materiels(company_id, statut);
CREATE INDEX IF NOT EXISTS idx_btp_mat_site 
    ON public.btp_materiels(company_id, site_actuel_id);

-- Relevés de Compteurs Horométriques & Kilométriques
CREATE TABLE IF NOT EXISTS public.btp_compteurs_releves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    materiel_id UUID NOT NULL REFERENCES public.btp_materiels(id) ON DELETE CASCADE,
    date_releve TIMESTAMPTZ DEFAULT NOW(),
    heures_moteur NUMERIC(12,1),
    kilometrage NUMERIC(12,1),
    releve_par VARCHAR(150),
    site_id UUID REFERENCES public.btp_sites(id) ON DELETE SET NULL,
    contexte VARCHAR(50) DEFAULT 'ROUTINE', -- ROUTINE, PLEIN_CARBURANT, DEPART_CHANTIER, RETOUR_CHANTIER, MAINTENANCE
    justificatif_photo TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_compteurs_mat 
    ON public.btp_compteurs_releves(company_id, materiel_id, date_releve DESC);

-- Plans de Maintenance Préventive
CREATE TABLE IF NOT EXISTS public.btp_maintenance_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    titre VARCHAR(150) NOT NULL, -- Ex: "Entretien Périodique 250H Moteur", "Vidange 10 000 KM"
    categorie_materiel VARCHAR(100), -- Applicable à tous les Bulldozers, Pelles, etc.
    materiel_id UUID REFERENCES public.btp_materiels(id) ON DELETE CASCADE,
    periodicite_heures NUMERIC(10,1), -- Ex: toutes les 250h
    periodicite_km NUMERIC(10,1), -- Ex: tous les 10 000 km
    periodicite_jours INTEGER, -- Ex: tous les 90 jours
    operations_programmees JSONB DEFAULT '[]'::jsonb, -- ['Vidange huile 15W40', 'Filtre gasoil', 'Graissage axes']
    pieces_recommandees JSONB DEFAULT '[]'::jsonb, -- Références de filtres et consommables
    est_actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_maint_plans_comp 
    ON public.btp_maintenance_plans(company_id, categorie_materiel);

-- Ordres de Maintenance & Interventions Mécaniques BTP
CREATE TABLE IF NOT EXISTS public.btp_ordres_maintenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    numero_om VARCHAR(50) NOT NULL,
    materiel_id UUID NOT NULL REFERENCES public.btp_materiels(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.btp_maintenance_plans(id) ON DELETE SET NULL,
    type_intervention VARCHAR(40) NOT NULL DEFAULT 'PREVENTIVE', -- PREVENTIVE, CORRECTIVE_PANNE, DIAGNOSTIC, CONTROLE_LEGAL
    urgence VARCHAR(20) DEFAULT 'NORMALE', -- BASSE, NORMALE, HAUTE, URGENCE_ARRET_CHANTIER
    site_id UUID REFERENCES public.btp_sites(id) ON DELETE SET NULL,
    technicien_interne VARCHAR(150),
    prestataire_externe VARCHAR(150), -- Ex: Concessionnaire CAT, CFAO, etc.
    date_demande TIMESTAMPTZ DEFAULT NOW(),
    date_debut TIMESTAMPTZ,
    date_fin TIMESTAMPTZ,
    statut VARCHAR(40) DEFAULT 'PLANIFIE', -- PLANIFIE, EN_COURS, ATTENTE_PIECES, TERMINE, CLOTURE, ANNULE
    compteur_au_declenchement NUMERIC(12,1) DEFAULT 0,
    temps_arret_heures NUMERIC(8,1) DEFAULT 0,
    diagnostic_panne TEXT,
    travaux_effectues TEXT,
    cout_pieces NUMERIC(15,2) DEFAULT 0,
    cout_main_oeuvre NUMERIC(15,2) DEFAULT 0,
    cout_prestataire NUMERIC(15,2) DEFAULT 0,
    cout_total NUMERIC(15,2) DEFAULT 0,
    pieces_consommees JSONB DEFAULT '[]'::jsonb,
    pieces_destockees BOOLEAN DEFAULT FALSE,
    prochaine_echeance_compteur NUMERIC(12,1),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_om_comp_num 
    ON public.btp_ordres_maintenance(company_id, numero_om);
CREATE INDEX IF NOT EXISTS idx_btp_om_mat 
    ON public.btp_ordres_maintenance(company_id, materiel_id, statut);

-- Cuves de Carburant (Chantier / Base)
CREATE TABLE IF NOT EXISTS public.btp_cuves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code_cuve VARCHAR(50) NOT NULL,
    site_id UUID REFERENCES public.btp_sites(id) ON DELETE SET NULL,
    type_carburant VARCHAR(50) DEFAULT 'Gasoil', -- Gasoil, Essence, Huile Hydraulique
    capacite_max_litres NUMERIC(10,2) NOT NULL DEFAULT 10000,
    stock_actuel_litres NUMERIC(10,2) NOT NULL DEFAULT 5000,
    seuil_alerte_litres NUMERIC(10,2) DEFAULT 1500,
    prix_moyen_achat_litre NUMERIC(10,2) DEFAULT 650,
    statut VARCHAR(30) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_cuves_comp 
    ON public.btp_cuves(company_id, code_cuve);

-- Pleins et Distributions de Carburant
CREATE TABLE IF NOT EXISTS public.btp_carburant_pleins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    numero_bon VARCHAR(50) NOT NULL,
    cuve_id UUID REFERENCES public.btp_cuves(id) ON DELETE SET NULL,
    materiel_id UUID NOT NULL REFERENCES public.btp_materiels(id) ON DELETE CASCADE,
    site_id UUID REFERENCES public.btp_sites(id) ON DELETE SET NULL,
    date_plein TIMESTAMPTZ DEFAULT NOW(),
    quantite_litres NUMERIC(10,2) NOT NULL,
    prix_litre NUMERIC(10,2) DEFAULT 650,
    montant_total NUMERIC(15,2) DEFAULT 0,
    compteur_heures NUMERIC(12,1),
    compteur_km NUMERIC(12,1),
    conducteur_nom VARCHAR(150),
    pompiste_distributeur VARCHAR(150),
    consommation_calculee_ratio NUMERIC(10,2), -- Litres / heure ou L/100km
    est_surconsommation_anormale BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_carb_comp_mat 
    ON public.btp_carburant_pleins(company_id, materiel_id, date_plein DESC);

-- Chauffeurs, Conducteurs d'Engins & Opérateurs
CREATE TABLE IF NOT EXISTS public.btp_chauffeurs_operateurs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    matricule VARCHAR(50) NOT NULL,
    nom_complet VARCHAR(150) NOT NULL,
    telephone VARCHAR(50),
    site_rattachement_id UUID REFERENCES public.btp_sites(id) ON DELETE SET NULL,
    categories_permis JSONB DEFAULT '["B", "C"]'::jsonb,
    habilitations_caces JSONB DEFAULT '[]'::jsonb, -- ['R482 Catégorie A', 'R482 Catégorie B1', ...]
    date_expiration_permis DATE,
    date_expiration_visite_medicale DATE,
    statut VARCHAR(30) DEFAULT 'DISPONIBLE', -- DISPONIBLE, EN_MISSION, CONGE, SUSPENDU, INACTIF
    materiel_actuel_id UUID REFERENCES public.btp_materiels(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_chauf_comp 
    ON public.btp_chauffeurs_operateurs(company_id, statut);

-- Chantiers BTP & Projets de Travaux
CREATE TABLE IF NOT EXISTS public.btp_chantiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code_chantier VARCHAR(50) NOT NULL,
    nom_chantier VARCHAR(200) NOT NULL,
    client_nom VARCHAR(200) NOT NULL,
    client_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    chef_chantier_nom VARCHAR(150),
    chef_chantier_tel VARCHAR(50),
    localisation TEXT,
    ville VARCHAR(100) DEFAULT 'Cotonou',
    date_debut DATE DEFAULT CURRENT_DATE,
    date_fin_prevue DATE,
    date_fin_reelle DATE,
    budget_previsionnel NUMERIC(15,2) DEFAULT 0,
    cout_materiel_cumule NUMERIC(15,2) DEFAULT 0,
    cout_carburant_cumule NUMERIC(15,2) DEFAULT 0,
    cout_maintenance_cumule NUMERIC(15,2) DEFAULT 0,
    statut VARCHAR(30) DEFAULT 'EN_COURS', -- EN_COURS, ATTENTE_DEMARRAGE, SUSPENDU, RECEPTIONNE, CLOTURE
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_chant_comp_code 
    ON public.btp_chantiers(company_id, code_chantier);

-- Affectations d'Engins et Matériels aux Chantiers
CREATE TABLE IF NOT EXISTS public.btp_affectations_materiels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    materiel_id UUID NOT NULL REFERENCES public.btp_materiels(id) ON DELETE CASCADE,
    chantier_id UUID NOT NULL REFERENCES public.btp_chantiers(id) ON DELETE CASCADE,
    date_affectation TIMESTAMPTZ DEFAULT NOW(),
    date_retour_prevue DATE,
    date_retour_reelle TIMESTAMPTZ,
    compteur_depart NUMERIC(12,1) NOT NULL DEFAULT 0,
    compteur_retour NUMERIC(12,1),
    heures_ou_km_effectues NUMERIC(12,1) DEFAULT 0,
    conducteur_id UUID REFERENCES public.btp_chauffeurs_operateurs(id) ON DELETE SET NULL,
    conducteur_nom VARCHAR(150),
    taux_horaire_facturation_interne NUMERIC(12,2) DEFAULT 0,
    cout_total_interne NUMERIC(15,2) DEFAULT 0,
    statut VARCHAR(30) DEFAULT 'EN_COURS', -- EN_COURS, RETOURNE, PROLONGE
    observations TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_aff_comp_chant 
    ON public.btp_affectations_materiels(company_id, chantier_id, statut);

-- Transferts Intersites (Matériel & Pièces détachées)
CREATE TABLE IF NOT EXISTS public.btp_transferts_intersites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    numero_transfert VARCHAR(50) NOT NULL,
    type_transfert VARCHAR(30) DEFAULT 'MATERIEL', -- MATERIEL, PIECES_DETACHEES, CARBURANT
    site_origine_id UUID NOT NULL REFERENCES public.btp_sites(id) ON DELETE CASCADE,
    site_destination_id UUID NOT NULL REFERENCES public.btp_sites(id) ON DELETE CASCADE,
    materiel_id UUID REFERENCES public.btp_materiels(id) ON DELETE SET NULL,
    items JSONB DEFAULT '[]'::jsonb, -- Pour transferts de pièces/lots
    transporteur_nom VARCHAR(150),
    moyen_transport VARCHAR(100) DEFAULT 'Porte-char interne',
    chauffeur_nom VARCHAR(150),
    date_expedition TIMESTAMPTZ DEFAULT NOW(),
    date_reception TIMESTAMPTZ,
    statut VARCHAR(30) DEFAULT 'EN_TRANSIT', -- PREPARE, EN_TRANSIT, RECU, RECU_AVEC_RESERVES, ANNULE
    expedie_par VARCHAR(150),
    receptionne_par VARCHAR(150),
    cout_transport NUMERIC(12,2) DEFAULT 0,
    motif TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btp_transf_comp 
    ON public.btp_transferts_intersites(company_id, numero_transfert);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. ACTIVATION ROW LEVEL SECURITY (RLS) SANS CASSE
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
    tbl text;
    garage_tables text[] := ARRAY[
        'garage_clients_vehicules',
        'garage_receptions',
        'garage_mecaniciens',
        'garage_devis',
        'garage_devis_lignes',
        'garage_ordres_reparation',
        'garage_ordre_lignes',
        'garage_assurances_sinistres',
        'btp_sites',
        'btp_materiels',
        'btp_compteurs_releves',
        'btp_maintenance_plans',
        'btp_ordres_maintenance',
        'btp_cuves',
        'btp_carburant_pleins',
        'btp_chauffeurs_operateurs',
        'btp_chantiers',
        'btp_affectations_materiels',
        'btp_transferts_intersites'
    ];
BEGIN
    FOREACH tbl IN ARRAY garage_tables LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl);
        
        -- Policy authenticated full access
        EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);', tbl);
        
        -- Policy service role full access
        EXECUTE format('DROP POLICY IF EXISTS "Allow service role full access" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow service role full access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', tbl);
        
        -- Policy anon full access (pour client frontend)
        EXECUTE format('DROP POLICY IF EXISTS "Allow anon full access" ON public.%I;', tbl);
        EXECUTE format('CREATE POLICY "Allow anon full access" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);', tbl);
    END LOOP;
END $$;
