-- =============================================================================
-- GESTIO 229 ERP — Migration M046 : Gestion des Emballages & Consignations Brasserie
-- Périmètre STRICT : Secteur Brasserie & Dépôt de Boissons (secteur_id obligatoire)
-- =============================================================================

-- 1. Table des types d'emballages (configurables par l'entreprise)
CREATE TABLE IF NOT EXISTS emballages_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL,
  code TEXT NOT NULL, -- C12T, C20T, C24T, C33T, C30T
  designation TEXT NOT NULL, -- CASIER 12T- UNITE, CASIER 20T- UNITE, etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, secteur_id, code)
);

CREATE INDEX IF NOT EXISTS idx_emballages_types_secteur ON emballages_types(company_id, secteur_id);

-- 2. Stock fournisseur plein/vide initial (avant logiciel)
CREATE TABLE IF NOT EXISTS stock_emballages_fournisseur (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL,
  emballage_id UUID REFERENCES emballages_types(id) ON DELETE CASCADE,
  fournisseur TEXT NOT NULL, -- SOBEBRA, BB, etc.
  type_stock TEXT CHECK (type_stock IN ('plein','vide')) NOT NULL,
  quantite NUMERIC DEFAULT 0,
  date_initiale DATE DEFAULT CURRENT_DATE,
  UNIQUE(company_id, secteur_id, emballage_id, fournisseur, type_stock)
);

CREATE INDEX IF NOT EXISTS idx_stock_emb_fournisseur ON stock_emballages_fournisseur(company_id, secteur_id, fournisseur);

-- 3. Situation initiale clients avant utilisation logiciel (Rubrique demandée)
CREATE TABLE IF NOT EXISTS clients_emballages_initiaux (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  emballage_id UUID REFERENCES emballages_types(id) ON DELETE CASCADE,
  precedent_du NUMERIC DEFAULT 0,
  date_saisie DATE DEFAULT CURRENT_DATE,
  observation TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, client_id, emballage_id)
);

CREATE INDEX IF NOT EXISTS idx_clients_emb_init ON clients_emballages_initiaux(company_id, client_id);

-- 4. Solde actuel par client et type d'emballage
CREATE TABLE IF NOT EXISTS clients_emballages_soldes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL,
  client_id UUID NOT NULL,
  emballage_id UUID NOT NULL,
  du_actuel NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, secteur_id, client_id, emballage_id)
);

CREATE INDEX IF NOT EXISTS idx_clients_emb_soldes ON clients_emballages_soldes(company_id, secteur_id, client_id);

-- 5. Mouvements par facture / vente
CREATE TABLE IF NOT EXISTS mouvements_emballages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL,
  client_id UUID,
  vente_id UUID,
  facture_id UUID,
  emballage_id UUID NOT NULL REFERENCES emballages_types(id),
  precedent NUMERIC DEFAULT 0,
  facture_qte NUMERIC DEFAULT 0,
  retour_qte NUMERIC DEFAULT 0,
  du_final NUMERIC DEFAULT 0,
  date_mouvement DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mouvements_emb ON mouvements_emballages(company_id, secteur_id, client_id, date_mouvement);

-- 6. Fonction pour initialiser le solde emballages d'un client
CREATE OR REPLACE FUNCTION fn_init_emballage_client(
  p_company_id UUID,
  p_secteur_id UUID,
  p_client_id UUID,
  p_emballage_id UUID,
  p_precedent NUMERIC
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO clients_emballages_initiaux (company_id, secteur_id, client_id, emballage_id, precedent_du)
  VALUES (p_company_id, p_secteur_id, p_client_id, p_emballage_id, p_precedent)
  ON CONFLICT (company_id, client_id, emballage_id)
  DO UPDATE SET precedent_du = EXCLUDED.precedent_du, date_saisie = CURRENT_DATE;

  INSERT INTO clients_emballages_soldes (company_id, secteur_id, client_id, emballage_id, du_actuel, updated_at)
  VALUES (p_company_id, p_secteur_id, p_client_id, p_emballage_id, p_precedent, NOW())
  ON CONFLICT (company_id, secteur_id, client_id, emballage_id)
  DO UPDATE SET du_actuel = EXCLUDED.du_actuel, updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 7. Activer RLS sur les tables
ALTER TABLE emballages_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_emballages_fournisseur ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients_emballages_initiaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients_emballages_soldes ENABLE ROW LEVEL SECURITY;
ALTER TABLE mouvements_emballages ENABLE ROW LEVEL SECURITY;

-- Politiques RLS génériques
DO $$ BEGIN
  DROP POLICY IF EXISTS "emballages_types_all" ON emballages_types;
  CREATE POLICY "emballages_types_all" ON emballages_types FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "stock_emballages_fournisseur_all" ON stock_emballages_fournisseur;
  CREATE POLICY "stock_emballages_fournisseur_all" ON stock_emballages_fournisseur FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "clients_emballages_initiaux_all" ON clients_emballages_initiaux;
  CREATE POLICY "clients_emballages_initiaux_all" ON clients_emballages_initiaux FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "clients_emballages_soldes_all" ON clients_emballages_soldes;
  CREATE POLICY "clients_emballages_soldes_all" ON clients_emballages_soldes FOR ALL USING (true) WITH CHECK (true);

  DROP POLICY IF EXISTS "mouvements_emballages_all" ON mouvements_emballages;
  CREATE POLICY "mouvements_emballages_all" ON mouvements_emballages FOR ALL USING (true) WITH CHECK (true);
END $$;
