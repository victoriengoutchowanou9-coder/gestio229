-- =============================================================================
-- GESTIO 229 ERP — Migration M051 : Unification Facture & Automatisation Consignations
-- Périmètre : Brasserie & Dépôt de Boissons — Modèle Facture A4 + Mouvements Emballages
-- =============================================================================

-- 1. Table brasserie_emballages_types (si non existante)
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

-- 2. Table brasserie_emballages_mouvements (avec code et emballage_code)
CREATE TABLE IF NOT EXISTS brasserie_emballages_mouvements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID,
  client_id UUID,
  client_nom TEXT,
  emballage_type_id UUID,
  code TEXT,
  emballage_code TEXT,
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

-- Garantir la présence des colonnes indispensables
ALTER TABLE brasserie_emballages_mouvements ADD COLUMN IF NOT EXISTS emballage_code TEXT;
ALTER TABLE brasserie_emballages_mouvements ADD COLUMN IF NOT EXISTS code TEXT;
ALTER TABLE brasserie_emballages_mouvements ADD COLUMN IF NOT EXISTS client_nom TEXT;
ALTER TABLE brasserie_emballages_mouvements ADD COLUMN IF NOT EXISTS solde_avant NUMERIC DEFAULT 0;
ALTER TABLE brasserie_emballages_mouvements ADD COLUMN IF NOT EXISTS solde_apres NUMERIC DEFAULT 0;
ALTER TABLE brasserie_emballages_mouvements ADD COLUMN IF NOT EXISTS date TIMESTAMPTZ DEFAULT NOW();

UPDATE brasserie_emballages_mouvements 
SET emballage_code = code 
WHERE emballage_code IS NULL AND code IS NOT NULL;

UPDATE brasserie_emballages_mouvements 
SET code = emballage_code 
WHERE code IS NULL AND emballage_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_brasserie_emb_mvt_comp_cli ON brasserie_emballages_mouvements(company_id, client_id);
CREATE INDEX IF NOT EXISTS idx_brasserie_emb_mvt_code ON brasserie_emballages_mouvements(company_id, code);
CREATE INDEX IF NOT EXISTS idx_brasserie_emb_mvt_emb_code ON brasserie_emballages_mouvements(company_id, emballage_code);
CREATE INDEX IF NOT EXISTS idx_brasserie_emb_mvt_vente ON brasserie_emballages_mouvements(vente_id);

-- 3. Colonnes sur la table products pour mapper les emballages
ALTER TABLE products ADD COLUMN IF NOT EXISTS emballage_type_code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS emballage_code TEXT;

-- Mappage automatique des produits Brasserie vers leurs codes casiers
UPDATE products 
SET emballage_type_code = 'C20T', emballage_code = 'C20T'
WHERE (name ILIKE '%20T%' OR name ILIKE '%20 BOUT%' OR name ILIKE '%20B%' OR name ILIKE '%CASTEL 20%')
  AND (emballage_type_code IS NULL OR emballage_type_code = '');

UPDATE products 
SET emballage_type_code = 'C12T', emballage_code = 'C12T'
WHERE (name ILIKE '%12T%' OR name ILIKE '%12 BOUT%' OR name ILIKE '%12B%' OR name ILIKE '%FLAG 12%')
  AND (emballage_type_code IS NULL OR emballage_type_code = '');

UPDATE products 
SET emballage_type_code = 'C24T', emballage_code = 'C24T'
WHERE (name ILIKE '%24T%' OR name ILIKE '%24 BOUT%' OR name ILIKE '%24B%' OR name ILIKE '%BEAUFORT 24%')
  AND (emballage_type_code IS NULL OR emballage_type_code = '');

-- 4. Initialisation des types emballages par défaut pour toutes les entreprises
DO $$
DECLARE
  comp RECORD;
BEGIN
  FOR comp IN SELECT id FROM companies LOOP
    INSERT INTO brasserie_emballages_types (company_id, code, nom, stock_depot)
    VALUES (comp.id, 'C12T', 'Casier 12 Bouteilles', 0)
    ON CONFLICT (company_id, code) DO NOTHING;

    INSERT INTO brasserie_emballages_types (company_id, code, nom, stock_depot)
    VALUES (comp.id, 'C20T', 'Casier 20 Bouteilles', 0)
    ON CONFLICT (company_id, code) DO NOTHING;

    INSERT INTO brasserie_emballages_types (company_id, code, nom, stock_depot)
    VALUES (comp.id, 'C24T', 'Casier 24 Bouteilles', 0)
    ON CONFLICT (company_id, code) DO NOTHING;
  END LOOP;
END $$;

-- 5. Sécurité RLS permissive pour éviter tout blocage
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
