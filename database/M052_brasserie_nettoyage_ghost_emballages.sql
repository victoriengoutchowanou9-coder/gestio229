-- =============================================================================
-- M052 : NETTOYAGE DÉFINITIF DES EMBALLAGES FANTÔMES (UUID) — GESTIO 229 ERP
-- SECTEUR BRASSERIE & DÉPÔT DE BOISSONS
-- =============================================================================

-- 1. Supprimer les mouvements d'emballages liés aux codes fantômes (UUID)
DELETE FROM brasserie_emballages_mouvements 
WHERE (emballage_code LIKE '%-%' AND length(emballage_code) > 10)
   OR (code LIKE '%-%' AND length(code) > 10);

-- 2. Supprimer les types fantômes dans brasserie_emballages_types (UUID)
DELETE FROM brasserie_emballages_types 
WHERE code LIKE '%-%' AND length(code) > 10;

-- 3. Supprimer les types fantômes dans brasserie_emballages (UUID)
DELETE FROM brasserie_emballages 
WHERE code LIKE '%-%' AND length(code) > 10;

-- 4. Nettoyer les soldes M046 s'il y a des traces de fantômes
DELETE FROM clients_emballages_soldes 
WHERE emballage_id::text IN (
  SELECT id::text FROM brasserie_emballages WHERE code LIKE '%-%' AND length(code) > 10
);

-- 5. S'assurer que les vrais types standards existent pour chaque entreprise
INSERT INTO brasserie_emballages_types (company_id, secteur_id, code, nom, stock_depot)
SELECT id, sector_id, 'C12T', 'Casier 12 Bouteilles', 0 FROM companies
ON CONFLICT (company_id, secteur_id, code) DO NOTHING;

INSERT INTO brasserie_emballages_types (company_id, secteur_id, code, nom, stock_depot)
SELECT id, sector_id, 'C20T', 'Casier 20 Bouteilles', 0 FROM companies
ON CONFLICT (company_id, secteur_id, code) DO NOTHING;

INSERT INTO brasserie_emballages_types (company_id, secteur_id, code, nom, stock_depot)
SELECT id, sector_id, 'C24T', 'Casier 24 Bouteilles', 0 FROM companies
ON CONFLICT (company_id, secteur_id, code) DO NOTHING;

-- 6. S'assurer que brasserie_emballages contient également les 3 types standards
INSERT INTO brasserie_emballages (company_id, sector_slug, code, designation, type, unite, valeur_consignation, stock_depot, is_active)
SELECT id, 'brasserie', 'C12T', 'Casier 12 Bouteilles', 'casier', 'unité', 0, 0, true FROM companies
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO brasserie_emballages (company_id, sector_slug, code, designation, type, unite, valeur_consignation, stock_depot, is_active)
SELECT id, 'brasserie', 'C20T', 'Casier 20 Bouteilles', 'casier', 'unité', 0, 0, true FROM companies
ON CONFLICT (company_id, code) DO NOTHING;

INSERT INTO brasserie_emballages (company_id, sector_slug, code, designation, type, unite, valeur_consignation, stock_depot, is_active)
SELECT id, 'brasserie', 'C24T', 'Casier 24 Bouteilles', 'casier', 'unité', 0, 0, true FROM companies
ON CONFLICT (company_id, code) DO NOTHING;

-- 7. Corriger les produits dont emballage_code est NULL ou UUID pour mapper vers les vrais codes
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

-- 8. Requêtes de contrôle :
-- SELECT code, nom, stock_depot FROM brasserie_emballages_types ORDER BY code;
-- SELECT code, designation, stock_depot FROM brasserie_emballages ORDER BY code;
