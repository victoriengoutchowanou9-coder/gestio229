-- ==============================================================================
-- GESTIO 229 SAAS — M020 : AJOUT COLONNES SECTOR_SLUG & NOTES MANQUANTES
-- Optionnel : permet d'indexer directement par secteur au niveau SQL
-- ==============================================================================

-- 1. Table sales_orders
ALTER TABLE sales_orders 
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'COMPLET';

CREATE INDEX IF NOT EXISTS idx_sales_orders_sector_slug ON sales_orders(company_id, sector_slug);

-- 2. Table expenses
ALTER TABLE expenses 
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_expenses_sector_slug ON expenses(company_id, sector_slug);

-- 3. Table customers
ALTER TABLE customers 
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100),
    ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;

-- 4. Table suppliers
ALTER TABLE suppliers 
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100),
    ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;

-- Actualisation du cache de schéma Supabase
NOTIFY pgrst, 'reload schema';
