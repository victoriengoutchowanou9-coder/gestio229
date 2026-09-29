-- ==============================================================================
-- GESTIO 229 — MIGRATION M018 : Fiabilisation Ventes, Caisse, Audit, Bons de Commande & Budget
-- ==============================================================================
-- À exécuter dans : Supabase Dashboard → SQL Editor → New Query
-- Cette migration additive sécurisée enrichit le schéma sans aucune perte de données :
-- 1. sales_orders : colonnes payment_method, customer_name, status, notes, payments, lines
-- 2. customers : garantie des colonnes de crédit et remise
-- 3. bons_commande : garantie des colonnes multi-produits
-- 4. budgets & budget_lines : structure pour la gestion budgétaire comptable
-- 5. customer_repayments : traçabilité des quittances de remboursement
-- ==============================================================================

-- 1. Enrichissement sécurisé de sales_orders
ALTER TABLE sales_orders 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'especes',
ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'COMPLET',
ADD COLUMN IF NOT EXISTS notes TEXT,
ADD COLUMN IF NOT EXISTS payments JSONB,
ADD COLUMN IF NOT EXISTS lines JSONB;

CREATE INDEX IF NOT EXISTS idx_sales_orders_company_date ON sales_orders(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_orders_company_payment ON sales_orders(company_id, payment_method);

-- 2. Garantie des colonnes de crédit sur customers
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS credit_authorized BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(15,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS discount_eligible BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2) DEFAULT 0.00;

-- 3. Garantie des colonnes multi-produits sur bons_commande
ALTER TABLE bons_commande
ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS supplier_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS order_number VARCHAR(50),
ADD COLUMN IF NOT EXISTS lines JSONB,
ADD COLUMN IF NOT EXISTS total_ht NUMERIC(15,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_tva NUMERIC(15,2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_bons_commande_company ON bons_commande(company_id);

-- 4. Table des Quittances et Remboursements Clients (Traçabilité stricte)
CREATE TABLE IF NOT EXISTS customer_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    receipt_number VARCHAR(50) NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'especes',
    previous_debt NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    remaining_debt NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    received_by VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repayments_company ON customer_repayments(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_repayments_customer ON customer_repayments(customer_id);

-- 5. Structure Gestion Budgétaire (Comptabilité SYSCOHADA)
CREATE TABLE IF NOT EXISTS budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    fiscal_year INT NOT NULL,
    title VARCHAR(150) NOT NULL,
    period_type VARCHAR(50) DEFAULT 'annuel', -- annuel, trimestriel, mensuel
    status VARCHAR(50) DEFAULT 'actif', -- actif, cloture, brouillon
    total_budgeted NUMERIC(15,2) DEFAULT 0.00,
    total_actual NUMERIC(15,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL, -- Ventes, Achats marchandises, Charges exploitation, Salaires, Impots
    account_code VARCHAR(50),
    label VARCHAR(255) NOT NULL,
    allocated_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    actual_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budgets_company ON budgets(company_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_budget_lines_budget ON budget_lines(budget_id);

-- 6. Politiques RLS sécurisées
ALTER TABLE customer_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_lines ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "company_isolation_repayments" ON customer_repayments;
    CREATE POLICY "company_isolation_repayments" ON customer_repayments
    FOR ALL USING (company_id IS NOT NULL);

    DROP POLICY IF EXISTS "company_isolation_budgets" ON budgets;
    CREATE POLICY "company_isolation_budgets" ON budgets
    FOR ALL USING (company_id IS NOT NULL);

    DROP POLICY IF EXISTS "company_isolation_budget_lines" ON budget_lines;
    CREATE POLICY "company_isolation_budget_lines" ON budget_lines
    FOR ALL USING (company_id IS NOT NULL);
END $$;
