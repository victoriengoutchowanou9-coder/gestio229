-- ==============================================================================
-- M012 : SEED - PLANS D'ABONNEMENT & 22 SECTEURS D'ACTIVITÉ
-- Données initiales de la plateforme GESTIO 229
-- ==============================================================================

-- ==============================================================================
-- 1. PLANS D'ABONNEMENT (FCFA/mois)
-- ==============================================================================
INSERT INTO subscription_plans (name, slug, max_sectors, max_users, max_products, price_monthly, price_yearly, features)
VALUES
(
    'Essai Gratuit', 'trial', 1, 3, 500, 0.00, 0.00,
    '["30 jours gratuits","1 secteur actif","3 utilisateurs","Support WhatsApp"]'::jsonb
),
(
    'Solo', 'solo', 1, 5, 2000, 5000.00, 50000.00,
    '["1 secteur actif","5 utilisateurs","E-MECEF/DGI","Mobile Money","Support WhatsApp","Facturation normalisée"]'::jsonb
),
(
    'Duo', 'duo', 2, 10, 5000, 8000.00, 80000.00,
    '["2 secteurs actifs","10 utilisateurs","E-MECEF/DGI","Mobile Money","Support prioritaire","Multi-caisses"]'::jsonb
),
(
    'Multiservices', 'multiservices', 10, 50, 20000, 15000.00, 150000.00,
    '["10 secteurs actifs","50 utilisateurs","E-MECEF/DGI","Hub consolidé","API Mobile Money","Rapports avancés","Support 24/7"]'::jsonb
),
(
    'Enterprise', 'enterprise', 99, 999, 999999, 30000.00, 300000.00,
    '["Secteurs illimités","Utilisateurs illimités","API personnalisée","Formation dédiée","Intégration comptabilité SYSCOHADA","Account Manager"]'::jsonb
)
ON CONFLICT (slug) DO NOTHING;

-- ==============================================================================
-- 2. SECTEURS D'ACTIVITÉ (22 secteurs)
-- Colonne modules : liste des modules COMMUNS activés par défaut
-- Colonne specific_modules : modules MÉTIER spécifiques
-- ==============================================================================
INSERT INTO sectors (slug, name, description, icon, color, modules, specific_modules, sort_order)
VALUES

-- Secteur 1 : Boutique / Commerce Général
(
    'boutique', 'Boutique / Commerce Général',
    'Commerce multi-produits, épicerie, bazar. Gestion simplifiée des ventes et du stock.',
    'Store', '#3B82F6',
    '["ventes","stock","finances","clients","fournisseurs","depenses","rapports","audit","equipe"]'::jsonb,
    '[]'::jsonb, 1
),

-- Secteur 2 : Supermarché
(
    'supermarche', 'Supermarché',
    'Grande surface, codes-barres, rayons multiples. Gestion avancée des stocks et promotions.',
    'ShoppingBasket', '#10B981',
    '["ventes","stock","finances","clients","fournisseurs","rh","depenses","rapports","audit","equipe"]'::jsonb,
    '[]'::jsonb, 2
),

-- Secteur 3 : Quincaillerie
(
    'quincaillerie', 'Quincaillerie',
    'Matériaux de construction, outillage, quincaillerie. Références multiples, prix en gros.',
    'Hammer', '#F59E0B',
    '["ventes","stock","finances","clients","fournisseurs","depenses","rapports","audit","equipe"]'::jsonb,
    '[]'::jsonb, 3
),

-- Secteur 4 : Restaurant / Maquis
(
    'restaurant', 'Restaurant / Maquis',
    'Restauration, tables, menus, commandes salle. Idéal pour maquis, restaurants, snacks.',
    'UtensilsCrossed', '#EF4444',
    '["ventes","stock","finances","clients","fournisseurs","rh","depenses","rapports","audit","equipe"]'::jsonb,
    '[]'::jsonb, 4
),

