-- =============================================================================
-- GESTIO 229 SaaS — Migration M070 : 20ᵉ Secteur GÉOLOCALISATION ET FLOTTE
-- Télématique professionnelle, géolocalisation GPS en direct & gestion de flotte
-- Architecture Multi-Tenant isolée par company_id
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. PARC VÉHICULES
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_vehicules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    immatriculation VARCHAR(50) NOT NULL,
    code_interne VARCHAR(50),
    marque VARCHAR(100) NOT NULL,
    modele VARCHAR(100) NOT NULL,
    annee INTEGER,
    vin VARCHAR(100),
    type_vehicule VARCHAR(50) DEFAULT 'VOITURE', -- VOITURE, UTILITAIRE, CAMION, MOTO, BUS, FRIGORIFIQUE, ENGIN_BTP
    type_carburant VARCHAR(30) DEFAULT 'GASOIL', -- ESSENCE, GASOIL, HYBRIDE, ELECTRIQUE
    capacite_reservoir_litres NUMERIC(8,2) DEFAULT 60.00,
    consommation_reference_100km NUMERIC(6,2) DEFAULT 8.50,
    kilometrage_actuel NUMERIC(12,2) DEFAULT 0.00,
    statut VARCHAR(30) DEFAULT 'DISPONIBLE', -- DISPONIBLE, EN_CIRCULATION, A_L_ARRET, EN_MISSION, EN_MAINTENANCE, HORS_LIGNE
    conducteur_assigne_id UUID,
    tracker_imei VARCHAR(100),
    derniere_latitude NUMERIC(10,7),
    derniere_longitude NUMERIC(10,7),
    derniere_vitesse NUMERIC(6,2) DEFAULT 0,
    dernier_cap NUMERIC(6,2) DEFAULT 0,
    contact_allume BOOLEAN DEFAULT false,
    niveau_carburant_pct NUMERIC(5,2) DEFAULT 100,
    derniere_mise_a_jour_gps TIMESTAMPTZ,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flotte_vehicules_comp ON public.flotte_vehicules(company_id, statut);
