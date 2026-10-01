-- ==============================================================================
-- GESTIO 229 — MIGRATION M019 : PERSISTANCE TOTALE SUPABASE & ISOLATION RLS
-- ==============================================================================
-- Migration additive et idempotente garantissant que 100% des données métier
-- sont persistées dans Supabase et isolées strictement par company_id.
-- ==============================================================================

-- 1. Table des Remboursements de Créances Clients
CREATE TABLE IF NOT EXISTS customer_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255),
    sector_slug VARCHAR(100) DEFAULT 'boutique',
    amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'especes',
    reference VARCHAR(100),
    previous_debt NUMERIC(15,2) DEFAULT 0.00,
    remaining_debt NUMERIC(15,2) DEFAULT 0.00,
    notes TEXT,
    received_by VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cust_repay_company ON customer_repayments(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cust_repay_customer ON customer_repayments(customer_id);

-- 2. Table des Demandes et Transferts de Trésorerie
CREATE TABLE IF NOT EXISTS treasury_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) DEFAULT 'boutique',
    requested_by VARCHAR(150),
    type VARCHAR(50) NOT NULL, -- Espèces, MoMo, Virement
    amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    motif TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'EN_ATTENTE', -- EN_ATTENTE, APPROVED, REJECTED
    approved_by VARCHAR(150),
    approved_at TIMESTAMPTZ,
    target_account_id UUID REFERENCES treasury_accounts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_treasury_transfers_company ON treasury_transfers(company_id, created_at DESC);

-- 3. Table des Employés / Salariés
CREATE TABLE IF NOT EXISTS staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    job_title VARCHAR(150) NOT NULL,
    phone VARCHAR(50),
    cnss_number VARCHAR(100),
    base_salary NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    transport_allowance NUMERIC(15,2) DEFAULT 0.00,
    housing_allowance NUMERIC(15,2) DEFAULT 0.00,
    bonus NUMERIC(15,2) DEFAULT 0.00,
    advance_payment NUMERIC(15,2) DEFAULT 0.00,
    hire_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_members_company ON staff_members(company_id);

-- 4. Table des Règlements de Paie
CREATE TABLE IF NOT EXISTS payroll_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES staff_members(id) ON DELETE SET NULL,
    employee_name VARCHAR(255) NOT NULL,
    period VARCHAR(50) NOT NULL, -- ex: Septembre 2026
    base_salary NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    gross_salary NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    cnss_salariale NUMERIC(15,2) DEFAULT 0.00,
    cnss_patronale NUMERIC(15,2) DEFAULT 0.00,
    vps_benin NUMERIC(15,2) DEFAULT 0.00,
    net_salary NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'especes',
    expense_id UUID REFERENCES expenses(id) ON DELETE SET NULL,
    paid_by VARCHAR(150),
    paid_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_records_company ON payroll_records(company_id, period);

-- 5. Sécurité RLS stricte sur toutes les tables
ALTER TABLE customer_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    DROP POLICY IF EXISTS "tenant_isolation_customer_repayments" ON customer_repayments;
    CREATE POLICY "tenant_isolation_customer_repayments" ON customer_repayments
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM user_profiles 
            WHERE auth_user_id = auth.uid() OR id = auth.uid()
        )
    );

    DROP POLICY IF EXISTS "tenant_isolation_treasury_transfers" ON treasury_transfers;
    CREATE POLICY "tenant_isolation_treasury_transfers" ON treasury_transfers
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM user_profiles 
            WHERE auth_user_id = auth.uid() OR id = auth.uid()
        )
    );

    DROP POLICY IF EXISTS "tenant_isolation_staff_members" ON staff_members;
    CREATE POLICY "tenant_isolation_staff_members" ON staff_members
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM user_profiles 
            WHERE auth_user_id = auth.uid() OR id = auth.uid()
        )
    );

    DROP POLICY IF EXISTS "tenant_isolation_payroll_records" ON payroll_records;
    CREATE POLICY "tenant_isolation_payroll_records" ON payroll_records
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM user_profiles 
            WHERE auth_user_id = auth.uid() OR id = auth.uid()
        )
    );
END $$;
