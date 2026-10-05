-- =============================================================================
-- GESTIO 229 SaaS — M032 : ERP Spécialisé Bar, Restaurant, Maquis & Fast-Food
-- =============================================================================
-- Migration exclusive pour le secteur : "restaurant"
-- (Bar, Restaurant, Maquis, Fast-Food, Lounge & CHR)
-- Isolation stricte : company_id + sector_slug = 'restaurant'
-- IDEMPOTENT & NON DESTRUCTIF
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. ZONES DU RESTAURANT (Salle, Terrasse, VIP, Bar, Patio, etc.)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    code TEXT NOT NULL,
    nom TEXT NOT NULL,
    description TEXT,
    ordre_affichage INT DEFAULT 1,
    est_actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.restaurant_zones ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_zones ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'restaurant';
ALTER TABLE public.restaurant_zones ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.restaurant_zones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.restaurant_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.restaurant_zones;
CREATE POLICY "company_isolation" ON public.restaurant_zones FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. TABLES ET PLAN DE SALLE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    numero_table TEXT NOT NULL,
    nom TEXT,
    zone TEXT DEFAULT 'Salle principale',
    capacite INT DEFAULT 4,
    statut TEXT DEFAULT 'LIBRE' CHECK (statut IN ('LIBRE', 'OCCUPEE', 'RESERVEE', 'EN_PREPARATION', 'EN_ATTENTE_PAIEMENT', 'NETTOYAGE', 'HORS_SERVICE')),
    serveur_assigne TEXT,
    montant_actuel NUMERIC(15,2) DEFAULT 0,
    commande_active_id UUID,
    position_x INT DEFAULT 0,
    position_y INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'restaurant';
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS nom TEXT;
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS montant_actuel NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS commande_active_id UUID;
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.restaurant_tables;
CREATE POLICY "company_isolation" ON public.restaurant_tables FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. COMMANDES RESTAURANT (Cycle complet de table, addition, statut)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_commandes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    numero_commande TEXT NOT NULL,
    table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
    table_numero TEXT NOT NULL,
    type_commande TEXT NOT NULL DEFAULT 'SUR_PLACE' CHECK (type_commande IN ('SUR_PLACE', 'A_EMPORTER', 'LIVRAISON')),
    serveur_nom TEXT NOT NULL,
    client_nom TEXT DEFAULT 'Client Comptoir',
    client_tel TEXT,
    statut TEXT NOT NULL DEFAULT 'OUVERTE' CHECK (statut IN ('OUVERTE', 'EN_PREPARATION', 'PRETE', 'SERVIE', 'EN_PAIEMENT', 'CLOTUREE', 'ANNULEE')),
    statut_paiement TEXT NOT NULL DEFAULT 'EN_ATTENTE' CHECK (statut_paiement IN ('EN_ATTENTE', 'PARTIEL', 'SOLDE')),
    total_ht NUMERIC(15,2) DEFAULT 0,
    total_tva NUMERIC(15,2) DEFAULT 0,
    total_aib NUMERIC(15,2) DEFAULT 0,
    total_ttc NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_paye NUMERIC(15,2) DEFAULT 0,
    reste_a_payer NUMERIC(15,2) DEFAULT 0,
    mode_reglement TEXT,
    couverts INT DEFAULT 1,
    notes TEXT,
    motif_annulation TEXT,
    annule_par TEXT,
    heure_ouverture TIMESTAMPTZ DEFAULT NOW(),
    heure_cloture TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'restaurant';
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.restaurant_commandes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.restaurant_commandes;
CREATE POLICY "company_isolation" ON public.restaurant_commandes FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. LIGNES DE COMMANDE & DISPATCH CUISINE / BAR (KDS)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_commande_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    commande_id UUID REFERENCES public.restaurant_commandes(id) ON DELETE CASCADE,
    produit_id TEXT,
    designation TEXT NOT NULL,
    destination TEXT NOT NULL DEFAULT 'CUISINE' CHECK (destination IN ('CUISINE', 'BAR', 'DIRECT')),
    quantite NUMERIC(10,2) NOT NULL DEFAULT 1,
    prix_unitaire NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ligne NUMERIC(15,2) NOT NULL DEFAULT 0,
    statut_preparation TEXT NOT NULL DEFAULT 'NOUVEAU' CHECK (statut_preparation IN ('NOUVEAU', 'EN_PREPARATION', 'PRET', 'SERVI', 'ANNULE')),
    est_offert BOOLEAN DEFAULT FALSE,
    motif_offert TEXT,
    offert_par TEXT,
    est_annule BOOLEAN DEFAULT FALSE,
    motif_annulation TEXT,
    annule_par TEXT,
    notes_cuisson TEXT,
    heure_commande TIMESTAMPTZ DEFAULT NOW(),
    heure_prete TIMESTAMPTZ,
    heure_servie TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.restaurant_commande_lignes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_commande_lignes ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'restaurant';
