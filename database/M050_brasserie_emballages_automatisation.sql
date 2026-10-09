-- =============================================================================
-- GESTIO 229 ERP — Migration M050 : Automatisation Gestion des Consignations Brasserie
-- Synchronisation automatique Vente -> Mouvements Consignations & Dettes Emballages
-- =============================================================================

-- 1. Table brasserie_emballages_types
CREATE TABLE IF NOT EXISTS brasserie_emballages_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID,
  code TEXT NOT NULL,
  nom TEXT NOT NULL,
  stock_depot NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_brasserie_emb_types_comp ON brasserie_emballages_types(company_id, code);

-- 2. Table brasserie_emballages_mouvements
CREATE TABLE IF NOT EXISTS brasserie_emballages_mouvements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID,
  client_id UUID,
  client_nom TEXT,
  emballage_type_id UUID,
  code TEXT NOT NULL,
  type_mouvement TEXT NOT NULL, -- 'SORTIE', 'RETOUR', 'INITIAL', 'AJUSTEMENT', 'AVOIR_RETOUR'
  quantite NUMERIC NOT NULL DEFAULT 0,
  vente_id UUID,
  vente_numero TEXT,
  date TIMESTAMPTZ DEFAULT NOW(),
  solde_avant NUMERIC DEFAULT 0,
  solde_apres NUMERIC DEFAULT 0,
  observation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brasserie_emb_mvt_comp_cli ON brasserie_emballages_mouvements(company_id, client_id);
CREATE INDEX IF NOT EXISTS idx_brasserie_emb_mvt_code ON brasserie_emballages_mouvements(company_id, code);
CREATE INDEX IF NOT EXISTS idx_brasserie_emb_mvt_vente ON brasserie_emballages_mouvements(vente_id);

-- 3. Colonnes emballage sur la table products
ALTER TABLE products ADD COLUMN IF NOT EXISTS emballage_type_code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS emballage_code TEXT;

-- 4. Mapping automatique des produits Brasserie courants
UPDATE products 
SET emballage_type_code = 'C20T' 
WHERE (name ILIKE '%20T%' OR name ILIKE '%20 BOUT%' OR name ILIKE '%20B%' OR name ILIKE '%CASTEL 20%')
  AND (emballage_type_code IS NULL OR emballage_type_code = '');

UPDATE products 
SET emballage_type_code = 'C12T' 
WHERE (name ILIKE '%12T%' OR name ILIKE '%12 BOUT%' OR name ILIKE '%12B%' OR name ILIKE '%FLAG 12%')
  AND (emballage_type_code IS NULL OR emballage_type_code = '');

UPDATE products 
SET emballage_type_code = 'C24T' 
WHERE (name ILIKE '%24T%' OR name ILIKE '%24 BOUT%' OR name ILIKE '%24B%')
  AND (emballage_type_code IS NULL OR emballage_type_code = '');

-- 5. Insertion des emballages types par défaut pour toutes les entreprises existantes
DO $$
DECLARE
  comp RECORD;
BEGIN
  FOR comp IN SELECT id FROM companies LOOP
    -- C12T
    INSERT INTO brasserie_emballages_types (company_id, code, nom, stock_depot)
    VALUES (comp.id, 'C12T', 'Casier 12 Bouteilles', 0)
    ON CONFLICT (company_id, code) DO NOTHING;

    -- C20T
    INSERT INTO brasserie_emballages_types (company_id, code, nom, stock_depot)
    VALUES (comp.id, 'C20T', 'Casier 20 Bouteilles', 0)
    ON CONFLICT (company_id, code) DO NOTHING;

    -- C24T
    INSERT INTO brasserie_emballages_types (company_id, code, nom, stock_depot)
    VALUES (comp.id, 'C24T', 'Casier 24 Bouteilles', 0)
    ON CONFLICT (company_id, code) DO NOTHING;

    -- Synchronisation avec brasserie_emballages si manquants
    INSERT INTO brasserie_emballages (company_id, sector_slug, code, designation, type, stock_depot, is_active)
    SELECT comp.id, 'brasserie', 'C12T', 'Casier 12 Bouteilles', 'casier', 0, true
    WHERE NOT EXISTS (SELECT 1 FROM brasserie_emballages WHERE company_id = comp.id AND code = 'C12T');

    INSERT INTO brasserie_emballages (company_id, sector_slug, code, designation, type, stock_depot, is_active)
    SELECT comp.id, 'brasserie', 'C20T', 'Casier 20 Bouteilles', 'casier', 0, true
    WHERE NOT EXISTS (SELECT 1 FROM brasserie_emballages WHERE company_id = comp.id AND code = 'C20T');

    INSERT INTO brasserie_emballages (company_id, sector_slug, code, designation, type, stock_depot, is_active)
    SELECT comp.id, 'brasserie', 'C24T', 'Casier 24 Bouteilles', 'casier', 0, true
    WHERE NOT EXISTS (SELECT 1 FROM brasserie_emballages WHERE company_id = comp.id AND code = 'C24T');
  END LOOP;
END $$;

-- 6. Politiques RLS (allow_all)
ALTER TABLE brasserie_emballages_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_brasserie_emballages_types" ON brasserie_emballages_types;
CREATE POLICY "allow_all_brasserie_emballages_types" ON brasserie_emballages_types FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_brasserie_emballages_types" ON brasserie_emballages_types;
CREATE POLICY "allow_anon_brasserie_emballages_types" ON brasserie_emballages_types FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE brasserie_emballages_mouvements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_brasserie_emballages_mouvements" ON brasserie_emballages_mouvements;
CREATE POLICY "allow_all_brasserie_emballages_mouvements" ON brasserie_emballages_mouvements FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_brasserie_emballages_mouvements" ON brasserie_emballages_mouvements;
CREATE POLICY "allow_anon_brasserie_emballages_mouvements" ON brasserie_emballages_mouvements FOR ALL TO anon USING (true) WITH CHECK (true);
