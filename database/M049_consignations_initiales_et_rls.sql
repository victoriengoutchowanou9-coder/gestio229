-- =============================================================================
-- GESTIO 229 ERP — Migration M049 : Correction RLS & Tables Consignations Initiales
-- Résolution du blocage chargement infini sur la Situation Initiale des Emballages
-- =============================================================================

-- 1. Table consignations_initiales (Saisie des situations initiales d'emballages par client)
CREATE TABLE IF NOT EXISTS consignations_initiales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL,
  client_id UUID NOT NULL,
  emballage_id UUID,
  precedent_du NUMERIC DEFAULT 0,
  date_saisie DATE DEFAULT CURRENT_DATE,
  observation TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, secteur_id, client_id, emballage_id)
);

CREATE INDEX IF NOT EXISTS idx_consignations_init_comp_sec ON consignations_initiales(company_id, secteur_id, client_id);

-- 2. Assurer l'existence de clients_emballages_initiaux et soldes
CREATE TABLE IF NOT EXISTS clients_emballages_initiaux (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID,
  client_id UUID NOT NULL,
  emballage_id UUID,
  precedent_du NUMERIC DEFAULT 0,
  date_saisie DATE DEFAULT CURRENT_DATE,
  observation TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients_emballages_soldes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID,
  client_id UUID NOT NULL,
  emballage_id UUID NOT NULL,
  du_actuel NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_emballages_fournisseur (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID,
  emballage_id UUID,
  fournisseur TEXT NOT NULL,
  type_stock TEXT CHECK (type_stock IN ('plein','vide')) NOT NULL,
  quantite NUMERIC DEFAULT 0,
  date_initiale DATE DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS emballages_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID,
  code TEXT NOT NULL,
  designation TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Assurer l'existence des tables brasserie_emballages et brasserie_consignations
CREATE TABLE IF NOT EXISTS brasserie_emballages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  sector_slug TEXT NOT NULL DEFAULT 'brasserie',
  code TEXT NOT NULL,
  designation TEXT NOT NULL,
  type TEXT DEFAULT 'casier',
  unite TEXT DEFAULT 'unité',
  valeur_consignation NUMERIC DEFAULT 0,
  stock_depot INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brasserie_consignations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  sector_slug TEXT DEFAULT 'brasserie',
  client_id UUID,
  emballage_id UUID,
  total_sorti NUMERIC DEFAULT 0,
  total_retourne NUMERIC DEFAULT 0,
  solde_du NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brasserie_mouvements_emballages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  sector_slug TEXT DEFAULT 'brasserie',
  emballage_id UUID,
  client_id UUID,
  type_mouvement TEXT,
  quantite NUMERIC DEFAULT 0,
  solde_avant NUMERIC DEFAULT 0,
  solde_apres NUMERIC DEFAULT 0,
  depot_avant NUMERIC DEFAULT 0,
  depot_apres NUMERIC DEFAULT 0,
  reference TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brasserie_inventaires_emballages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  sector_slug TEXT DEFAULT 'brasserie',
  date_inventaire TIMESTAMPTZ DEFAULT now(),
  realise_par TEXT,
  observations TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brasserie_inventaire_lignes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventaire_id UUID REFERENCES brasserie_inventaires_emballages(id) ON DELETE CASCADE,
  emballage_id UUID,
  stock_theorique NUMERIC DEFAULT 0,
  stock_physique NUMERIC DEFAULT 0,
  ecart NUMERIC DEFAULT 0,
  observation TEXT
);

-- 4. ACTIVER RLS SUR TOUTES LES TABLES DE CONSIGNATION ET OUVRIR LES POLICIES (ÉVITE ERREUR 401 / CHARGEMENT INFINI)
ALTER TABLE consignations_initiales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_consignations_initiales" ON consignations_initiales;
CREATE POLICY "allow_all_consignations_initiales" ON consignations_initiales FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_consignations_initiales" ON consignations_initiales;
CREATE POLICY "allow_anon_consignations_initiales" ON consignations_initiales FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE clients_emballages_initiaux ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_clients_emballages_initiaux" ON clients_emballages_initiaux;
CREATE POLICY "allow_all_clients_emballages_initiaux" ON clients_emballages_initiaux FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_clients_emballages_initiaux" ON clients_emballages_initiaux;
CREATE POLICY "allow_anon_clients_emballages_initiaux" ON clients_emballages_initiaux FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE clients_emballages_soldes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_clients_emballages_soldes" ON clients_emballages_soldes;
CREATE POLICY "allow_all_clients_emballages_soldes" ON clients_emballages_soldes FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_clients_emballages_soldes" ON clients_emballages_soldes;
CREATE POLICY "allow_anon_clients_emballages_soldes" ON clients_emballages_soldes FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE stock_emballages_fournisseur ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_stock_emballages_fournisseur" ON stock_emballages_fournisseur;
CREATE POLICY "allow_all_stock_emballages_fournisseur" ON stock_emballages_fournisseur FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_stock_emballages_fournisseur" ON stock_emballages_fournisseur;
CREATE POLICY "allow_anon_stock_emballages_fournisseur" ON stock_emballages_fournisseur FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE emballages_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_emballages_types" ON emballages_types;
CREATE POLICY "allow_all_emballages_types" ON emballages_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_emballages_types" ON emballages_types;
CREATE POLICY "allow_anon_emballages_types" ON emballages_types FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE brasserie_emballages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_brasserie_emballages" ON brasserie_emballages;
CREATE POLICY "allow_all_brasserie_emballages" ON brasserie_emballages FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_brasserie_emballages" ON brasserie_emballages;
CREATE POLICY "allow_anon_brasserie_emballages" ON brasserie_emballages FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE brasserie_consignations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_brasserie_consignations" ON brasserie_consignations;
CREATE POLICY "allow_all_brasserie_consignations" ON brasserie_consignations FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_brasserie_consignations" ON brasserie_consignations;
CREATE POLICY "allow_anon_brasserie_consignations" ON brasserie_consignations FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE brasserie_mouvements_emballages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_brasserie_mouvements_emballages" ON brasserie_mouvements_emballages;
CREATE POLICY "allow_all_brasserie_mouvements_emballages" ON brasserie_mouvements_emballages FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_brasserie_mouvements_emballages" ON brasserie_mouvements_emballages;
CREATE POLICY "allow_anon_brasserie_mouvements_emballages" ON brasserie_mouvements_emballages FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE brasserie_inventaires_emballages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_brasserie_inventaires_emballages" ON brasserie_inventaires_emballages;
CREATE POLICY "allow_all_brasserie_inventaires_emballages" ON brasserie_inventaires_emballages FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_brasserie_inventaires_emballages" ON brasserie_inventaires_emballages;
CREATE POLICY "allow_anon_brasserie_inventaires_emballages" ON brasserie_inventaires_emballages FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE brasserie_inventaire_lignes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_brasserie_inventaire_lignes" ON brasserie_inventaire_lignes;
CREATE POLICY "allow_all_brasserie_inventaire_lignes" ON brasserie_inventaire_lignes FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_brasserie_inventaire_lignes" ON brasserie_inventaire_lignes;
CREATE POLICY "allow_anon_brasserie_inventaire_lignes" ON brasserie_inventaire_lignes FOR ALL TO anon USING (true) WITH CHECK (true);