-- Secteur 5 : Pharmacie / Parapharmacie
(
    'pharmacie', 'Pharmacie / Parapharmacie',
    'Médicaments, lots, dates de péremption, ordonnances. Alertes stock et péremption automatiques.',
    'Pill', '#8B5CF6',
    '["ventes","stock","finances","clients","fournisseurs","depenses","rapports","audit","equipe"]'::jsonb,
    '["ordonnances","lots_peremption"]'::jsonb, 5
),

-- Secteur 6 : Station-Service
(
    'station-service', 'Station-Service',
    'Carburant, pompes, cuves, pompistes. Gestion des index, clôtures de postes, lubrifiants.',
    'Fuel', '#F97316',
    '["ventes","stock","finances","clients","depenses","rapports","audit","equipe"]'::jsonb,
    '["pompes_cuves","postes_pompiste","lubrifiants"]'::jsonb, 6
),

-- Secteur 7 : Hôtel / Résidence
(
    'hotel', 'Hôtel / Résidence',
    'Chambres, catégories, réservations, check-in/out. Services, consommations, housekeeping.',
    'BedDouble', '#06B6D4',
    '["ventes","finances","clients","rh","depenses","rapports","audit","equipe"]'::jsonb,
    '["chambres_reservations","housekeeping"]'::jsonb, 7
),

-- Secteur 8 : École / Établissement Scolaire
(
    'ecole', 'École / Établissement Scolaire',
    'Élèves, classes, frais scolaires, notes, absences. Gestion complète de l''établissement.',
    'GraduationCap', '#84CC16',
    '["finances","clients","rh","depenses","rapports","audit","equipe"]'::jsonb,
    '["eleves","frais_scolaires","notes_resultats","absences"]'::jsonb, 8
),

-- Secteur 9 : Gestion Locative
(
    'location', 'Gestion Locative / Immobilier',
    'Biens, logements, contrats de bail, loyers. Suivi des impayés, charges, réparations.',
    'Home', '#A855F7',
    '["finances","clients","depenses","rapports","audit","equipe"]'::jsonb,
    '["biens_locations","contrats_loyers","quittances"]'::jsonb, 9
),

-- Secteur 10 : Atelier / Garage
(
    'garage', 'Atelier / Garage Automobile',
    'Véhicules, immatriculations, ordres de réparation, pièces. Devis et factures mécaniques.',
    'Car', '#6B7280',
    '["ventes","stock","finances","clients","fournisseurs","depenses","rapports","audit","equipe"]'::jsonb,
    '["vehicules_reparations","ordres_reparation"]'::jsonb, 10
),

-- Secteur 11 : Centre d'Impression
(
    'impression', 'Centre d''Impression',
    'Devis, commandes, production, sous-traitance. Matières premières, graphiste, fichiers.',
    'Printer', '#EC4899',
    '["ventes","stock","finances","clients","fournisseurs","depenses","rapports","audit","equipe"]'::jsonb,
    '["devis_production","sous_traitance"]'::jsonb, 11
),

-- Secteur 12 : Brasserie / Distributeur Boissons
(
    'brasserie', 'Brasserie / Distribution Boissons',
    'Vente de boissons, gestion des consignes (casiers), grilles tarifaires spéciales.',
    'Wine', '#FCD34D',
    '["ventes","stock","finances","clients","fournisseurs","depenses","rapports","audit","equipe"]'::jsonb,
    '["consignation","grilles_tarifaires"]'::jsonb, 12
),

-- Secteur 13 : Microfinance / IMF
(
    'microfinance', 'Microfinance / IMF',
    'Membres, épargne, crédits, remboursements. Portefeuille, agents collecteurs, commissions.',
    'Banknote', '#34D399',
    '["finances","clients","rh","depenses","rapports","audit","equipe"]'::jsonb,
    '["membres_epargne","credits","agents_collecteurs"]'::jsonb, 13
),

