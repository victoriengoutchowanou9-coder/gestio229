-- =============================================================================
-- M052 : NETTOYAGE DÉFINITIF DES EMBALLAGES FANTÔMES (UUID) — GESTIO 229 ERP
-- SECTEUR BRASSERIE & DÉPÔT DE BOISSONS (100% SÉCURISÉ & SANS ERREUR DE COLONNE)
-- =============================================================================

DO $$
BEGIN
  -- 1. Supprimer les mouvements d'emballages liés aux codes fantômes (UUID)
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'brasserie_emballages_mouvements') THEN
    DELETE FROM brasserie_emballages_mouvements 
    WHERE (emballage_code LIKE '%-%' AND length(emballage_code) > 10)
       OR (code LIKE '%-%' AND length(code) > 10);
  END IF;

  -- 2. Supprimer les types fantômes dans brasserie_emballages_types (UUID)
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'brasserie_emballages_types') THEN
    DELETE FROM brasserie_emballages_types 
    WHERE code LIKE '%-%' AND length(code) > 10;
  END IF;

  -- 3. Supprimer les types fantômes dans brasserie_emballages (UUID)
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'brasserie_emballages') THEN
    DELETE FROM brasserie_emballages 
    WHERE code LIKE '%-%' AND length(code) > 10;
  END IF;

  -- 4. Nettoyer les soldes résiduels si la table existe
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'clients_emballages_soldes') THEN
    EXECUTE 'DELETE FROM clients_emballages_soldes WHERE emballage_id::text IN (SELECT id::text FROM brasserie_emballages WHERE code LIKE ''%-%'' AND length(code) > 10)';
  END IF;
END $$;

-- 5. S'assurer que les vrais types standards existent dans brasserie_emballages_types
INSERT INTO brasserie_emballages_types (company_id, code, nom, stock_depot)
SELECT c.id, 'C12T', 'Casier 12 Bouteilles', 0 
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM brasserie_emballages_types bet WHERE bet.company_id = c.id AND bet.code = 'C12T'
);

INSERT INTO brasserie_emballages_types (company_id, code, nom, stock_depot)
SELECT c.id, 'C20T', 'Casier 20 Bouteilles', 0 
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM brasserie_emballages_types bet WHERE bet.company_id = c.id AND bet.code = 'C20T'
);

INSERT INTO brasserie_emballages_types (company_id, code, nom, stock_depot)
SELECT c.id, 'C24T', 'Casier 24 Bouteilles', 0 
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM brasserie_emballages_types bet WHERE bet.company_id = c.id AND bet.code = 'C24T'
);

-- 6. S'assurer que les vrais types standards existent dans brasserie_emballages
INSERT INTO brasserie_emballages (company_id, sector_slug, code, designation, type, unite, valeur_consignation, stock_depot, is_active)
SELECT c.id, 'brasserie', 'C12T', 'Casier 12 Bouteilles', 'casier', 'unité', 0, 0, true 
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM brasserie_emballages be WHERE be.company_id = c.id AND be.code = 'C12T'
);

INSERT INTO brasserie_emballages (company_id, sector_slug, code, designation, type, unite, valeur_consignation, stock_depot, is_active)
SELECT c.id, 'brasserie', 'C20T', 'Casier 20 Bouteilles', 'casier', 'unité', 0, 0, true 
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM brasserie_emballages be WHERE be.company_id = c.id AND be.code = 'C20T'
);

INSERT INTO brasserie_emballages (company_id, sector_slug, code, designation, type, unite, valeur_consignation, stock_depot, is_active)
SELECT c.id, 'brasserie', 'C24T', 'Casier 24 Bouteilles', 'casier', 'unité', 0, 0, true 
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM brasserie_emballages be WHERE be.company_id = c.id AND be.code = 'C24T'
);

-- 7. Corriger les produits dont emballage_code est NULL ou UUID
UPDATE products 
SET emballage_code = 'C20T', emballage_type_code = 'C20T' 
WHERE (emballage_code IS NULL OR emballage_code LIKE '%-%') 
  AND (name ILIKE '%20T%' OR name ILIKE '%20 BOUT%' OR name ILIKE '%CASTEL 20%');

UPDATE products 
SET emballage_code = 'C12T', emballage_type_code = 'C12T' 
WHERE (emballage_code IS NULL OR emballage_code LIKE '%-%') 
  AND (name ILIKE '%12T%' OR name ILIKE '%12 BOUT%' OR name ILIKE '%FLAG 12%');

UPDATE products 
SET emballage_code = 'C24T', emballage_type_code = 'C24T' 
WHERE (emballage_code IS NULL OR emballage_code LIKE '%-%') 
  AND (name ILIKE '%24T%' OR name ILIKE '%24 BOUT%' OR name ILIKE '%BEAUFORT 24%');
