-- =============================================================================
-- GESTIO 229 SaaS — Migration M055 : Paramétrage du circuit de vente par secteur
-- Support du choix indépendant du Mode 1 (Intégré) et Mode 2 (Séparé) par secteur
-- =============================================================================

-- 1. Ajout de la colonne sales_circuit_mode_by_sector (JSONB) dans la table companies
ALTER TABLE IF EXISTS companies
ADD COLUMN IF NOT EXISTS sales_circuit_mode_by_sector JSONB DEFAULT '{}'::jsonb;

-- 2. Index GIN pour requêtes JSONB ultra-rapides
CREATE INDEX IF NOT EXISTS idx_companies_sales_circuit_by_sector
ON companies USING gin (sales_circuit_mode_by_sector);

-- 3. Colonne de traçabilité d'annulation sur sales_orders si absente
ALTER TABLE IF EXISTS sales_orders
ADD COLUMN IF NOT EXISTS motif_annulation text;