-- Secteur 14 : Tontine / Association
(
    'tontine', 'Tontine / Association',
    'Cycles de cotisation, membres, collecteurs. Clôture de cycle et distributions.',
    'Users', '#60A5FA',
    '["finances","clients","depenses","rapports","audit","equipe"]'::jsonb,
    '["membres_epargne","tontine_cycles"]'::jsonb, 14
),

-- Secteur 15 : Poissonnerie / Produits Frais
(
    'poissonnerie', 'Poissonnerie / Produits Frais',
    'Vente de poissons et produits de la mer. Gestion du stock frais, prix à la criée.',
    'Fish', '#38BDF8',
    '["ventes","stock","finances","clients","fournisseurs","depenses","rapports","audit","equipe"]'::jsonb,
    '[]'::jsonb, 15
),

-- Secteur 16 : Mode / Habillement
(
    'mode', 'Mode / Habillement',
    'Vêtements, chaussures, accessoires. Gestion des tailles, couleurs, collections.',
    'Shirt', '#FB7185',
    '["ventes","stock","finances","clients","fournisseurs","depenses","rapports","audit","equipe"]'::jsonb,
    '[]'::jsonb, 16
),

-- Secteur 17 : Électronique / High-Tech
(
    'electronique', 'Électronique / High-Tech',
    'Téléphones, TV, appareils électroniques. Gestion des garanties et SAV.',
    'Cpu', '#A78BFA',
    '["ventes","stock","finances","clients","fournisseurs","depenses","rapports","audit","equipe"]'::jsonb,
    '[]'::jsonb, 17
),

-- Secteur 18 : Pièces Détachées Auto
(
    'pieces-detachees', 'Pièces Détachées Auto',
    'Pièces automobiles et motos. Références, compatibilité véhicule, marques.',
    'Settings', '#94A3B8',
    '["ventes","stock","finances","clients","fournisseurs","depenses","rapports","audit","equipe"]'::jsonb,
    '[]'::jsonb, 18
),

-- Secteur 19 : Prestation de Services
(
    'prestation', 'Prestation de Services',
    'Facturation de services, missions, abonnements. Idéal pour cabinets, agences, freelances.',
    'Briefcase', '#FB923C',
    '["ventes","finances","clients","fournisseurs","rh","depenses","rapports","audit","equipe"]'::jsonb,
    '[]'::jsonb, 19
),

-- Secteur 20 : Distribution / Grossiste
(
    'distribution', 'Distribution / Grossiste',
    'Commerce en gros, tournées de livraison, dépôts régionaux. Gestion multi-entrepôts.',
    'Truck', '#4ADE80',
    '["ventes","stock","finances","clients","fournisseurs","rh","depenses","rapports","audit","equipe"]'::jsonb,
    '[]'::jsonb, 20
),

-- Secteur 21 : Église / Organisation Religieuse
(
    'eglise', 'Église / Organisation Religieuse',
    'Offrandes, dîmes, projets, dépenses. Gestion des membres et contribution communautaire.',
    'Heart', '#F472B6',
    '["finances","clients","rh","depenses","rapports","audit","equipe"]'::jsonb,
    '[]'::jsonb, 21
),

-- Secteur 22 : Entreprise BTP / Industrie
(
    'entreprise', 'Entreprise BTP / Industrie',
    'Chantiers, devis travaux, sous-traitance. RH complet, matériaux, facturation B2B.',
    'Building2', '#CBD5E1',
    '["ventes","stock","finances","clients","fournisseurs","rh","depenses","rapports","audit","equipe"]'::jsonb,
    '[]'::jsonb, 22
)

ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    modules = EXCLUDED.modules,
    specific_modules = EXCLUDED.specific_modules,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- ==============================================================================
-- 3. MISE À JOUR DES ENTREPRISES DE TEST (migration active_sector → company_sectors)
-- ==============================================================================

-- Lier les entreprises de test existantes à leurs secteurs
DO $$
DECLARE
    v_boutique_sector_id UUID;
    v_restaurant_sector_id UUID;
    v_solo_plan_id UUID;
