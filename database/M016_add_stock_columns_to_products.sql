-- ==============================================================================
-- GESTIO 229 — MIGRATION M016 : Colonnes de Stocks Double Bivalente (UCD / UV)
-- ==============================================================================
-- À exécuter dans : Supabase Dashboard → SQL Editor → New Query
-- Cette migration ajoute directement les colonnes stock_magasin, stock_vente, ucd, uv et coef
-- pour assurer une compatibilité native optimale avec PostgreSQL en plus du stockage sector_meta.
-- ==============================================================================

-- 1. Ajout sécurisé des colonnes à la table products
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS stock_magasin NUMERIC(15,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS stock_vente NUMERIC(15,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS ucd VARCHAR(50) DEFAULT 'Carton',
ADD COLUMN IF NOT EXISTS uv VARCHAR(50) DEFAULT 'Pièce',
ADD COLUMN IF NOT EXISTS coef NUMERIC(15,4) DEFAULT 1.00;

-- 2. Synchroniser les stocks existants depuis sector_meta si disponibles
UPDATE products
SET 
  stock_magasin = COALESCE((sector_meta->>'stock_magasin')::numeric, stock_magasin, 0.00),
  stock_vente = COALESCE((sector_meta->>'stock_vente')::numeric, stock_vente, 0.00),
  ucd = COALESCE(sector_meta->>'ucd', ucd, 'Carton'),
  uv = COALESCE(sector_meta->>'uv', uv, 'Pièce'),
  coef = COALESCE((sector_meta->>'coef')::numeric, coef, 1.00)
WHERE sector_meta IS NOT NULL;

-- 3. Indexation des colonnes pour optimiser les requêtes multi-entreprises
CREATE INDEX IF NOT EXISTS idx_products_company_active ON products(company_id, is_active);
CREATE INDEX IF NOT EXISTS idx_products_company_code ON products(company_id, code);

-- 4. Vérification
SELECT company_id, code, name, stock_magasin, stock_vente, ucd, uv, coef, is_active 
FROM products 
ORDER BY created_at DESC 
LIMIT 10;
