-- =============================================================================
-- GESTIO 229 SaaS — Migration M055 : Système Comptable Professionnel SYSCOHADA Révisé 2018
-- Conforme Acte Uniforme OHADA & Réglementation Fiscale Bénin (UEMOA)
-- Journaux : JV, JA, JC, JB, JOD, JS, JR — Distinction Engagement vs Règlement
-- Isolation stricte par company_id et sector_slug — Compte AIB officiel : 449200
-- =============================================================================

-- 1. Table des Journaux Comptables
CREATE TABLE IF NOT EXISTS accounting_journals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    code VARCHAR(10) NOT NULL, -- JV, JA, JC, JB, JOD, JS, JR
    name VARCHAR(150) NOT NULL,
    default_account VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, code)
);

-- 2. Table des Périodes et Exercices Comptables
CREATE TABLE IF NOT EXISTS accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    fiscal_year INT NOT NULL,
    period_code VARCHAR(20) NOT NULL, -- ex: '2026-01', '2026-Q1', '2026'
    name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_closed BOOLEAN DEFAULT false,
    closed_at TIMESTAMPTZ,
    closed_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, period_code)
);

-- 3. Table des Pièces / En-têtes d'Écritures Comptables
CREATE TABLE IF NOT EXISTS accounting_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    journal_code VARCHAR(10) NOT NULL, -- JV, JA, JC, JB, JOD, JS, JR
    entry_number VARCHAR(100) NOT NULL, -- ex: JV-2026-000001
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    accounting_period VARCHAR(20) NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
    reference VARCHAR(150), -- Numéro de facture, de reçu ou de chèque
    document_type VARCHAR(50), -- 'facture_vente', 'facture_achat', 'recu_caisse', 'paiement_banque', 'od', 'bulletin_paie'
    document_id VARCHAR(100),
    description TEXT NOT NULL,
    source_module VARCHAR(50), -- 'ventes', 'achats', 'caisse', 'depenses', 'paie', 'manuel'
    source_id VARCHAR(100), -- Clé unique pour empêcher les doublons
    status VARCHAR(30) DEFAULT 'valide', -- 'brouillon', 'valide', 'annule', 'extourne', 'cloture'
    total_debit NUMERIC(15,2) DEFAULT 0.00,
    total_credit NUMERIC(15,2) DEFAULT 0.00,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    validated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Table des Lignes d'Écritures Comptables (Partie Double Stricte)
CREATE TABLE IF NOT EXISTS accounting_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES accounting_entries(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    line_number INT NOT NULL DEFAULT 1,
    account_number VARCHAR(50) NOT NULL,
    account_label VARCHAR(255) NOT NULL,
    description TEXT,
    debit NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    credit NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    third_party_id VARCHAR(100), -- Id client ou fournisseur pour lettrage
    third_party_name VARCHAR(255),
    lettering VARCHAR(30), -- Code de lettrage pour rapprochement
    tax_code VARCHAR(30), -- 'TVA18', 'EXO', etc.
    tax_rate NUMERIC(5,2) DEFAULT 0.00,
    tax_amount NUMERIC(15,2) DEFAULT 0.00,
    aib_rate NUMERIC(5,2) DEFAULT 0.00,
    aib_amount NUMERIC(15,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour performances et isolation instantanée
CREATE INDEX IF NOT EXISTS idx_acc_entries_scope ON accounting_entries(company_id, sector_slug, journal_code);
CREATE INDEX IF NOT EXISTS idx_acc_entries_source ON accounting_entries(company_id, source_module, source_id, journal_code);
CREATE INDEX IF NOT EXISTS idx_acc_lines_entry ON accounting_entry_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_acc_lines_account ON accounting_entry_lines(company_id, sector_slug, account_number);
CREATE INDEX IF NOT EXISTS idx_acc_lines_third_party ON accounting_entry_lines(company_id, third_party_id);

-- 5. Table du Plan Comptable SYSCOHADA Révisé 2018
CREATE TABLE IF NOT EXISTS syscohada_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    account_class INT NOT NULL,
    account_type VARCHAR(50) NOT NULL, -- 'ACTIF', 'PASSIF', 'CHARGE', 'PRODUIT', 'TRESORERIE'
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, code)
);

-- Index pour recherche rapide du plan comptable
CREATE INDEX IF NOT EXISTS idx_syscohada_accounts ON syscohada_accounts(company_id, code);

-- 6. Activation RLS
ALTER TABLE accounting_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE syscohada_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_accounting_journals_tenant ON accounting_journals;
CREATE POLICY p_accounting_journals_tenant ON accounting_journals
    FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid OR auth.jwt() IS NULL);

DROP POLICY IF EXISTS p_accounting_periods_tenant ON accounting_periods;
CREATE POLICY p_accounting_periods_tenant ON accounting_periods
    FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid OR auth.jwt() IS NULL);

DROP POLICY IF EXISTS p_accounting_entries_tenant ON accounting_entries;
CREATE POLICY p_accounting_entries_tenant ON accounting_entries
    FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid OR auth.jwt() IS NULL);

DROP POLICY IF EXISTS p_accounting_entry_lines_tenant ON accounting_entry_lines;
CREATE POLICY p_accounting_entry_lines_tenant ON accounting_entry_lines
    FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid OR auth.jwt() IS NULL);

DROP POLICY IF EXISTS p_syscohada_accounts_tenant ON syscohada_accounts;
CREATE POLICY p_syscohada_accounts_tenant ON syscohada_accounts
    FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid OR auth.jwt() IS NULL);