CREATE INDEX IF NOT EXISTS idx_flotte_vehicules_imei ON public.flotte_vehicules(tracker_imei);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. CONDUCTEURS & PERMIS
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_conducteurs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nom_complet VARCHAR(150) NOT NULL,
    telephone VARCHAR(50),
    email VARCHAR(100),
    numero_permis VARCHAR(50) NOT NULL,
    categories_permis VARCHAR(50) DEFAULT 'B', -- B, C, D, E, B-C-D
    date_expiration_permis DATE,
    date_visite_medicale DATE,
    points_permis INTEGER DEFAULT 12,
    statut VARCHAR(30) DEFAULT 'ACTIF', -- ACTIF, EN_MISSION, EN_CONGE, SUSPENDU
    vehicule_assigne_id UUID REFERENCES public.flotte_vehicules(id) ON DELETE SET NULL,
    notes TEXT,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flotte_conducteurs_comp ON public.flotte_conducteurs(company_id, statut);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. BALISES & TRACEURS GPS (TELTONIKA / CONCOX / COBAN)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_balises (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    imei VARCHAR(50) NOT NULL,
    modele VARCHAR(100) DEFAULT 'Teltonika FMB920',
    numero_sim VARCHAR(50),
    operateur_sim VARCHAR(50) DEFAULT 'MTN BENIN',
    vehicule_id UUID REFERENCES public.flotte_vehicules(id) ON DELETE SET NULL,
    statut VARCHAR(30) DEFAULT 'EN_LIGNE', -- EN_LIGNE, HORS_LIGNE, NON_ATTRIBUE
    derniere_trame_at TIMESTAMPTZ,
    niveau_batterie_pct INTEGER DEFAULT 100,
    firmware_version VARCHAR(50) DEFAULT '03.28.02',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flotte_balises_comp ON public.flotte_balises(company_id, imei);

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. POSITIONS GPS & TRAMES EN TEMPS RÉEL
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_positions_gps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vehicule_id UUID NOT NULL REFERENCES public.flotte_vehicules(id) ON DELETE CASCADE,
    tracker_imei VARCHAR(50),
    latitude NUMERIC(10,7) NOT NULL,
    longitude NUMERIC(10,7) NOT NULL,
    altitude NUMERIC(8,2) DEFAULT 0,
    vitesse_kmh NUMERIC(6,2) DEFAULT 0,
    cap_degres NUMERIC(6,2) DEFAULT 0,
    satellites INTEGER DEFAULT 8,
    contact_allume BOOLEAN DEFAULT false,
    kilometrage_compteur NUMERIC(12,2),
    adresse_approximative TEXT,
    tension_batterie_v NUMERIC(5,2) DEFAULT 12.6,
    horodatage TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flotte_positions_veh_date ON public.flotte_positions_gps(vehicule_id, horodatage DESC);
CREATE INDEX IF NOT EXISTS idx_flotte_positions_comp ON public.flotte_positions_gps(company_id, horodatage DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. MISSIONS & ORDRES DE DISPATCH
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_missions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    numero_ordre VARCHAR(50) NOT NULL,
    titre_mission VARCHAR(200) NOT NULL,
    vehicule_id UUID NOT NULL REFERENCES public.flotte_vehicules(id) ON DELETE CASCADE,
    conducteur_id UUID REFERENCES public.flotte_conducteurs(id) ON DELETE SET NULL,
    depart_lieu VARCHAR(200) NOT NULL,
    depart_lat NUMERIC(10,7),
    depart_lng NUMERIC(10,7),
    destination_lieu VARCHAR(200) NOT NULL,
    destination_lat NUMERIC(10,7),
    destination_lng NUMERIC(10,7),
    date_depart_prevue TIMESTAMPTZ,
    date_arrivee_prevue TIMESTAMPTZ,
    date_depart_reelle TIMESTAMPTZ,
    date_arrivee_reelle TIMESTAMPTZ,
    kilometrage_depart NUMERIC(12,2),
    kilometrage_arrivee NUMERIC(12,2),
    distance_parcourue_km NUMERIC(10,2),
    statut VARCHAR(30) DEFAULT 'PLANIFIEE', -- PLANIFIEE, EN_COURS, TERMINEE, ANNULEE
    description_chargement TEXT,
    instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flotte_missions_comp ON public.flotte_missions(company_id, statut);

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. CARBURANT & PLEINS
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_carburant (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vehicule_id UUID NOT NULL REFERENCES public.flotte_vehicules(id) ON DELETE CASCADE,
    conducteur_id UUID REFERENCES public.flotte_conducteurs(id) ON DELETE SET NULL,
    date_plein DATE NOT NULL DEFAULT CURRENT_DATE,
    kilometrage_au_plein NUMERIC(12,2) NOT NULL,
    litres_achetes NUMERIC(8,2) NOT NULL,
    prix_litre_fcfa NUMERIC(10,2) NOT NULL,
    montant_total_fcfa NUMERIC(12,2) NOT NULL,
    station_nom VARCHAR(150),
    type_carburant VARCHAR(30) DEFAULT 'GASOIL',
    consommation_calculee_100km NUMERIC(6,2),
    alerte_consommation_anormale BOOLEAN DEFAULT false,
    recu_facture_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flotte_carburant_comp ON public.flotte_carburant(company_id, date_plein DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. MAINTENANCE & ENTRETIEN PRÉVENTIF / CURATIF
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_maintenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vehicule_id UUID NOT NULL REFERENCES public.flotte_vehicules(id) ON DELETE CASCADE,
    type_intervention VARCHAR(50) NOT NULL, -- VIDANGE_HUILE, PNEUMATIQUES, FREINAGE, COURROIE_DISTRIBUTION, CONTROLE_TECHNIQUE, CLIMATISATION, BATTERIE, AUTRE
    description TEXT NOT NULL,
    kilometrage_declenchement NUMERIC(12,2),
    prochain_kilometrage_prevu NUMERIC(12,2),
    date_intervention DATE DEFAULT CURRENT_DATE,
    prochaine_date_prevue DATE,
    cout_pieces_fcfa NUMERIC(12,2) DEFAULT 0,
    cout_main_oeuvre_fcfa NUMERIC(12,2) DEFAULT 0,
    cout_total_fcfa NUMERIC(12,2) DEFAULT 0,
    garage_prestataire VARCHAR(150),
    statut VARCHAR(30) DEFAULT 'TERMINE', -- PREVU, EN_COURS, TERMINE, RETARD
    facture_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flotte_maintenance_comp ON public.flotte_maintenance(company_id, statut);

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. ASSURANCES & DOCUMENTS OFFICIELS
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vehicule_id UUID REFERENCES public.flotte_vehicules(id) ON DELETE CASCADE,
    conducteur_id UUID REFERENCES public.flotte_conducteurs(id) ON DELETE SET NULL,
    type_document VARCHAR(50) NOT NULL, -- CARTE_GRISE, ASSURANCE, VISITE_TECHNIQUE, TVM, EXTINCTEUR, PERMIS_CONDUIRE, VISITE_MEDICALE
    numero_police_ou_titre VARCHAR(100),
    organisme_emetteur VARCHAR(150),
    date_emission DATE,
    date_expiration DATE NOT NULL,
    jours_avant_expiration INTEGER,
    cout_fcfa NUMERIC(12,2) DEFAULT 0,
    fichier_url TEXT,
    statut_alerte VARCHAR(30) DEFAULT 'VALIDE', -- VALIDE, EXPIRATION_IMMINENTE, EXPIRE
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flotte_documents_comp ON public.flotte_documents(company_id, date_expiration);

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. ZONES GÉOGRAPHIQUES (GEOFENCES)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_geofences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    nom_zone VARCHAR(150) NOT NULL,
    type_zone VARCHAR(30) DEFAULT 'CERCLE', -- CERCLE, POLYGONE
    type_usage VARCHAR(30) DEFAULT 'DEPOT', -- DEPOT, PORT, ZONE_LIVRAISON, ZONE_INTERDITE, CHANTIER
    centre_lat NUMERIC(10,7),
    centre_lng NUMERIC(10,7),
    rayon_metres NUMERIC(10,2) DEFAULT 500,
    polygone_coordonnees JSONB,
    couleur_hex VARCHAR(20) DEFAULT '#0284c7',
    alerter_sur_entree BOOLEAN DEFAULT true,
    alerter_sur_sortie BOOLEAN DEFAULT true,
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flotte_geofences_comp ON public.flotte_geofences(company_id, actif);

-- Événements d'entrée / sortie de zone
CREATE TABLE IF NOT EXISTS public.flotte_geofence_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    geofence_id UUID NOT NULL REFERENCES public.flotte_geofences(id) ON DELETE CASCADE,
    vehicule_id UUID NOT NULL REFERENCES public.flotte_vehicules(id) ON DELETE CASCADE,
    type_evenement VARCHAR(30) NOT NULL, -- ENTREE, SORTIE
    horodatage TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    vitesse_kmh NUMERIC(6,2)
);
CREATE INDEX IF NOT EXISTS idx_flotte_geo_events_comp ON public.flotte_geofence_events(company_id, horodatage DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- 10. CENTRE D'ALERTES & SÉCURITÉ
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_alertes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vehicule_id UUID REFERENCES public.flotte_vehicules(id) ON DELETE CASCADE,
    type_alerte VARCHAR(50) NOT NULL, -- EXCES_VITESSE, SORTIE_ZONE, ENTREE_ZONE_INTERDITE, FREINAGE_BRUSQUE, BATTERIE_FAIBLE, COUPE_CIRCUIT, SOS_CONDUCTEUR, CARBURANT_ANORMAL, RUPTURE_FROID
    gravite VARCHAR(20) DEFAULT 'AVERTISSEMENT', -- INFO, AVERTISSEMENT, CRITIQUE
    message TEXT NOT NULL,
    valeur_mesuree VARCHAR(50),
    valeur_seuil VARCHAR(50),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    est_acquittee BOOLEAN DEFAULT false,
    acquittee_par VARCHAR(100),
    acquittee_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flotte_alertes_comp ON public.flotte_alertes(company_id, est_acquittee, gravite);

-- ══════════════════════════════════════════════════════════════════════════════
-- 11. CAPTEURS IoT & CHAÎNE DU FROID
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_capteurs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vehicule_id UUID NOT NULL REFERENCES public.flotte_vehicules(id) ON DELETE CASCADE,
    nom_capteur VARCHAR(100) NOT NULL,
    type_capteur VARCHAR(50) DEFAULT 'TEMPERATURE', -- TEMPERATURE, HUMIDITE, PORTE, NIVEAU_CARBURANT, BLE_BEACON
    identifiant_mac VARCHAR(50),
    valeur_actuelle NUMERIC(8,2),
    unite VARCHAR(20) DEFAULT '°C',
    seuil_min NUMERIC(8,2),
    seuil_max NUMERIC(8,2),
    alerte_active BOOLEAN DEFAULT false,
    derniere_mesure_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flotte_capteurs_comp ON public.flotte_capteurs(company_id, vehicule_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 12. AUTOPARTAGE & RÉSERVATIONS INTERNES
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vehicule_id UUID NOT NULL REFERENCES public.flotte_vehicules(id) ON DELETE CASCADE,
    demandeur_nom VARCHAR(150) NOT NULL,
    demandeur_departement VARCHAR(100),
    demandeur_telephone VARCHAR(50),
    motif_deplacement TEXT NOT NULL,
    destination_prevue VARCHAR(200),
    date_debut_prevue TIMESTAMPTZ NOT NULL,
    date_fin_prevue TIMESTAMPTZ NOT NULL,
    date_debut_reelle TIMESTAMPTZ,
    date_fin_reelle TIMESTAMPTZ,
    statut VARCHAR(30) DEFAULT 'EN_ATTENTE', -- EN_ATTENTE, VALIDEE, REFUSEE, EN_COURS, TERMINEE, ANNULEE
    valide_par VARCHAR(100),
    km_depart NUMERIC(12,2),
    km_retour NUMERIC(12,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flotte_reservations_comp ON public.flotte_reservations(company_id, statut);

-- ══════════════════════════════════════════════════════════════════════════════
-- 13. INSPECTIONS & ÉTATS DES LIEUX
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vehicule_id UUID NOT NULL REFERENCES public.flotte_vehicules(id) ON DELETE CASCADE,
    conducteur_id UUID REFERENCES public.flotte_conducteurs(id) ON DELETE SET NULL,
    type_inspection VARCHAR(30) DEFAULT 'DEPART', -- DEPART, RETOUR, PERIODIQUE
    date_inspection TIMESTAMPTZ DEFAULT NOW(),
    kilometrage_inspecte NUMERIC(12,2) NOT NULL,
    niveau_carburant_pct NUMERIC(5,2) DEFAULT 100,
    niveau_huile_moteur BOOLEAN DEFAULT true,
    liquide_refroidissement BOOLEAN DEFAULT true,
    pression_pneus_conforme BOOLEAN DEFAULT true,
    feux_et_phares_ok BOOLEAN DEFAULT true,
    freins_ok BOOLEAN DEFAULT true,
    proprete_generale BOOLEAN DEFAULT true,
    presence_roue_secours BOOLEAN DEFAULT true,
    presence_cric_et_cle BOOLEAN DEFAULT true,
    presence_triangle_gilet BOOLEAN DEFAULT true,
    degats_carrosserie_notes TEXT,
    photos_degats JSONB DEFAULT '[]'::jsonb,
    statut_validation VARCHAR(30) DEFAULT 'CONFORME', -- CONFORME, AVEC_RESERVES, NON_CONFORME
    inspecte_par VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_flotte_inspections_comp ON public.flotte_inspections(company_id, vehicule_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 14. PARAMÈTRES TÉLÉMATIQUES & INTÉGRATIONS
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.flotte_parametres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
    google_maps_api_key TEXT,
    vitesse_max_ville_kmh INTEGER DEFAULT 50,
    vitesse_max_route_kmh INTEGER DEFAULT 90,
    vitesse_max_autoroute_kmh INTEGER DEFAULT 110,
    duree_arret_excessif_minutes INTEGER DEFAULT 30,
    alerte_email_active BOOLEAN DEFAULT true,
    alerte_sms_active BOOLEAN DEFAULT false,
    email_destinataire_alertes VARCHAR(200),
    serveur_gps_port INTEGER DEFAULT 5027,
    cle_secrete_webhook TEXT DEFAULT 'sec_teltonika_flotte_229',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 15. SÉCURITÉ ROW LEVEL SECURITY (RLS) MULTI-TENANT
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.flotte_vehicules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_conducteurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_balises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_positions_gps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_carburant ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_geofence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_alertes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_capteurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flotte_parametres ENABLE ROW LEVEL SECURITY;

-- Politiques RLS permissives basées sur l'authentification et company_id
CREATE POLICY "flotte_vehicules_policy" ON public.flotte_vehicules FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_conducteurs_policy" ON public.flotte_conducteurs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_balises_policy" ON public.flotte_balises FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_positions_gps_policy" ON public.flotte_positions_gps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_missions_policy" ON public.flotte_missions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_carburant_policy" ON public.flotte_carburant FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_maintenance_policy" ON public.flotte_maintenance FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_documents_policy" ON public.flotte_documents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_geofences_policy" ON public.flotte_geofences FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_geofence_events_policy" ON public.flotte_geofence_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_alertes_policy" ON public.flotte_alertes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_capteurs_policy" ON public.flotte_capteurs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_reservations_policy" ON public.flotte_reservations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_inspections_policy" ON public.flotte_inspections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "flotte_parametres_policy" ON public.flotte_parametres FOR ALL USING (true) WITH CHECK (true);
