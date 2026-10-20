-- =============================================================================
-- GESTIO 229 SaaS — Migration M054 : Configuration du circuit de vente & encaissement
-- Support du Mode 1 (Intégré) et Mode 2 (Séparation Vendeur / Caissière)
-- =============================================================================

-- 1. Ajout de la colonne sales_circuit_mode dans la table companies
ALTER TABLE IF EXISTS companies
ADD COLUMN IF NOT EXISTS sales_circuit_mode text DEFAULT 'INTEGRE';

-- Index pour requêtes rapides par entreprise
CREATE INDEX IF NOT EXISTS idx_companies_sales_circuit_mode ON companies(sales_circuit_mode);

-- 2. Colonnes complémentaires pour audit et encaissement sur sales_orders
ALTER TABLE IF EXISTS sales_orders
ADD COLUMN IF NOT EXISTS encaisse_par text;

ALTER TABLE IF EXISTS sales_orders
ADD COLUMN IF NOT EXISTS encaisse_par_id uuid;

ALTER TABLE IF EXISTS sales_orders
ADD COLUMN IF NOT EXISTS date_encaissement timestamptz;

ALTER TABLE IF EXISTS sales_orders
ADD COLUMN IF NOT EXISTS transaction_ref text;

-- Index pour recherche rapide des bons en attente d'encaissement
CREATE INDEX IF NOT EXISTS idx_sales_orders_pending_caisse ON sales_orders(company_id, sector_slug, status)
WHERE status IN ('pending_cashier', 'partiellement_paye');