BEGIN
    SELECT id INTO v_boutique_sector_id FROM sectors WHERE slug = 'boutique';
    SELECT id INTO v_restaurant_sector_id FROM sectors WHERE slug = 'restaurant';
    SELECT id INTO v_solo_plan_id FROM subscription_plans WHERE slug = 'solo';

    -- Entreprise 1 (Boutique test)
    IF v_boutique_sector_id IS NOT NULL THEN
        INSERT INTO company_sectors (company_id, sector_id, is_configured)
        VALUES ('11111111-1111-1111-1111-111111111111', v_boutique_sector_id, true)
        ON CONFLICT DO NOTHING;

        UPDATE companies
        SET plan_id = v_solo_plan_id, subscription_status = 'active', onboarding_completed = true
        WHERE id = '11111111-1111-1111-1111-111111111111';

        INSERT INTO subscriptions (company_id, plan_id, status, started_at, expires_at)
        VALUES (
            '11111111-1111-1111-1111-111111111111',
            v_solo_plan_id,
            'active',
            now(),
            now() + INTERVAL '1 year'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Entreprise 2 (Restaurant test)
    IF v_restaurant_sector_id IS NOT NULL THEN
        INSERT INTO company_sectors (company_id, sector_id, is_configured)
        VALUES ('22222222-2222-2222-2222-222222222222', v_restaurant_sector_id, true)
        ON CONFLICT DO NOTHING;

        UPDATE companies
        SET plan_id = v_solo_plan_id, subscription_status = 'active', onboarding_completed = true
        WHERE id = '22222222-2222-2222-2222-222222222222';

        INSERT INTO subscriptions (company_id, plan_id, status, started_at, expires_at)
        VALUES (
            '22222222-2222-2222-2222-222222222222',
            v_solo_plan_id,
            'active',
            now(),
            now() + INTERVAL '1 year'
        )
        ON CONFLICT DO NOTHING;
    END IF;

    -- Créer les rôles par défaut pour les entreprises de test
    PERFORM create_default_roles('11111111-1111-1111-1111-111111111111');
    PERFORM create_default_roles('22222222-2222-2222-2222-222222222222');
END $$;

-- ==============================================================================
-- 4. TRIGGER : Mise à jour automatique updated_at
-- ==============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trigger_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE TRIGGER trigger_sectors_updated_at
    BEFORE UPDATE ON sectors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ==============================================================================
-- 5. FONCTION : Vérification statut abonnement (utilisée par l'application)
-- ==============================================================================
CREATE OR REPLACE FUNCTION check_subscription_status(p_company_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_sub RECORD;
    v_status VARCHAR(50);
    v_days_remaining INT;
BEGIN
    SELECT s.*, sp.name AS plan_name, sp.max_sectors, sp.max_users
    INTO v_sub
    FROM subscriptions s
    JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE s.company_id = p_company_id
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('status', 'no_subscription', 'is_active', false);
    END IF;

    v_days_remaining := EXTRACT(DAY FROM (v_sub.expires_at - now()))::INT;

    -- Logique de transition automatique des états
    IF v_sub.expires_at IS NOT NULL AND v_sub.expires_at < now() THEN
        IF v_sub.grace_ends_at IS NULL THEN
            v_status := 'expired';
        ELSIF v_sub.grace_ends_at > now() THEN
            v_status := 'grace_period';
        ELSE
            v_status := 'readonly';
        END IF;
    ELSE
        v_status := v_sub.status;
    END IF;

    RETURN jsonb_build_object(
        'status', v_status,
        'is_active', v_status IN ('trial', 'active', 'grace_period'),
        'is_readonly', v_status = 'readonly',
        'is_suspended', v_status = 'suspended',
        'days_remaining', GREATEST(v_days_remaining, 0),
        'expires_at', v_sub.expires_at,
        'plan_name', v_sub.plan_name,
        'max_sectors', v_sub.max_sectors,
        'max_users', v_sub.max_users
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