ALTER TABLE public.restaurant_commande_lignes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.restaurant_commande_lignes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.restaurant_commande_lignes;
CREATE POLICY "company_isolation" ON public.restaurant_commande_lignes FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. FICHES TECHNIQUES & RECETTES (Consommation matières premières)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_fiches_techniques (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    plat_nom TEXT NOT NULL,
    ingredient_nom TEXT NOT NULL,
    quantite_necessaire NUMERIC(10,3) NOT NULL DEFAULT 1,
    unite TEXT NOT NULL DEFAULT 'kg',
    cout_unitaire NUMERIC(15,2) DEFAULT 0,
    cout_matiere_ligne NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.restaurant_fiches_techniques ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_fiches_techniques ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'restaurant';
ALTER TABLE public.restaurant_fiches_techniques ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.restaurant_fiches_techniques ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.restaurant_fiches_techniques;
CREATE POLICY "company_isolation" ON public.restaurant_fiches_techniques FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. RÉSERVATIONS DE TABLES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    reference TEXT UNIQUE DEFAULT concat('RES-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    client_nom TEXT NOT NULL,
    client_tel TEXT NOT NULL,
    nb_personnes INT NOT NULL DEFAULT 2,
    table_id UUID REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
    table_numero TEXT,
    zone TEXT DEFAULT 'Salle principale',
    date_reservation DATE NOT NULL DEFAULT CURRENT_DATE,
    heure_reservation TIME NOT NULL DEFAULT '19:30',
    statut TEXT NOT NULL DEFAULT 'RESERVEE' CHECK (statut IN ('RESERVEE', 'CONFIRMEE', 'ARRIVEE', 'INSTALLEE', 'TERMINEE', 'ANNULEE', 'NO_SHOW')),
    acompte NUMERIC(15,2) DEFAULT 0,
    commentaire TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.restaurant_reservations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_reservations ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'restaurant';
ALTER TABLE public.restaurant_reservations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.restaurant_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.restaurant_reservations;
CREATE POLICY "company_isolation" ON public.restaurant_reservations FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. SERVEURS & PERSONNEL DE SALLE / CUISINE / BAR
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_serveurs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    matricule TEXT NOT NULL,
    nom_complet TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'SERVEUR' CHECK (role IN ('SERVEUR', 'BARMAN', 'CUISINIER', 'CAISSIER', 'CHEF_RANG', 'LIVREUR', 'GERANT')),
    telephone TEXT,
    zone_attribuee TEXT DEFAULT 'Toutes zones',
    taux_commission NUMERIC(5,2) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'CONGE', 'SUSPENDU', 'INACTIF')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.restaurant_serveurs ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_serveurs ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'restaurant';
ALTER TABLE public.restaurant_serveurs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.restaurant_serveurs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.restaurant_serveurs;
CREATE POLICY "company_isolation" ON public.restaurant_serveurs FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. PERTES, CASSE & GASPILLAGE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_pertes_gaspillage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    reference TEXT UNIQUE DEFAULT concat('PRT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    produit_nom TEXT NOT NULL,
    categorie TEXT DEFAULT 'Boissons',
    quantite NUMERIC(10,2) NOT NULL DEFAULT 1,
    unite TEXT DEFAULT 'bouteille',
    valeur_estimee NUMERIC(15,2) NOT NULL DEFAULT 0,
    motif TEXT NOT NULL CHECK (motif IN ('CASSE', 'PERIME', 'ERREUR_COMMANDE', 'CONSOMMATION_INTERNE', 'ALTERATION', 'VOL_PRESUME', 'OFFERT', 'AUTRE')),
    date_constat DATE DEFAULT CURRENT_DATE,
    declare_par TEXT NOT NULL,
    valide_par TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.restaurant_pertes_gaspillage ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_pertes_gaspillage ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'restaurant';
ALTER TABLE public.restaurant_pertes_gaspillage ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.restaurant_pertes_gaspillage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.restaurant_pertes_gaspillage;
CREATE POLICY "company_isolation" ON public.restaurant_pertes_gaspillage FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. ÉVÉNEMENTS & SOIRÉES (Anniversaires, Karaoké, Concerts, etc.)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_evenements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    reference TEXT UNIQUE DEFAULT concat('EVT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    titre TEXT NOT NULL,
    type_evenement TEXT DEFAULT 'Soirée' CHECK (type_evenement IN ('Anniversaire', 'Mariage', 'Soirée_VIP', 'Karaoké', 'Concert', 'Privé', 'Autre')),
    date_evenement DATE NOT NULL DEFAULT CURRENT_DATE,
    heure_debut TIME DEFAULT '19:00',
    heure_fin TIME DEFAULT '03:00',
    nb_participants INT DEFAULT 0,
    budget_prevu NUMERIC(15,2) DEFAULT 0,
    recettes_realisees NUMERIC(15,2) DEFAULT 0,
    depenses_realisees NUMERIC(15,2) DEFAULT 0,
    benefice_net NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'PROGRAMME' CHECK (statut IN ('PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.restaurant_evenements ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_evenements ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'restaurant';
ALTER TABLE public.restaurant_evenements ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.restaurant_evenements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.restaurant_evenements;
CREATE POLICY "company_isolation" ON public.restaurant_evenements FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 10. INDEX DE RECHERCHE ET PERFORMANCE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_restaurant_zones_comp ON public.restaurant_zones(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_comp ON public.restaurant_tables(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_restaurant_commandes_comp ON public.restaurant_commandes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_restaurant_lignes_comp ON public.restaurant_commande_lignes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_restaurant_fiches_comp ON public.restaurant_fiches_techniques(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_restaurant_res_comp ON public.restaurant_reservations(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_restaurant_serveurs_comp ON public.restaurant_serveurs(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_restaurant_pertes_comp ON public.restaurant_pertes_gaspillage(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_restaurant_evt_comp ON public.restaurant_evenements(company_id, sector_slug);

-- FIN DE MIGRATION M032
