-- =============================================================================
-- GESTIO 229 SaaS — M030 : Tables Secteurs Spécifiques (IDEMPOTENT & ROBUSTE)
-- =============================================================================
-- Migration complète pour tous les secteurs d'activité de GESTIO 229
-- Isolation stricte : company_id + sector_slug
-- SÉCURITÉ GARANTIE :
--   1. CREATE TABLE IF NOT EXISTS
--   2. ALTER TABLE ADD COLUMN IF NOT EXISTS (pour tables préexistantes)
--   3. Row Level Security (RLS) par company_id
-- AUCUNE SUPPRESSION DE DONNÉES EXISTANTES
-- Ce script peut être exécuté autant de fois que nécessaire sans erreur.
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. SECTEUR BRASSERIE & DÉPÔT DE BOISSONS (consignations, emballages, grilles)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.brasserie_emballages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    code TEXT NOT NULL,
    designation TEXT NOT NULL,
    type_emballage TEXT DEFAULT 'CASIER',
    volume_unitaire NUMERIC(10,2) DEFAULT 0,
    valeur_consigne NUMERIC(15,2) DEFAULT 0,
    stock_initial NUMERIC(10,0) DEFAULT 0,
    stock_depot NUMERIC(10,0) DEFAULT 0,
    stock_clients NUMERIC(10,0) DEFAULT 0,
    stock_perdu NUMERIC(10,0) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.brasserie_emballages ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.brasserie_emballages ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'brasserie';
ALTER TABLE public.brasserie_emballages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.brasserie_emballages ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.brasserie_emballages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.brasserie_emballages;
CREATE POLICY "company_isolation" ON public.brasserie_emballages FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.brasserie_produit_emballage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    emballage_id UUID REFERENCES public.brasserie_emballages(id) ON DELETE CASCADE,
    quantite NUMERIC(10,2) DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.brasserie_produit_emballage ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.brasserie_produit_emballage ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'brasserie';
ALTER TABLE public.brasserie_produit_emballage ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.brasserie_produit_emballage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.brasserie_produit_emballage;
CREATE POLICY "company_isolation" ON public.brasserie_produit_emballage FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.brasserie_consignations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    emballage_id UUID REFERENCES public.brasserie_emballages(id) ON DELETE CASCADE,
    total_sorti NUMERIC(10,0) DEFAULT 0,
    total_retourne NUMERIC(10,0) DEFAULT 0,
    solde_du NUMERIC(10,0) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.brasserie_consignations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.brasserie_consignations ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'brasserie';
ALTER TABLE public.brasserie_consignations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.brasserie_consignations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.brasserie_consignations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.brasserie_consignations;
CREATE POLICY "company_isolation" ON public.brasserie_consignations FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.brasserie_mouvements_emballages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    emballage_id UUID REFERENCES public.brasserie_emballages(id),
    customer_id UUID REFERENCES public.customers(id),
    type_mouvement TEXT NOT NULL,
    sens TEXT NOT NULL,
    quantite NUMERIC(10,0) NOT NULL DEFAULT 0,
    reference_mouvement TEXT,
    stock_avant NUMERIC(10,0) DEFAULT 0,
    stock_apres NUMERIC(10,0) DEFAULT 0,
    date_mouvement TIMESTAMPTZ DEFAULT NOW(),
    agent_nom TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.brasserie_mouvements_emballages ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.brasserie_mouvements_emballages ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'brasserie';
ALTER TABLE public.brasserie_mouvements_emballages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.brasserie_mouvements_emballages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.brasserie_mouvements_emballages;
CREATE POLICY "company_isolation" ON public.brasserie_mouvements_emballages FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.brasserie_inventaires_emballages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    date_inventaire DATE DEFAULT CURRENT_DATE,
    agent_nom TEXT,
    observations TEXT,
    statut TEXT DEFAULT 'VALIDE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.brasserie_inventaires_emballages ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.brasserie_inventaires_emballages ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'brasserie';
