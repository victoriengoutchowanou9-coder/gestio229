-- ==============================================================================
-- GESTIO 229 SAAS — ARCHITECTURE MULTI-SECTEURS
-- FICHIER : 00_hub_schema.sql
-- RÔLE : Plateforme Mère / HUB Central
-- GESTION : Utilisateurs, Entreprises, Abonnements, Secteurs souscrits, Accès
-- NOTE : Additif, préserve toutes les tables et données existantes.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Création du schéma HUB si supporté
CREATE SCHEMA IF NOT EXISTS hub;

-- ==============================================================================
-- 1. TABLE DES SECTEURS D'ACTIVITÉ OFFICIELS (19 SECTEURS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'Store',
    color VARCHAR(20) DEFAULT '#3B82F6',
    modules JSONB NOT NULL DEFAULT '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    specific_modules JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 2. TABLE DES ENTREPRISES (TENANTS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    legal_form VARCHAR(50) DEFAULT 'SARL',
    ifu_number VARCHAR(50),
    rccm_number VARCHAR(100),
    regime_fiscal VARCHAR(100) DEFAULT 'Régime Réel Simplifié (RRS)',
    address TEXT,
    city VARCHAR(100) DEFAULT 'Cotonou',
    country VARCHAR(100) DEFAULT 'Bénin',
    phone VARCHAR(50),
    email VARCHAR(150),
    currency VARCHAR(10) DEFAULT 'FCFA',
    tva_default_rate NUMERIC(5,2) DEFAULT 18.00,
    aib_default_rate NUMERIC(5,2) DEFAULT 1.00,
    active_sector VARCHAR(100) DEFAULT 'boutique',
    selected_sectors JSONB DEFAULT '["boutique"]'::jsonb,
    e_mecef_active BOOLEAN DEFAULT true,
    e_mecef_nim VARCHAR(100),
    subscription_status VARCHAR(50) DEFAULT 'trial',
    trial_ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
    onboarding_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_companies_ifu ON companies(ifu_number);
CREATE INDEX IF NOT EXISTS idx_companies_email ON companies(email);

-- ==============================================================================
-- 3. LIAISON ENTREPRISES <-> SECTEURS SOUSCRITS (ISOLATION D'ACCÈS HUB)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS company_sectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_id UUID REFERENCES sectors(id) ON DELETE RESTRICT,
    sector_slug VARCHAR(100) NOT NULL,
    is_configured BOOLEAN DEFAULT false,
    configuration JSONB DEFAULT '{}'::jsonb,
    activated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, sector_slug)
);

CREATE INDEX IF NOT EXISTS idx_company_sectors_comp ON company_sectors(company_id);
CREATE INDEX IF NOT EXISTS idx_company_sectors_slug ON company_sectors(sector_slug);

