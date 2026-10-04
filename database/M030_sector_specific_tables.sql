-- =============================================================================
-- GESTIO 229 SaaS — M030 : Tables Secteurs Spécifiques
-- =============================================================================
-- Migration : Création des tables métier pour tous les secteurs spécialisés
-- Isolation stricte : company_id + sector_slug
-- SAFE : CREATE TABLE IF NOT EXISTS sur toutes les tables
-- AUCUNE suppression de données existantes
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTEUR : ÉCOLE & CENTRE DE FORMATION
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ecole_eleves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'ecole',
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    classe TEXT NOT NULL,
    date_naissance DATE,
    contact_parent TEXT,
    montant_frais_annuels NUMERIC(15,2) DEFAULT 0,
    frais_payes NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'SUSPENDU', 'SORTI', 'DIPLOME')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ecole_paiements_scolaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'ecole',
    eleve_id UUID REFERENCES public.ecole_eleves(id),
    eleve_nom TEXT NOT NULL,
    classe TEXT,
    type_frais TEXT NOT NULL CHECK (type_frais IN ('Inscription', 'Mensualite', 'Examen', 'Cantine', 'Transport', 'Autre')),
    montant NUMERIC(15,2) NOT NULL DEFAULT 0,
    mode_paiement TEXT DEFAULT 'Especes' CHECK (mode_paiement IN ('Especes', 'MoMo', 'Virement', 'Cheque')),
    date_paiement DATE DEFAULT CURRENT_DATE,
    reference TEXT UNIQUE DEFAULT concat('PAY-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    agent_nom TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ecole_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'ecole',
    eleve_nom TEXT NOT NULL,
    classe TEXT NOT NULL,
    matiere TEXT NOT NULL,
    note_sur_20 NUMERIC(5,2) CHECK (note_sur_20 >= 0 AND note_sur_20 <= 20),
    periode TEXT NOT NULL CHECK (periode IN ('Trimestre 1', 'Trimestre 2', 'Trimestre 3')),
    appreciation TEXT,
    date_saisie DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ecole_absences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'ecole',
    eleve_nom TEXT NOT NULL,
    classe TEXT,
    date_absence DATE NOT NULL DEFAULT CURRENT_DATE,
    motif TEXT,
    justifie BOOLEAN DEFAULT FALSE,
    agent_nom TEXT,
    observations TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTEUR : SUPERMARCHÉ & SUPÉRETTE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.supermarche_rayons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'supermarche',
    code_rayon TEXT NOT NULL,
    nom_rayon TEXT NOT NULL,
    responsable TEXT,
    description TEXT,
    est_actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.supermarche_promos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'supermarche',
    produit_nom TEXT NOT NULL,
    prix_normal NUMERIC(15,2) NOT NULL DEFAULT 0,
    prix_promo NUMERIC(15,2) NOT NULL DEFAULT 0,
    remise_pct NUMERIC(5,2) DEFAULT 0,
    date_debut DATE DEFAULT CURRENT_DATE,
    date_fin DATE,
    dlc_date DATE,
    statut TEXT DEFAULT 'ACTIVE' CHECK (statut IN ('ACTIVE', 'EXPIREE', 'A_VENIR')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTEUR : PHARMACIE & DÉPÔT MÉDICAL
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pharmacie_ordonnances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'pharmacie',
    reference TEXT UNIQUE DEFAULT concat('ORD-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    patient_nom TEXT NOT NULL,
    medecin TEXT,
    date_ordonnance DATE DEFAULT CURRENT_DATE,
    produits_prescrits TEXT,
    montant_total NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE', 'SERVIE', 'PARTIELLE')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.pharmacie_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'pharmacie',
    produit_nom TEXT NOT NULL,
    numero_lot TEXT NOT NULL,
    date_fabrication DATE,
    date_peremption DATE NOT NULL,
    quantite NUMERIC(10,2) DEFAULT 0,
    fournisseur TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTEUR : STATION-SERVICE & HYDROCARBURES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.station_pompes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    numero_pompe TEXT NOT NULL,
    type_carburant TEXT NOT NULL CHECK (type_carburant IN ('SP95', 'Gasoil', 'SP98', 'Gaz', 'Kerosene')),
    cuve_associee TEXT,
    index_actuel NUMERIC(15,3) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIVE' CHECK (statut IN ('ACTIVE', 'MAINTENANCE', 'ARRETEE')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.station_releves_pompes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    pompe_id UUID REFERENCES public.station_pompes(id),
    pompe_num TEXT NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    index_debut NUMERIC(15,3) NOT NULL DEFAULT 0,
    index_fin NUMERIC(15,3) NOT NULL DEFAULT 0,
    volume_vendu NUMERIC(15,3) DEFAULT 0,
    prix_litre NUMERIC(10,2) DEFAULT 0,
    montant NUMERIC(15,2) DEFAULT 0,
    agent_nom TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.station_postes_journaliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    date DATE DEFAULT CURRENT_DATE,
    pompiste_nom TEXT NOT NULL,
    pompe_numero TEXT,
    index_debut NUMERIC(15,3) DEFAULT 0,
    index_fin NUMERIC(15,3) DEFAULT 0,
    volume_vendu NUMERIC(15,3) DEFAULT 0,
    montant_encaisse NUMERIC(15,2) DEFAULT 0,
    ecart NUMERIC(15,2) DEFAULT 0,
    observation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.station_lubrifiants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    designation TEXT NOT NULL,
    marque TEXT,
    viscosite TEXT,
    conditionnement TEXT,
    stock_actuel NUMERIC(10,2) DEFAULT 0,
    prix_vente NUMERIC(15,2) DEFAULT 0,
    prix_achat NUMERIC(15,2) DEFAULT 0,
    seuil_alerte NUMERIC(10,2) DEFAULT 5,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTEUR : HÔTEL, RÉSIDENCE & AUBERGE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hotel_chambres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'hotel',
    numero_chambre TEXT NOT NULL,
    type_chambre TEXT NOT NULL CHECK (type_chambre IN ('Simple', 'Double', 'Triple', 'Suite', 'VIP', 'Familiale')),
    etage INT DEFAULT 1,
    tarif_nuit NUMERIC(15,2) NOT NULL DEFAULT 0,
    statut TEXT DEFAULT 'LIBRE' CHECK (statut IN ('LIBRE', 'OCCUPEE', 'MAINTENANCE', 'RESERVEE')),
    client_actuel TEXT,
    date_entree TIMESTAMPTZ,
    date_sortie_prevue TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.hotel_housekeeping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'hotel',
    chambre_numero TEXT NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    agent_nom TEXT NOT NULL,
    statut TEXT DEFAULT 'A_NETTOYER' CHECK (statut IN ('A_NETTOYER', 'EN_COURS', 'TERMINE', 'VERIFIE')),
    priorite TEXT DEFAULT 'NORMALE' CHECK (priorite IN ('NORMALE', 'URGENTE')),
    heure_debut TIME,
    heure_fin TIME,
    observations TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTEUR : GARAGE & ATELIER MÉCANIQUE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.garage_vehicules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'garage',
    immatriculation TEXT NOT NULL,
    marque TEXT,
    modele TEXT,
    annee INT,
    client_nom TEXT NOT NULL,
    client_tel TEXT,
    motif_entree TEXT,
    date_entree DATE DEFAULT CURRENT_DATE,
    date_sortie DATE,
    statut TEXT DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE', 'EN_REPARATION', 'ATTENTE_PIECES', 'PRET', 'LIVRE')),
    kilometrage NUMERIC(10,0) DEFAULT 0,
    observations TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.garage_ordres_reparation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'garage',
    reference TEXT UNIQUE DEFAULT concat('OR-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    vehicule_immat TEXT NOT NULL,
    client_nom TEXT NOT NULL,
    type_travaux TEXT,
    description TEXT,
    cout_pieces NUMERIC(15,2) DEFAULT 0,
    cout_mo NUMERIC(15,2) DEFAULT 0,
    tva_pct NUMERIC(5,2) DEFAULT 18,
    total_ttc NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'DIAGNOSTIC' CHECK (statut IN ('DIAGNOSTIC', 'EN_COURS', 'ATTENTE_PIECES', 'PRET', 'LIVRE')),
    date_entree DATE DEFAULT CURRENT_DATE,
    date_sortie_prevue DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTEUR : MICROFINANCE & TONTINE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_membres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    numero_membre TEXT UNIQUE DEFAULT concat('MBR-', extract(epoch from NOW())::BIGINT),
    nom_complet TEXT NOT NULL,
    telephone TEXT,
    adresse TEXT,
    date_adhesion DATE DEFAULT CURRENT_DATE,
    type_compte TEXT DEFAULT 'Epargne' CHECK (type_compte IN ('Epargne', 'Courant', 'Credit')),
    solde_epargne NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'SUSPENDU', 'FERME')),
    agent_collecteur TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.microfinance_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    reference TEXT UNIQUE DEFAULT concat('CRD-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    membre_nom TEXT NOT NULL,
    montant_accorde NUMERIC(15,2) NOT NULL DEFAULT 0,
    taux_interet NUMERIC(5,2) DEFAULT 0,
    duree_mois INT DEFAULT 12,
    date_octroi DATE DEFAULT CURRENT_DATE,
    montant_total_du NUMERIC(15,2) DEFAULT 0,
    montant_rembourse NUMERIC(15,2) DEFAULT 0,
    solde_restant NUMERIC(15,2) DEFAULT 0,
    prochaine_echeance DATE,
    statut TEXT DEFAULT 'EN_COURS' CHECK (statut IN ('EN_COURS', 'REMBOURSE', 'EN_RETARD', 'ANNULE')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.microfinance_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    nom_complet TEXT NOT NULL,
    telephone TEXT,
    zone_collecte TEXT,
    commission_taux_pct NUMERIC(5,2) DEFAULT 2,
    nb_membres_actifs INT DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'INACTIF')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.tontine_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    nom_tontine TEXT NOT NULL,
    nb_participants INT DEFAULT 0,
    montant_cotisation NUMERIC(15,2) NOT NULL DEFAULT 0,
    periodicite TEXT DEFAULT 'Mensuelle' CHECK (periodicite IN ('Quotidienne', 'Hebdomadaire', 'Mensuelle')),
    date_debut DATE DEFAULT CURRENT_DATE,
    tour_actuel INT DEFAULT 1,
    cagnotte_actuelle NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'TERMINE', 'SUSPENDU')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTEUR : IMPRIMERIE & SÉRIGRAPHIE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.impression_devis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'impression',
    reference TEXT UNIQUE DEFAULT concat('DEV-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    client_nom TEXT NOT NULL,
    type_travail TEXT CHECK (type_travail IN ('Offset', 'Numerique', 'Serigraphie', 'Broderie', 'Flex', 'Autre')),
    description TEXT,
    quantite NUMERIC(10,0) DEFAULT 1,
    format TEXT,
    prix_unitaire NUMERIC(15,2) DEFAULT 0,
    total NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'DEVIS' CHECK (statut IN ('DEVIS', 'BAT_ENVOYE', 'BAT_VALIDE', 'EN_PRODUCTION', 'LIVRE', 'ANNULE')),
    date_devis DATE DEFAULT CURRENT_DATE,
    date_livraison DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.impression_sous_traitance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'impression',
    reference TEXT UNIQUE DEFAULT concat('ST-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    fournisseur_nom TEXT NOT NULL,
    type_prestation TEXT,
    description TEXT,
    montant_ht NUMERIC(15,2) DEFAULT 0,
    montant_facture_client NUMERIC(15,2) DEFAULT 0,
    marge NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE', 'RECU', 'FACTURE')),
    date_commande DATE DEFAULT CURRENT_DATE,
    date_livraison DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTEUR : GESTION LOCATIVE & IMMOBILIER
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.location_biens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'location',
    reference TEXT DEFAULT concat('BIEN-', extract(epoch from NOW())::BIGINT),
    type_bien TEXT CHECK (type_bien IN ('Appartement', 'Studio', 'Villa', 'Bureau', 'Magasin', 'Terrain', 'Autre')),
    adresse TEXT NOT NULL,
    superficie_m2 NUMERIC(10,2),
    nb_pieces INT,
    loyer_mensuel NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'LIBRE' CHECK (statut IN ('LIBRE', 'OCCUPE', 'EN_TRAVAUX')),
    locataire_actuel TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.location_contrats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'location',
    reference TEXT UNIQUE DEFAULT concat('CTR-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    bien_ref TEXT,
    locataire_nom TEXT NOT NULL,
    locataire_tel TEXT,
    date_debut DATE NOT NULL DEFAULT CURRENT_DATE,
    date_fin DATE,
    loyer_mensuel NUMERIC(15,2) DEFAULT 0,
    depot_garantie NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'EXPIRE', 'RESILIE')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.location_quittances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'location',
    reference TEXT UNIQUE DEFAULT concat('QTT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    contrat_id UUID REFERENCES public.location_contrats(id),
    locataire_nom TEXT NOT NULL,
    bien_ref TEXT,
    mois_loyer TEXT NOT NULL,
    montant_loyer NUMERIC(15,2) DEFAULT 0,
    charges NUMERIC(15,2) DEFAULT 0,
    montant_total NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'EMISE' CHECK (statut IN ('EMISE', 'PAYEE', 'EN_RETARD')),
    date_paiement DATE,
    mode_paiement TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTEUR : POISSONNERIE & PRODUITS FRAIS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.poissonnerie_chambres_froides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'poissonnerie',
    nom_chambre TEXT NOT NULL,
    capacite_kg NUMERIC(10,2) DEFAULT 0,
    temperature_consigne NUMERIC(5,1) DEFAULT -18,
    temperature_actuelle NUMERIC(5,1),
    humidite NUMERIC(5,1),
    produit_stocke TEXT,
    poids_actuel_kg NUMERIC(10,2) DEFAULT 0,
    statut TEXT DEFAULT 'OK' CHECK (statut IN ('OK', 'ALERTE', 'PANNE')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.poissonnerie_pesees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'poissonnerie',
    reference TEXT UNIQUE DEFAULT concat('PES-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    produit_nom TEXT NOT NULL,
    type_conditionnement TEXT DEFAULT 'Kg' CHECK (type_conditionnement IN ('Kg', 'Carton', 'Piece')),
    poids_brut NUMERIC(10,3) DEFAULT 0,
    tare NUMERIC(10,3) DEFAULT 0,
    poids_net NUMERIC(10,3) DEFAULT 0,
    prix_unitaire NUMERIC(15,2) DEFAULT 0,
    montant_total NUMERIC(15,2) DEFAULT 0,
    client_nom TEXT,
    agent_nom TEXT,
    date_pesee DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.poissonnerie_avaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'poissonnerie',
    reference TEXT UNIQUE DEFAULT concat('AVR-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    produit_nom TEXT NOT NULL,
    chambre_froide TEXT,
    quantite_kg NUMERIC(10,3) DEFAULT 0,
    motif_avarie TEXT CHECK (motif_avarie IN ('Panne_Froid', 'DLC', 'Contamination', 'Autre')),
    valeur_estimee NUMERIC(15,2) DEFAULT 0,
    action_prise TEXT CHECK (action_prise IN ('Jete', 'Vendu_Solde', 'En_Attente')),
    date_constat DATE DEFAULT CURRENT_DATE,
    agent_constat TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTEUR : QUINCAILLERIE & MATÉRIAUX BTP
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.quincaillerie_materiaux (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'quincaillerie',
    reference TEXT,
    designation TEXT NOT NULL,
    categorie TEXT CHECK (categorie IN ('Ciment', 'Fer_Beton', 'Sable', 'Graviers', 'Plomberie', 'Electricite', 'Outillage', 'Peinture', 'Autre')),
    unite TEXT DEFAULT 'Piece' CHECK (unite IN ('Sac', 'Tonne', 'Ml', 'M2', 'M3', 'Barreau', 'Piece', 'Litre', 'Kg')),
    stock_actuel NUMERIC(10,3) DEFAULT 0,
    seuil_alerte NUMERIC(10,3) DEFAULT 5,
    prix_gros NUMERIC(15,2) DEFAULT 0,
    prix_detail NUMERIC(15,2) DEFAULT 0,
    fournisseur TEXT,
    specifications TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quincaillerie_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'quincaillerie',
    materiau TEXT NOT NULL,
    unite_source TEXT NOT NULL,
    unite_cible TEXT NOT NULL,
    facteur_conversion NUMERIC(15,6) NOT NULL DEFAULT 1,
    exemple_application TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quincaillerie_chantiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'quincaillerie',
    reference TEXT UNIQUE DEFAULT concat('CHT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    nom_chantier TEXT NOT NULL,
    client_nom TEXT NOT NULL,
    adresse_chantier TEXT,
    chef_chantier TEXT,
    date_debut DATE DEFAULT CURRENT_DATE,
    date_fin_prevue DATE,
    statut TEXT DEFAULT 'EN_COURS' CHECK (statut IN ('EN_COURS', 'LIVRE', 'PAUSE', 'ANNULE')),
    montant_contrat NUMERIC(15,2) DEFAULT 0,
    montant_facture NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTEUR : ÉVÉNEMENTIEL
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.evenementiel_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'evenementiel',
    reference TEXT UNIQUE DEFAULT concat('EVT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    client_nom TEXT NOT NULL,
    client_tel TEXT,
    type_evenement TEXT CHECK (type_evenement IN ('Mariage', 'Bapteme', 'Conference', 'Anniversaire', 'Soiree', 'Gala', 'Autre')),
    salle TEXT,
    date_evenement DATE NOT NULL,
    heure_debut TIME,
    heure_fin TIME,
    nb_personnes INT DEFAULT 0,
    total_prestation NUMERIC(15,2) DEFAULT 0,
    acompte_verse NUMERIC(15,2) DEFAULT 0,
    solde_restant NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'RESERVE' CHECK (statut IN ('RESERVE', 'CONFIRME', 'EN_COURS', 'TERMINE', 'ANNULE')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.evenementiel_materiel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'evenementiel',
    code TEXT,
    designation TEXT NOT NULL,
    categorie TEXT CHECK (categorie IN ('Baches', 'Chaises', 'Tables', 'Sono', 'Eclairage', 'Tentes', 'Vaisselle', 'Autre')),
    quantite_totale INT DEFAULT 0,
    quantite_disponible INT DEFAULT 0,
    prix_location_jour NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'DISPONIBLE' CHECK (statut IN ('DISPONIBLE', 'LOUE', 'MAINTENANCE')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.evenementiel_prestations_traiteur (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'evenementiel',
    reference TEXT UNIQUE DEFAULT concat('TRT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    client_nom TEXT NOT NULL,
    evenement_ref TEXT,
    type_menu TEXT CHECK (type_menu IN ('Menu_Standard', 'Menu_VIP', 'Cocktail', 'Buffet', 'Grillade', 'Autre')),
    nb_couverts INT DEFAULT 0,
    prix_couvert NUMERIC(15,2) DEFAULT 0,
    montant_total NUMERIC(15,2) DEFAULT 0,
    chef_cuisinier TEXT,
    statut TEXT DEFAULT 'DEVIS' CHECK (statut IN ('DEVIS', 'CONFIRME', 'EN_PREPARATION', 'LIVRE')),
    date_prestation DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- SECTEUR : BRASSERIE — GRILLES TARIFAIRES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.brasserie_grilles_tarifaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    code_grille TEXT NOT NULL DEFAULT concat('GRL-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    nom_grille TEXT NOT NULL,
    type_client TEXT CHECK (type_client IN ('GROSSISTE', 'MAQUIS', 'DETAIL', 'VIP', 'AUTRE')),
    produit_nom TEXT,
    produit_id UUID,
    prix_reference NUMERIC(15,2) DEFAULT 0,
    prix_grille NUMERIC(15,2) DEFAULT 0,
    remise_pct NUMERIC(5,2) DEFAULT 0,
    quantite_min NUMERIC(10,0) DEFAULT 1,
    date_debut DATE DEFAULT CURRENT_DATE,
    date_fin DATE,
    est_actif BOOLEAN DEFAULT TRUE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT brasserie_grilles_sector_check CHECK (sector_slug = 'brasserie')
);

-- ══════════════════════════════════════════════════════════════════════════════
-- INDEXES pour performances
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_ecole_eleves_company ON public.ecole_eleves(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_ecole_paiements_company ON public.ecole_paiements_scolaires(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_ecole_notes_company ON public.ecole_notes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_ecole_absences_company ON public.ecole_absences(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_supermarche_rayons_company ON public.supermarche_rayons(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_supermarche_promos_company ON public.supermarche_promos(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_pharmacie_ordonnances_company ON public.pharmacie_ordonnances(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_pharmacie_lots_company ON public.pharmacie_lots(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_station_pompes_company ON public.station_pompes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_station_releves_company ON public.station_releves_pompes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_station_postes_company ON public.station_postes_journaliers(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_station_lubrifiants_company ON public.station_lubrifiants(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_hotel_chambres_company ON public.hotel_chambres(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_hotel_housekeeping_company ON public.hotel_housekeeping(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_garage_vehicules_company ON public.garage_vehicules(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_garage_ordres_company ON public.garage_ordres_reparation(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_membres_company ON public.microfinance_membres(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_credits_company ON public.microfinance_credits(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_agents_company ON public.microfinance_agents(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_tontine_cycles_company ON public.tontine_cycles(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_impression_devis_company ON public.impression_devis(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_impression_st_company ON public.impression_sous_traitance(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_location_biens_company ON public.location_biens(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_location_contrats_company ON public.location_contrats(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_location_quittances_company ON public.location_quittances(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_poissonnerie_chambres_company ON public.poissonnerie_chambres_froides(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_poissonnerie_pesees_company ON public.poissonnerie_pesees(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_poissonnerie_avaries_company ON public.poissonnerie_avaries(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_quincaillerie_materiaux_company ON public.quincaillerie_materiaux(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_quincaillerie_conversions_company ON public.quincaillerie_conversions(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_quincaillerie_chantiers_company ON public.quincaillerie_chantiers(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_evenementiel_reservations_company ON public.evenementiel_reservations(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_evenementiel_materiel_company ON public.evenementiel_materiel(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_evenementiel_traiteur_company ON public.evenementiel_prestations_traiteur(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_brasserie_grilles_company ON public.brasserie_grilles_tarifaires(company_id, sector_slug);

-- ══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS) — Isolation stricte par company_id
-- ══════════════════════════════════════════════════════════════════════════════

-- Activer RLS sur toutes les nouvelles tables
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'ecole_eleves', 'ecole_paiements_scolaires', 'ecole_notes', 'ecole_absences',
    'supermarche_rayons', 'supermarche_promos',
    'pharmacie_ordonnances', 'pharmacie_lots',
    'station_pompes', 'station_releves_pompes', 'station_postes_journaliers', 'station_lubrifiants',
    'hotel_chambres', 'hotel_housekeeping',
    'garage_vehicules', 'garage_ordres_reparation',
    'microfinance_membres', 'microfinance_credits', 'microfinance_agents', 'tontine_cycles',
    'impression_devis', 'impression_sous_traitance',
    'location_biens', 'location_contrats', 'location_quittances',
    'poissonnerie_chambres_froides', 'poissonnerie_pesees', 'poissonnerie_avaries',
    'quincaillerie_materiaux', 'quincaillerie_conversions', 'quincaillerie_chantiers',
    'evenementiel_reservations', 'evenementiel_materiel', 'evenementiel_prestations_traiteur',
    'brasserie_grilles_tarifaires'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "company_isolation" ON public.%I', tbl);
    EXECUTE format(
      'CREATE POLICY "company_isolation" ON public.%I
       USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
       WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))',
      tbl
    );
  END LOOP;
END$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- DONNÉES PAR DÉFAUT : Conversions Quincaillerie
-- ══════════════════════════════════════════════════════════════════════════════
-- Ces données sont insérées seulement si la table est vide (pour ne pas dupliquer)
-- Note: Sans company_id, ces données sont globales (à personnaliser par entreprise via l'interface)

-- FIN DE MIGRATION M030
-- =============================================================================
