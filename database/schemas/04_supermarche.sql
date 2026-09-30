-- ==============================================================================
-- GESTIO 229 SAAS — SOUS-LOGICIEL : SUPERMARCHÉ & SUPÉRETTE
-- SCHÉMA POSTGRESQL : supermarche
-- SLUG OFFICIEL : supermarche
-- NOTE : Isolation totale des tables et des données de ce secteur.
-- ==============================================================================

CREATE SCHEMA IF NOT EXISTS supermarche;

-- ==============================================================================
-- 1. CLIENTS DU SOUS-LOGICIEL (Supermarché & Supérette)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS supermarche.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    full_name VARCHAR(200) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(150),
    address TEXT,
    credit_limit NUMERIC(12,2) DEFAULT 0.00,
    current_debt NUMERIC(12,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supermarche_customers_company ON supermarche.customers(company_id);

-- ==============================================================================
-- 2. FOURNISSEURS DU SOUS-LOGICIEL (Supermarché & Supérette)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS supermarche.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    company_name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(150),
    phone VARCHAR(50),
    email VARCHAR(150),
    ifu_number VARCHAR(50),
    address TEXT,
    current_payable NUMERIC(12,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supermarche_suppliers_company ON supermarche.suppliers(company_id);

-- ==============================================================================
-- 3. PRODUITS & ARTICLES DU SOUS-LOGICIEL (Supermarché & Supérette)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS supermarche.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sku VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    description TEXT,
    purchase_price NUMERIC(12,2) DEFAULT 0.00,
    selling_price NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    current_stock NUMERIC(12,2) DEFAULT 0.00,
    alert_threshold NUMERIC(12,2) DEFAULT 5.00,
    unit VARCHAR(50) DEFAULT 'unité',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supermarche_products_company ON supermarche.products(company_id);

-- ==============================================================================
-- 4. VENTES & COMMANDES DU SOUS-LOGICIEL (Supermarché & Supérette)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS supermarche.sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES supermarche.customers(id) ON DELETE SET NULL,
    order_number VARCHAR(100) NOT NULL,
    order_date TIMESTAMPTZ DEFAULT now(),
    subtotal_ht NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    tva_amount NUMERIC(15,2) DEFAULT 0.00,
    aib_amount NUMERIC(15,2) DEFAULT 0.00,
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    due_amount NUMERIC(15,2) DEFAULT 0.00,
    payment_method VARCHAR(50) DEFAULT 'CASH', -- CASH, MOMO, CARD, CHEQUE, VIREMENT
    payment_status VARCHAR(50) DEFAULT 'PAID', -- PAID, PARTIAL, UNPAID
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supermarche_orders_company ON supermarche.sales_orders(company_id);

CREATE TABLE IF NOT EXISTS supermarche.sales_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES supermarche.sales_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES supermarche.products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity NUMERIC(10,2) NOT NULL DEFAULT 1.00,
    unit_price NUMERIC(12,2) NOT NULL,
    total_amount NUMERIC(15,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supermarche_items_order ON supermarche.sales_order_items(order_id);

-- ==============================================================================
-- 5. CAISSES & SESSIONS DU SOUS-LOGICIEL (Supermarché & Supérette)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS supermarche.cash_registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    current_cash_balance NUMERIC(15,2) DEFAULT 0.00,
    current_momo_balance NUMERIC(15,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supermarche.cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    register_id UUID NOT NULL REFERENCES supermarche.cash_registers(id) ON DELETE CASCADE,
    opened_by UUID REFERENCES user_profiles(id),
    closed_by UUID REFERENCES user_profiles(id),
    opening_balance NUMERIC(15,2) DEFAULT 0.00,
    closing_balance NUMERIC(15,2),
    total_sales NUMERIC(15,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'OPEN', -- OPEN, CLOSED
    opened_at TIMESTAMPTZ DEFAULT now(),
    closed_at TIMESTAMPTZ
);

-- ==============================================================================
-- 6. DÉPENSES DU SOUS-LOGICIEL (Supermarché & Supérette)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS supermarche.expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    payment_method VARCHAR(50) DEFAULT 'CASH',
    registered_by UUID REFERENCES user_profiles(id),
    expense_date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supermarche_expenses_company ON supermarche.expenses(company_id);

-- ==============================================================================
-- 7. MOUVEMENTS DE STOCKS DU SOUS-LOGICIEL (Supermarché & Supérette)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS supermarche.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES supermarche.products(id) ON DELETE CASCADE,
    movement_type VARCHAR(50) NOT NULL, -- IN, OUT, ADJUSTMENT, LOSS
    quantity NUMERIC(10,2) NOT NULL,
    previous_stock NUMERIC(10,2) NOT NULL,
    new_stock NUMERIC(10,2) NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_supermarche_stock_mov_comp ON supermarche.stock_movements(company_id);


-- Tables spécifiques Supermarché & Supérette
CREATE TABLE IF NOT EXISTS supermarche.rayons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    code_rayon VARCHAR(50) NOT NULL,
    nom_rayon VARCHAR(150) NOT NULL,
    responsable VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supermarche.promos_dlc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product_id UUID REFERENCES supermarche.products(id) ON DELETE CASCADE,
    date_limite_conso DATE NOT NULL,
    remise_pourcentage NUMERIC(5,2) DEFAULT 20.00,
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- ==============================================================================
-- 8. POLITIQUES DE SÉCURITÉ ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE supermarche.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supermarche.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supermarche.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE supermarche.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE supermarche.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supermarche.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supermarche.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE supermarche.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE supermarche.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rls_supermarche_customers" ON supermarche.customers FOR ALL USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_supermarche_suppliers" ON supermarche.suppliers FOR ALL USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_supermarche_products" ON supermarche.products FOR ALL USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_supermarche_orders" ON supermarche.sales_orders FOR ALL USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_supermarche_registers" ON supermarche.cash_registers FOR ALL USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_supermarche_expenses" ON supermarche.expenses FOR ALL USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
CREATE POLICY "rls_supermarche_movements" ON supermarche.stock_movements FOR ALL USING (company_id = auth.company_id()) WITH CHECK (company_id = auth.company_id());