-- ==============================================================================
-- 4. INSERTION / SYNCHRONISATION DES 19 SECTEURS OFFICIELS GESTIO 229
-- ==============================================================================
INSERT INTO sectors (slug, name, description, icon, color, sort_order, modules, specific_modules)
VALUES
(
    'quincaillerie',
    'Quincaillerie & Matériaux',
    'Ciment, fer à béton, outillage, plomberie, électricité, vente gros/détail et suivi chantiers.',
    'Hammer',
    '#F59E0B',
    1,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["materiaux_btp","conversions_unites","suivi_chantiers"]'::jsonb
),
(
    'poissonnerie',
    'Poissonnerie & Produits Frais',
    'Poissons congelés, viandes, volailles, gestion des cartons, pesées et chambres froides.',
    'Fish',
    '#06B6D4',
    2,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["chambres_froides","pesee_cartons","avaries_peremption"]'::jsonb
),
(
    'restaurant',
    'Bar, Restaurant, Maquis & Fast Food',
    'Gestion des tables, commandes cuisine, menus du jour, livraisons et boissons.',
    'UtensilsCrossed',
    '#EF4444',
    3,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["plan_tables","commandes_cuisine","recettes_portions"]'::jsonb
),
(
    'supermarche',
    'Supermarché & Supérette',
    'Multiples rayons, douchette code-barres rapide, gestion des DLC et promotions.',
    'ShoppingBasket',
    '#10B981',
    4,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["rayons_gondoles","promos_dlc_courtes"]'::jsonb
),
(
    'pharmacie',
    'Pharmacie & Dépôt Médical',
    'Gestion des ordonnances, numéros de lot, dates de péremption et alertes santé.',
    'Pill',
    '#8B5CF6',
    5,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["ordonnances","lots_peremption","tarifs_assurance"]'::jsonb
),
(
    'station-service',
    'Station-Service & Hydrocarbures',
    'Index pompes, cuves, clôtures de postes pompistes, fûts et lubrifiants.',
    'Fuel',
    '#F97316',
    6,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["pompes_cuves","postes_pompiste","lubrifiants"]'::jsonb
),
(
    'hotel',
    'Hôtel, Résidence & Auberge',
    'Planning des chambres, réservations, check-in/out, room-service et nuitées.',
    'BedDouble',
    '#6366F1',
    7,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["planning_chambres","reservations_nuitees","services_etage"]'::jsonb
),
(
    'ecole',
    'École & Centre de Formation',
    'Frais de scolarité, effectifs élèves, tranches de paiement et reçus officiels.',
    'GraduationCap',
    '#84CC16',
    8,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["classes_eleves","tranches_scolarite","recus_scolaires"]'::jsonb
),
(
    'immobilier',
    'Gestion Locative & Immobilier',
    'Contrats de bail, suivi des loyers mensuels, quittances et relances impayés.',
    'Home',
    '#A855F7',
    9,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["biens_baux","quittances_loyer","impayes_relances"]'::jsonb
),
(
    'garage',
    'Atelier, Garage & Mécanique',
    'Ordres de réparation, pièces détachées, devis mécanique et main d’œuvre.',
    'Car',
    '#64748B',
    10,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["ordres_reparation","vehicules_parc","devis_mecanique"]'::jsonb
),
(
    'imprimerie',
    'Imprimerie & Sérigraphie',
    'Devis sur mesure, suivi des BAT, tirages offset/numérique et sous-traitance.',
    'Printer',
    '#EC4899',
    11,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["calculette_bat","tirages_ateliers","sous_traitance"]'::jsonb
),
(
    'brasserie',
    'Brasserie & Dépôt de Boissons',
    'Gestion des casiers consignés, bouteilles pleines/vides et grossistes.',
    'Wine',
    '#EAB308',
    12,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["consignation","grilles_tarifaires"]'::jsonb
),
(
    'microfinance',
    'Microfinance & Tontine',
    'Cotisations journalières, carnets de tontine, crédits et épargne solidaire.',
    'Banknote',
    '#14B8A6',
    13,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["cycles_tontine","carnets_epargne","demandes_credit"]'::jsonb
),
(
    'agrobusiness',
    'Agro-Business & Élevage',
    'Production agricole, intrants, provendes, cheptel, récoltes et ventes en gros.',
    'Sprout',
    '#22C55E',
    14,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["intrants_recoltes","suivi_cheptel","pesee_agricole"]'::jsonb
),
(
    'cosmetiques',
    'Cosmétiques & Salons de Beauté',
    'Prestations de soins, produits de beauté, coiffure et forfaits esthétiques.',
    'Sparkles',
    '#F43F5E',
    15,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["prestations_soins","forfaits_coiffure","rendez_vous"]'::jsonb
),
(
    'mercerie',
    'Mercerie & Couture',
    'Tissus au mètre, boutons, fermetures, commandes sur-mesure et retouches.',
    'Scissors',
    '#DB2777',
    16,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["tissus_metres","mesures_clients","confections_sur_mesure"]'::jsonb
),
(
    'boutique',
    'Boutique & Magasin',
    'Vente au détail, prêt-à-porter, alimentation générale, bazar et accessoires.',
    'Store',
    '#3B82F6',
    17,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["variantes_taille_couleur","codes_barres_comptoir"]'::jsonb
),
(
    'boulangerie',
    'Boulangerie & Pâtisserie',
    'Pains, viennoiseries, pâtisseries, gestion des fournées et invendus.',
    'Croissant',
    '#D97706',
    18,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["fournees_petrins","commandes_gateaux","invendus_pertes"]'::jsonb
),
(
    'transport',
    'Transport & Logistique',
    'Flotte de véhicules, suivi des trajets, bordereaux de livraison et fret.',
    'Truck',
    '#2563EB',
    19,
    '["dashboard","ventes","stock","caisse","tresorerie","clients","fournisseurs","depenses","reporting","configuration"]'::jsonb,
    '["flotte_vehicules","bordereaux_livraison","courses_fret"]'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    sort_order = EXCLUDED.sort_order,
    modules = EXCLUDED.modules,
    specific_modules = EXCLUDED.specific_modules,
    updated_at = now();