ALTER TABLE public.brasserie_inventaires_emballages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.brasserie_inventaires_emballages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.brasserie_inventaires_emballages;
CREATE POLICY "company_isolation" ON public.brasserie_inventaires_emballages FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.brasserie_inventaire_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventaire_id UUID REFERENCES public.brasserie_inventaires_emballages(id) ON DELETE CASCADE,
    emballage_id UUID REFERENCES public.brasserie_emballages(id),
    stock_theorique NUMERIC(10,0) DEFAULT 0,
    stock_physique NUMERIC(10,0) DEFAULT 0,
    ecart NUMERIC(10,0) DEFAULT 0,
    motif TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.brasserie_grilles_tarifaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'brasserie',
    code_grille TEXT NOT NULL DEFAULT concat('GRL-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    nom_grille TEXT NOT NULL,
    type_client TEXT,
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.brasserie_grilles_tarifaires ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.brasserie_grilles_tarifaires ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'brasserie';
ALTER TABLE public.brasserie_grilles_tarifaires ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.brasserie_grilles_tarifaires ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.brasserie_grilles_tarifaires;
CREATE POLICY "company_isolation" ON public.brasserie_grilles_tarifaires FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. SECTEUR ÉCOLE & CENTRE DE FORMATION
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ecole_eleves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'ecole',
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    classe TEXT NOT NULL,
    date_naissance DATE,
    contact_parent TEXT,
    montant_frais_annuels NUMERIC(15,2) DEFAULT 0,
    frais_payes NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.ecole_eleves ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.ecole_eleves ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'ecole';
ALTER TABLE public.ecole_eleves ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.ecole_eleves ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.ecole_eleves ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.ecole_eleves;
CREATE POLICY "company_isolation" ON public.ecole_eleves FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.ecole_paiements_scolaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'ecole',
    eleve_id UUID REFERENCES public.ecole_eleves(id),
    eleve_nom TEXT NOT NULL,
    classe TEXT,
    type_frais TEXT DEFAULT 'Mensualite',
    montant NUMERIC(15,2) NOT NULL DEFAULT 0,
    mode_paiement TEXT DEFAULT 'Especes',
    date_paiement DATE DEFAULT CURRENT_DATE,
    reference TEXT UNIQUE DEFAULT concat('PAY-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    agent_nom TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.ecole_paiements_scolaires ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.ecole_paiements_scolaires ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'ecole';
ALTER TABLE public.ecole_paiements_scolaires ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.ecole_paiements_scolaires ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.ecole_paiements_scolaires;
CREATE POLICY "company_isolation" ON public.ecole_paiements_scolaires FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.ecole_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'ecole',
    eleve_nom TEXT NOT NULL,
    classe TEXT NOT NULL,
    matiere TEXT NOT NULL,
    note_sur_20 NUMERIC(5,2) DEFAULT 0,
    periode TEXT DEFAULT 'Trimestre 1',
    appreciation TEXT,
    date_saisie DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.ecole_notes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.ecole_notes ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'ecole';
ALTER TABLE public.ecole_notes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.ecole_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.ecole_notes;
CREATE POLICY "company_isolation" ON public.ecole_notes FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.ecole_absences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
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
ALTER TABLE public.ecole_absences ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.ecole_absences ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'ecole';
ALTER TABLE public.ecole_absences ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.ecole_absences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.ecole_absences;
CREATE POLICY "company_isolation" ON public.ecole_absences FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. SECTEUR SUPERMARCHÉ & SUPÉRETTE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.supermarche_rayons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'supermarche',
    code_rayon TEXT NOT NULL,
    nom_rayon TEXT NOT NULL,
    responsable TEXT,
    description TEXT,
    est_actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.supermarche_rayons ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.supermarche_rayons ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'supermarche';
ALTER TABLE public.supermarche_rayons ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_rayons ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_rayons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.supermarche_rayons;
CREATE POLICY "company_isolation" ON public.supermarche_rayons FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.supermarche_promos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'supermarche',
    produit_nom TEXT NOT NULL,
    prix_normal NUMERIC(15,2) NOT NULL DEFAULT 0,
    prix_promo NUMERIC(15,2) NOT NULL DEFAULT 0,
    remise_pct NUMERIC(5,2) DEFAULT 0,
    date_debut DATE DEFAULT CURRENT_DATE,
    date_fin DATE,
    dlc_date DATE,
    statut TEXT DEFAULT 'ACTIVE',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.supermarche_promos ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.supermarche_promos ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'supermarche';
ALTER TABLE public.supermarche_promos ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_promos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.supermarche_promos;
CREATE POLICY "company_isolation" ON public.supermarche_promos FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. SECTEUR PHARMACIE & DÉPÔT MÉDICAL
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.pharmacie_ordonnances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'pharmacie',
    reference TEXT UNIQUE DEFAULT concat('ORD-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    patient_nom TEXT NOT NULL,
    medecin TEXT,
    date_ordonnance DATE DEFAULT CURRENT_DATE,
    produits_prescrits TEXT,
    montant_total NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'EN_ATTENTE',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.pharmacie_ordonnances ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.pharmacie_ordonnances ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'pharmacie';
ALTER TABLE public.pharmacie_ordonnances ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.pharmacie_ordonnances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.pharmacie_ordonnances;
CREATE POLICY "company_isolation" ON public.pharmacie_ordonnances FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.pharmacie_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
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
ALTER TABLE public.pharmacie_lots ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.pharmacie_lots ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'pharmacie';
ALTER TABLE public.pharmacie_lots ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.pharmacie_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.pharmacie_lots;
CREATE POLICY "company_isolation" ON public.pharmacie_lots FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. SECTEUR STATION-SERVICE & HYDROCARBURES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.station_pompes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'station-service',
    numero_pompe TEXT NOT NULL,
    type_carburant TEXT NOT NULL DEFAULT 'SP95',
    cuve_associee TEXT,
    index_actuel NUMERIC(15,3) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.station_pompes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.station_pompes ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'station-service';
ALTER TABLE public.station_pompes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_pompes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.station_pompes;
CREATE POLICY "company_isolation" ON public.station_pompes FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.station_releves_pompes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
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
ALTER TABLE public.station_releves_pompes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.station_releves_pompes ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'station-service';
ALTER TABLE public.station_releves_pompes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_releves_pompes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.station_releves_pompes;
CREATE POLICY "company_isolation" ON public.station_releves_pompes FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.station_postes_journaliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
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
ALTER TABLE public.station_postes_journaliers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.station_postes_journaliers ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'station-service';
ALTER TABLE public.station_postes_journaliers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_postes_journaliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.station_postes_journaliers;
CREATE POLICY "company_isolation" ON public.station_postes_journaliers FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.station_lubrifiants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
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
ALTER TABLE public.station_lubrifiants ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.station_lubrifiants ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'station-service';
ALTER TABLE public.station_lubrifiants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_lubrifiants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.station_lubrifiants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.station_lubrifiants;
CREATE POLICY "company_isolation" ON public.station_lubrifiants FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. SECTEUR HÔTEL, RÉSIDENCE & AUBERGE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.hotel_chambres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'hotel',
    numero_chambre TEXT NOT NULL,
    type_chambre TEXT DEFAULT 'Simple',
    etage INT DEFAULT 1,
    tarif_nuit NUMERIC(15,2) NOT NULL DEFAULT 0,
    statut TEXT DEFAULT 'LIBRE',
    client_actuel TEXT,
    date_entree TIMESTAMPTZ,
    date_sortie_prevue TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.hotel_chambres ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.hotel_chambres ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'hotel';
ALTER TABLE public.hotel_chambres ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.hotel_chambres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.hotel_chambres;
CREATE POLICY "company_isolation" ON public.hotel_chambres FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.hotel_housekeeping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'hotel',
    chambre_numero TEXT NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    agent_nom TEXT NOT NULL,
    statut TEXT DEFAULT 'A_NETTOYER',
    priorite TEXT DEFAULT 'NORMALE',
    heure_debut TIME,
    heure_fin TIME,
    observations TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.hotel_housekeeping ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.hotel_housekeeping ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'hotel';
ALTER TABLE public.hotel_housekeeping ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.hotel_housekeeping ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.hotel_housekeeping;
CREATE POLICY "company_isolation" ON public.hotel_housekeeping FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. SECTEUR GARAGE & ATELIER MÉCANIQUE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.garage_vehicules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
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
    statut TEXT DEFAULT 'EN_ATTENTE',
    kilometrage NUMERIC(10,0) DEFAULT 0,
    observations TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.garage_vehicules ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.garage_vehicules ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'garage';
ALTER TABLE public.garage_vehicules ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.garage_vehicules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.garage_vehicules;
CREATE POLICY "company_isolation" ON public.garage_vehicules FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.garage_ordres_reparation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
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
    statut TEXT DEFAULT 'DIAGNOSTIC',
    date_entree DATE DEFAULT CURRENT_DATE,
    date_sortie_prevue DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.garage_ordres_reparation ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.garage_ordres_reparation ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'garage';
ALTER TABLE public.garage_ordres_reparation ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.garage_ordres_reparation ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.garage_ordres_reparation;
CREATE POLICY "company_isolation" ON public.garage_ordres_reparation FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. SECTEUR MICROFINANCE & TONTINE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.microfinance_membres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    numero_membre TEXT UNIQUE DEFAULT concat('MBR-', extract(epoch from NOW())::BIGINT),
    nom_complet TEXT NOT NULL,
    telephone TEXT,
    adresse TEXT,
    date_adhesion DATE DEFAULT CURRENT_DATE,
    type_compte TEXT DEFAULT 'Epargne',
    solde_epargne NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF',
    agent_collecteur TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_membres ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.microfinance_membres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_membres;
CREATE POLICY "company_isolation" ON public.microfinance_membres FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.microfinance_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
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
    statut TEXT DEFAULT 'EN_COURS',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_credits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.microfinance_credits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_credits;
CREATE POLICY "company_isolation" ON public.microfinance_credits FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.microfinance_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    nom_complet TEXT NOT NULL,
    telephone TEXT,
    zone_collecte TEXT,
    commission_taux_pct NUMERIC(5,2) DEFAULT 2,
    nb_membres_actifs INT DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.microfinance_agents ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.microfinance_agents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.microfinance_agents;
CREATE POLICY "company_isolation" ON public.microfinance_agents FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.tontine_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'microfinance',
    nom_tontine TEXT NOT NULL,
    nb_participants INT DEFAULT 0,
    montant_cotisation NUMERIC(15,2) NOT NULL DEFAULT 0,
    periodicite TEXT DEFAULT 'Mensuelle',
    date_debut DATE DEFAULT CURRENT_DATE,
    tour_actuel INT DEFAULT 1,
    cagnotte_actuelle NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'microfinance';
ALTER TABLE public.tontine_cycles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.tontine_cycles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.tontine_cycles;
CREATE POLICY "company_isolation" ON public.tontine_cycles FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. SECTEUR IMPRIMERIE & SÉRIGRAPHIE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.impression_devis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'impression',
    reference TEXT UNIQUE DEFAULT concat('DEV-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    client_nom TEXT NOT NULL,
    type_travail TEXT DEFAULT 'Numerique',
    description TEXT,
    quantite NUMERIC(10,0) DEFAULT 1,
    format TEXT,
    prix_unitaire NUMERIC(15,2) DEFAULT 0,
    total NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'DEVIS',
    date_devis DATE DEFAULT CURRENT_DATE,
    date_livraison DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.impression_devis ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.impression_devis ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'impression';
ALTER TABLE public.impression_devis ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.impression_devis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.impression_devis;
CREATE POLICY "company_isolation" ON public.impression_devis FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.impression_sous_traitance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'impression',
    reference TEXT UNIQUE DEFAULT concat('ST-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    fournisseur_nom TEXT NOT NULL,
    type_prestation TEXT,
    description TEXT,
    montant_ht NUMERIC(15,2) DEFAULT 0,
    montant_facture_client NUMERIC(15,2) DEFAULT 0,
    marge NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'EN_ATTENTE',
    date_commande DATE DEFAULT CURRENT_DATE,
    date_livraison DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.impression_sous_traitance ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.impression_sous_traitance ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'impression';
ALTER TABLE public.impression_sous_traitance ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.impression_sous_traitance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.impression_sous_traitance;
CREATE POLICY "company_isolation" ON public.impression_sous_traitance FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 10. SECTEUR GESTION LOCATIVE & IMMOBILIER
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.location_biens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'location',
    reference TEXT DEFAULT concat('BIEN-', extract(epoch from NOW())::BIGINT),
    type_bien TEXT DEFAULT 'Appartement',
    adresse TEXT NOT NULL,
    superficie_m2 NUMERIC(10,2),
    nb_pieces INT,
    loyer_mensuel NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'LIBRE',
    locataire_actuel TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'location';
ALTER TABLE public.location_biens ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.location_biens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.location_biens;
CREATE POLICY "company_isolation" ON public.location_biens FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.location_contrats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'location',
    reference TEXT UNIQUE DEFAULT concat('CTR-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    bien_ref TEXT,
    locataire_nom TEXT NOT NULL,
    locataire_tel TEXT,
    date_debut DATE NOT NULL DEFAULT CURRENT_DATE,
    date_fin DATE,
    loyer_mensuel NUMERIC(15,2) DEFAULT 0,
    depot_garantie NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'ACTIF',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'location';
ALTER TABLE public.location_contrats ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.location_contrats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.location_contrats;
CREATE POLICY "company_isolation" ON public.location_contrats FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.location_quittances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'location',
    reference TEXT UNIQUE DEFAULT concat('QTT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    contrat_id UUID REFERENCES public.location_contrats(id),
    locataire_nom TEXT NOT NULL,
    bien_ref TEXT,
    mois_loyer TEXT NOT NULL,
    montant_loyer NUMERIC(15,2) DEFAULT 0,
    charges NUMERIC(15,2) DEFAULT 0,
    montant_total NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'EMISE',
    date_paiement DATE,
    mode_paiement TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'location';
ALTER TABLE public.location_quittances ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.location_quittances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.location_quittances;
CREATE POLICY "company_isolation" ON public.location_quittances FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 11. SECTEUR POISSONNERIE & PRODUITS FRAIS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.poissonnerie_chambres_froides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'poissonnerie',
    nom_chambre TEXT NOT NULL,
    capacite_kg NUMERIC(10,2) DEFAULT 0,
    temperature_consigne NUMERIC(5,1) DEFAULT -18,
    temperature_actuelle NUMERIC(5,1),
    humidite NUMERIC(5,1),
    produit_stocke TEXT,
    poids_actuel_kg NUMERIC(10,2) DEFAULT 0,
    statut TEXT DEFAULT 'OK',
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.poissonnerie_chambres_froides ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.poissonnerie_chambres_froides ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'poissonnerie';
ALTER TABLE public.poissonnerie_chambres_froides ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.poissonnerie_chambres_froides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.poissonnerie_chambres_froides;
CREATE POLICY "company_isolation" ON public.poissonnerie_chambres_froides FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.poissonnerie_pesees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'poissonnerie',
    reference TEXT UNIQUE DEFAULT concat('PES-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    produit_nom TEXT NOT NULL,
    type_conditionnement TEXT DEFAULT 'Kg',
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
ALTER TABLE public.poissonnerie_pesees ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.poissonnerie_pesees ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'poissonnerie';
ALTER TABLE public.poissonnerie_pesees ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.poissonnerie_pesees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.poissonnerie_pesees;
CREATE POLICY "company_isolation" ON public.poissonnerie_pesees FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.poissonnerie_avaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'poissonnerie',
    reference TEXT UNIQUE DEFAULT concat('AVR-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    produit_nom TEXT NOT NULL,
    chambre_froide TEXT,
    quantite_kg NUMERIC(10,3) DEFAULT 0,
    motif_avarie TEXT DEFAULT 'DLC',
    valeur_estimee NUMERIC(15,2) DEFAULT 0,
    action_prise TEXT DEFAULT 'En_Attente',
    date_constat DATE DEFAULT CURRENT_DATE,
    agent_constat TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'poissonnerie';
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.poissonnerie_avaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.poissonnerie_avaries;
CREATE POLICY "company_isolation" ON public.poissonnerie_avaries FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 12. SECTEUR QUINCAILLERIE & MATÉRIAUX BTP
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.quincaillerie_materiaux (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'quincaillerie',
    reference TEXT,
    designation TEXT NOT NULL,
    categorie TEXT DEFAULT 'Ciment',
    unite TEXT DEFAULT 'Piece',
    stock_actuel NUMERIC(10,3) DEFAULT 0,
    seuil_alerte NUMERIC(10,3) DEFAULT 5,
    prix_gros NUMERIC(15,2) DEFAULT 0,
    prix_detail NUMERIC(15,2) DEFAULT 0,
    fournisseur TEXT,
    specifications TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.quincaillerie_materiaux ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.quincaillerie_materiaux ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'quincaillerie';
ALTER TABLE public.quincaillerie_materiaux ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.quincaillerie_materiaux ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.quincaillerie_materiaux ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.quincaillerie_materiaux;
CREATE POLICY "company_isolation" ON public.quincaillerie_materiaux FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.quincaillerie_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'quincaillerie',
    materiau TEXT NOT NULL,
    unite_source TEXT NOT NULL,
    unite_cible TEXT NOT NULL,
    facteur_conversion NUMERIC(15,6) NOT NULL DEFAULT 1,
    exemple_application TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.quincaillerie_conversions ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.quincaillerie_conversions ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'quincaillerie';
ALTER TABLE public.quincaillerie_conversions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.quincaillerie_conversions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.quincaillerie_conversions;
CREATE POLICY "company_isolation" ON public.quincaillerie_conversions FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.quincaillerie_chantiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'quincaillerie',
    reference TEXT UNIQUE DEFAULT concat('CHT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    nom_chantier TEXT NOT NULL,
    client_nom TEXT NOT NULL,
    adresse_chantier TEXT,
    chef_chantier TEXT,
    date_debut DATE DEFAULT CURRENT_DATE,
    date_fin_prevue DATE,
    statut TEXT DEFAULT 'EN_COURS',
    montant_contrat NUMERIC(15,2) DEFAULT 0,
    montant_facture NUMERIC(15,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.quincaillerie_chantiers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.quincaillerie_chantiers ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'quincaillerie';
ALTER TABLE public.quincaillerie_chantiers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.quincaillerie_chantiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.quincaillerie_chantiers;
CREATE POLICY "company_isolation" ON public.quincaillerie_chantiers FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 13. SECTEUR ÉVÉNEMENTIEL
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.evenementiel_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'evenementiel',
    reference TEXT UNIQUE DEFAULT concat('EVT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    client_nom TEXT NOT NULL,
    client_tel TEXT,
    type_evenement TEXT DEFAULT 'Mariage',
    salle TEXT,
    date_evenement DATE NOT NULL,
    heure_debut TIME,
    heure_fin TIME,
    nb_personnes INT DEFAULT 0,
    total_prestation NUMERIC(15,2) DEFAULT 0,
    acompte_verse NUMERIC(15,2) DEFAULT 0,
    solde_restant NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'RESERVE',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.evenementiel_reservations ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.evenementiel_reservations ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'evenementiel';
ALTER TABLE public.evenementiel_reservations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.evenementiel_reservations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.evenementiel_reservations;
CREATE POLICY "company_isolation" ON public.evenementiel_reservations FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.evenementiel_materiel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'evenementiel',
    code TEXT,
    designation TEXT NOT NULL,
    categorie TEXT DEFAULT 'Chaises',
    quantite_totale INT DEFAULT 0,
    quantite_disponible INT DEFAULT 0,
    prix_location_jour NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'DISPONIBLE',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.evenementiel_materiel ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.evenementiel_materiel ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'evenementiel';
ALTER TABLE public.evenementiel_materiel ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.evenementiel_materiel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.evenementiel_materiel;
CREATE POLICY "company_isolation" ON public.evenementiel_materiel FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.evenementiel_prestations_traiteur (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'evenementiel',
    reference TEXT UNIQUE DEFAULT concat('TRT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    client_nom TEXT NOT NULL,
    evenement_ref TEXT,
    type_menu TEXT DEFAULT 'Buffet',
    nb_couverts INT DEFAULT 0,
    prix_couvert NUMERIC(15,2) DEFAULT 0,
    montant_total NUMERIC(15,2) DEFAULT 0,
    chef_cuisinier TEXT,
    statut TEXT DEFAULT 'DEVIS',
    date_prestation DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.evenementiel_prestations_traiteur ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.evenementiel_prestations_traiteur ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'evenementiel';
ALTER TABLE public.evenementiel_prestations_traiteur ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.evenementiel_prestations_traiteur ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.evenementiel_prestations_traiteur;
CREATE POLICY "company_isolation" ON public.evenementiel_prestations_traiteur FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 14. SECTEURS COMPLÉMENTAIRES (RESTAURATION, AGROBUSINESS, TRANSPORT, BOULANGERIE)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    numero_table TEXT NOT NULL,
    zone TEXT DEFAULT 'Salle',
    capacite INT DEFAULT 4,
    statut TEXT DEFAULT 'LIBRE',
    serveur_assigne TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'restaurant';
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.restaurant_tables;
CREATE POLICY "company_isolation" ON public.restaurant_tables FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

CREATE TABLE IF NOT EXISTS public.transport_courses_livraisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'transport',
    reference TEXT UNIQUE DEFAULT concat('TRP-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    vehicule_immat TEXT,
    chauffeur_nom TEXT,
    depart TEXT,
    destination TEXT,
    date_depart DATE DEFAULT CURRENT_DATE,
    montant_course NUMERIC(15,2) DEFAULT 0,
    statut TEXT DEFAULT 'EN_COURS',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.transport_courses_livraisons ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.transport_courses_livraisons ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'transport';
ALTER TABLE public.transport_courses_livraisons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.transport_courses_livraisons;
CREATE POLICY "company_isolation" ON public.transport_courses_livraisons FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 15. INDEX DE RECHERCHE POUR PERFORMANCE GLOBALE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_brasserie_grilles_c_s ON public.brasserie_grilles_tarifaires(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_ecole_eleves_c_s ON public.ecole_eleves(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_ecole_paiements_c_s ON public.ecole_paiements_scolaires(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_supermarche_rayons_c_s ON public.supermarche_rayons(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_supermarche_promos_c_s ON public.supermarche_promos(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_pharmacie_ordonnances_c_s ON public.pharmacie_ordonnances(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_pharmacie_lots_c_s ON public.pharmacie_lots(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_station_pompes_c_s ON public.station_pompes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_station_releves_c_s ON public.station_releves_pompes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_hotel_chambres_c_s ON public.hotel_chambres(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_garage_vehicules_c_s ON public.garage_vehicules(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_garage_ordres_c_s ON public.garage_ordres_reparation(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_membres_c_s ON public.microfinance_membres(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_microfinance_credits_c_s ON public.microfinance_credits(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_location_biens_c_s ON public.location_biens(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_location_contrats_c_s ON public.location_contrats(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_poissonnerie_chambres_c_s ON public.poissonnerie_chambres_froides(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_quincaillerie_materiaux_c_s ON public.quincaillerie_materiaux(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_evenementiel_reservations_c_s ON public.evenementiel_reservations(company_id, sector_slug);

-- FIN DE MIGRATION M030 SÉCURISÉE
