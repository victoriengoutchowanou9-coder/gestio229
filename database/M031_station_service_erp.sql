-- =============================================================================
-- GESTIO 229 SaaS — M031 : ERP Spécialisé Station-Service & Hydrocarbures
-- =============================================================================
-- Migration exclusive pour le secteur : "Station-Service & Hydrocarbures"
-- Isolation stricte : company_id + sector_slug = 'station-service'
-- IDEMPOTENT & NON DESTRUCTIF
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. GESTION DES CUVES (Tanks)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.station_cuves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    code TEXT NOT NULL,
    nom TEXT NOT NULL,
    produit TEXT NOT NULL, -- Essence Super, Gasoil, Pétrole lampant, GPL, etc.
    capacite NUMERIC(15,2) NOT NULL DEFAULT 30000,
    stock_initial NUMERIC(15,2) DEFAULT 0,
    stock_actuel NUMERIC(15,2) DEFAULT 0,
    stock_theorique NUMERIC(15,2) DEFAULT 0,
    niveau_min NUMERIC(15,2) DEFAULT 2000,
    niveau_max NUMERIC(15,2) DEFAULT 30000,
    unite TEXT DEFAULT 'L',
    statut TEXT DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'MAINTENANCE', 'ARRETE')),
    emplacement TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.station_cuves ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.station_cuves ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'station-service';
ALTER TABLE public.station_cuves ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_cuves ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_cuves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.station_cuves;
CREATE POLICY "company_isolation" ON public.station_cuves FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. JAUGEAGE DES CUVES (Dippings & Contrôles physiques)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.station_jaugeages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    cuve_id UUID REFERENCES public.station_cuves(id) ON DELETE CASCADE,
    cuve_nom TEXT NOT NULL,
    produit TEXT NOT NULL,
    date_jaugeage DATE DEFAULT CURRENT_DATE,
    heure_jaugeage TIME DEFAULT CURRENT_TIME,
    hauteur_cm NUMERIC(10,2) DEFAULT 0,
    volume_mesure NUMERIC(15,2) NOT NULL, -- Volume physique jaugé
    stock_theorique_avant NUMERIC(15,2) NOT NULL DEFAULT 0,
    ecart_volume NUMERIC(15,2) NOT NULL DEFAULT 0, -- Mesuré - Théorique
    temperature NUMERIC(5,1),
    agent_nom TEXT,
    observation TEXT,
    valide BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.station_jaugeages ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.station_jaugeages ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'station-service';
ALTER TABLE public.station_jaugeages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_jaugeages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.station_jaugeages;
CREATE POLICY "company_isolation" ON public.station_jaugeages FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. RÉCEPTIONS CARBURANT (Livraisons citernes & Rapprochement)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.station_receptions_carburant (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    reference TEXT UNIQUE DEFAULT concat('REC-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    fournisseur_nom TEXT NOT NULL,
    date_reception DATE DEFAULT CURRENT_DATE,
    heure_reception TIME DEFAULT CURRENT_TIME,
    produit TEXT NOT NULL,
    cuve_id UUID REFERENCES public.station_cuves(id),
    cuve_nom TEXT NOT NULL,
    quantite_commandee NUMERIC(15,2) DEFAULT 0,
    quantite_facturee NUMERIC(15,2) DEFAULT 0,
    quantite_recue NUMERIC(15,2) NOT NULL DEFAULT 0,
    ecart_livraison NUMERIC(15,2) DEFAULT 0, -- Reçue - Facturée
    prix_achat_litre NUMERIC(15,2) DEFAULT 0,
    montant_total NUMERIC(15,2) DEFAULT 0,
    frais_transport NUMERIC(15,2) DEFAULT 0,
    numero_camion TEXT,
    chauffeur TEXT,
    recepteur_nom TEXT,
    statut TEXT DEFAULT 'VALIDE' CHECK (statut IN ('EN_COURS', 'VALIDE', 'AVEC_ECART', 'ANNULE')),
    observation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.station_receptions_carburant ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.station_receptions_carburant ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'station-service';
ALTER TABLE public.station_receptions_carburant ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_receptions_carburant ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.station_receptions_carburant;
CREATE POLICY "company_isolation" ON public.station_receptions_carburant FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. PISTOLETS DE POMPE (Nozzles & Compteurs)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.station_pistolets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    pompe_id UUID REFERENCES public.station_pompes(id) ON DELETE CASCADE,
    numero_pompe TEXT NOT NULL,
    code_pistolet TEXT NOT NULL,
    produit TEXT NOT NULL,
    cuve_id UUID REFERENCES public.station_cuves(id),
    compteur_index NUMERIC(15,3) DEFAULT 0,
    prix_actuel NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'MAINTENANCE', 'ARRETE')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.station_pistolets ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.station_pistolets ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'station-service';
ALTER TABLE public.station_pistolets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_pistolets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_pistolets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.station_pistolets;
CREATE POLICY "company_isolation" ON public.station_pistolets FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. POMPISTES (Personnel de piste)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.station_pompistes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    matricule TEXT NOT NULL,
    nom_complet TEXT NOT NULL,
    telephone TEXT,
    statut TEXT DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'CONGE', 'SUSPENDU', 'INACTIF')),
    shift_habituel TEXT DEFAULT 'Matin',
    solde_responsabilite NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.station_pompistes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.station_pompistes ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'station-service';
