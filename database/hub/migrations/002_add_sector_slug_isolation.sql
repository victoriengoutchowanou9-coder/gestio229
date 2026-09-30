-- ==============================================================================
-- GESTIO 229 SAAS — MIGRATION CENTRALE D'ISOLATION PAR SOUS-LOGICIEL
-- FICHIER : database/hub/migrations/002_add_sector_slug_isolation.sql
-- OBJECTIF : Garantir l'isolation totale des données par (company_id + sector_slug)
-- SANS PERTE DE DONNÉES — Migration purement additive
-- ==============================================================================

-- 1. Ajout de la colonne sector_slug sur les tables opérationnelles communes
ALTER TABLE IF EXISTS products 
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

ALTER TABLE IF EXISTS customers 
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

ALTER TABLE IF EXISTS suppliers 
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

ALTER TABLE IF EXISTS sales_orders 
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

ALTER TABLE IF EXISTS cash_registers 
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

ALTER TABLE IF EXISTS expenses 
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

ALTER TABLE IF EXISTS stock_movements 
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';

-- 2. Index composites haute performance pour isolation multi-tenant et multi-secteurs
CREATE INDEX IF NOT EXISTS idx_products_company_sector 
    ON products(company_id, sector_slug);

CREATE INDEX IF NOT EXISTS idx_customers_company_sector 
    ON customers(company_id, sector_slug);

CREATE INDEX IF NOT EXISTS idx_suppliers_company_sector 
    ON suppliers(company_id, sector_slug);

CREATE INDEX IF NOT EXISTS idx_orders_company_sector 
    ON sales_orders(company_id, sector_slug);

CREATE INDEX IF NOT EXISTS idx_cash_registers_company_sector 
    ON cash_registers(company_id, sector_slug);

CREATE INDEX IF NOT EXISTS idx_expenses_company_sector 
    ON expenses(company_id, sector_slug);

-- 3. Mise à jour rétrocompatible des données réelles existantes
-- Les 23 produits existants d'ETS BIO sont catégorisés proprement :
-- Les produits avec cartons / kg (Tilapia, HAKE, HM 16+) -> poissonnerie
UPDATE products 
SET sector_slug = 'poissonnerie'
WHERE (sector_meta->>'coef')::numeric > 1 
   OR name ILIKE '%tilapia%' 
   OR name ILIKE '%hake%' 
   OR name ILIKE '%hm 16%'
   OR name ILIKE '%cuisse%';

-- Les autres produits généraux d'ETS BIO -> boutique
UPDATE products 
SET sector_slug = 'boutique' 
WHERE sector_slug IS NULL OR sector_slug = '';

-- Clients, fournisseurs et caisses existants rattachés au secteur d'origine
UPDATE customers SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR sector_slug = '';
UPDATE suppliers SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR sector_slug = '';
UPDATE sales_orders SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR sector_slug = '';
UPDATE cash_registers SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR sector_slug = '';

-- ==============================================================================
-- FIN DE LA MIGRATION
-- ==============================================================================