ALTER TABLE public.station_pompistes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_pompistes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_pompistes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.station_pompistes;
CREATE POLICY "company_isolation" ON public.station_pompistes FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. SHIFTS & CLÔTURES POMPISTES (Workflow précis des relèves)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.station_shifts_clotures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    reference TEXT UNIQUE DEFAULT concat('SHF-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    date DATE DEFAULT CURRENT_DATE,
    type_shift TEXT NOT NULL DEFAULT 'Matin' CHECK (type_shift IN ('Matin', 'Apres-midi', 'Nuit', 'Personnalise')),
    pompiste_id UUID REFERENCES public.station_pompistes(id),
    pompiste_nom TEXT NOT NULL,
    pompe_id UUID REFERENCES public.station_pompes(id),
    pompe_numero TEXT NOT NULL,
    produit TEXT NOT NULL,
    index_debut NUMERIC(15,3) NOT NULL DEFAULT 0,
    index_fin NUMERIC(15,3) NOT NULL DEFAULT 0,
    volume_distribue NUMERIC(15,3) NOT NULL DEFAULT 0,
    prix_litre NUMERIC(10,2) NOT NULL DEFAULT 0,
    montant_theorique NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_verse NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_especes NUMERIC(15,2) DEFAULT 0,
    montant_momo NUMERIC(15,2) DEFAULT 0,
    montant_credit NUMERIC(15,2) DEFAULT 0,
    ecart NUMERIC(15,2) NOT NULL DEFAULT 0, -- Versé - Théorique (négatif = manquant)
    motif_ecart TEXT,
    valide_par TEXT,
    statut TEXT DEFAULT 'CLOTURE' CHECK (statut IN ('EN_COURS', 'CLOTURE', 'VALIDE_AVEC_ECART', 'VALIDE')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.station_shifts_clotures ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.station_shifts_clotures ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'station-service';
ALTER TABLE public.station_shifts_clotures ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_shifts_clotures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.station_shifts_clotures;
CREATE POLICY "company_isolation" ON public.station_shifts_clotures FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. CLIENTS PROFESSIONNELS & FLOTTES (Entreprises, véhicules, cartes carburant)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.station_vehicules_flotte (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    client_nom TEXT NOT NULL,
    immatriculation TEXT NOT NULL,
    marque_modele TEXT,
    chauffeur_habituel TEXT,
    telephone_chauffeur TEXT,
    type_carburant_autorise TEXT DEFAULT 'Tous',
    plafond_journalier_litres NUMERIC(10,2) DEFAULT 0,
    plafond_mensuel_fcfa NUMERIC(15,2) DEFAULT 0,
    consommation_mois_litres NUMERIC(10,2) DEFAULT 0,
    consommation_mois_fcfa NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF' CHECK (statut IN ('ACTIF', 'SUSPENDU', 'BLOQUE')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.station_vehicules_flotte ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.station_vehicules_flotte ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'station-service';
ALTER TABLE public.station_vehicules_flotte ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_vehicules_flotte ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.station_vehicules_flotte;
CREATE POLICY "company_isolation" ON public.station_vehicules_flotte FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. SERVICES ANNEXES (Lavage, Gonflage, Vidange, etc.)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.station_services_annexes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    reference TEXT UNIQUE DEFAULT concat('SRV-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    type_service TEXT NOT NULL CHECK (type_service IN ('Lavage', 'Vidange', 'Gonflage', 'Petite_Maintenance', 'Changement_Huile', 'Autre')),
    immatriculation_vehicule TEXT,
    client_nom TEXT,
    prix_service NUMERIC(15,2) NOT NULL DEFAULT 0,
    cout_intrants NUMERIC(15,2) DEFAULT 0,
    marge NUMERIC(15,2) DEFAULT 0,
    agent_executant TEXT,
    statut TEXT DEFAULT 'TERMINE' CHECK (statut IN ('EN_COURS', 'TERMINE', 'ANNULE')),
    date_service DATE DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.station_services_annexes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.station_services_annexes ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'station-service';
ALTER TABLE public.station_services_annexes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_services_annexes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.station_services_annexes;
CREATE POLICY "company_isolation" ON public.station_services_annexes FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. HISTORIQUE DES PRIX CARBURANT
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.station_prix_historique (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    produit TEXT NOT NULL,
    ancien_prix NUMERIC(15,2) NOT NULL,
    nouveau_prix NUMERIC(15,2) NOT NULL,
    date_changement TIMESTAMPTZ DEFAULT NOW(),
    modifie_par TEXT,
    source_reglementaire TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.station_prix_historique ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.station_prix_historique ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'station-service';
ALTER TABLE public.station_prix_historique ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_prix_historique ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.station_prix_historique;
CREATE POLICY "company_isolation" ON public.station_prix_historique FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 10. INDEX DE RECHERCHE POUR PERFORMANCE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_station_cuves_comp ON public.station_cuves(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_station_jaugeages_comp ON public.station_jaugeages(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_station_receptions_comp ON public.station_receptions_carburant(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_station_pistolets_comp ON public.station_pistolets(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_station_pompistes_comp ON public.station_pompistes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_station_shifts_comp ON public.station_shifts_clotures(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_station_vehicules_comp ON public.station_vehicules_flotte(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_station_services_comp ON public.station_services_annexes(company_id, sector_slug);

-- FIN DE MIGRATION M031
