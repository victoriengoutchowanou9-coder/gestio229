-- =============================================================================
-- GESTIO 229 SaaS — Migration M055 (CORRIGÉE IDEMPOTENTE)
-- Système Comptable Professionnel SYSCOHADA Révisé 2018
-- Conforme Acte Uniforme OHADA & Réglementation Fiscale Bénin (UEMOA)
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
    period_code VARCHAR(20) NOT NULL, -- ex: '2026-01', '2026'
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
    journal_code VARCHAR(10) NOT NULL DEFAULT 'OD',
    entry_number VARCHAR(100) NOT NULL DEFAULT 'OD-000001',
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    accounting_period VARCHAR(20) NOT NULL DEFAULT to_char(CURRENT_DATE, 'YYYY-MM'),
    reference VARCHAR(150),
    document_type VARCHAR(50),
    document_id VARCHAR(100),
    description TEXT NOT NULL DEFAULT 'Écriture comptable',
    source_module VARCHAR(50),
    source_id VARCHAR(100),
    status VARCHAR(30) DEFAULT 'valide',
    total_debit NUMERIC(15,2) DEFAULT 0.00,
    total_credit NUMERIC(15,2) DEFAULT 0.00,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    validated_at TIMESTAMPTZ DEFAULT now()
);

-- CRITIQUE : Ajout garanti des colonnes si accounting_entries existait déjà
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS sector_slug TEXT NOT NULL DEFAULT 'boutique';
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS journal_code VARCHAR(10) DEFAULT 'OD';
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS entry_number VARCHAR(100);
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS accounting_period VARCHAR(20) DEFAULT to_char(CURRENT_DATE, 'YYYY-MM');
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS reference VARCHAR(150);
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS document_type VARCHAR(50);
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS document_id VARCHAR(100);
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS description TEXT DEFAULT 'Écriture comptable';
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS source_module VARCHAR(50);
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS source_id VARCHAR(100);
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'valide';
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS total_debit NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS total_credit NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE IF EXISTS accounting_entries ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ DEFAULT now();

-- 4. Table des Lignes d'Écritures Comptables (Partie Double Stricte)
CREATE TABLE IF NOT EXISTS accounting_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID REFERENCES accounting_entries(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    line_number INT NOT NULL DEFAULT 1,
    account_number VARCHAR(50) NOT NULL DEFAULT '471000',
    account_label VARCHAR(255) NOT NULL DEFAULT 'Compte d''attente',
    description TEXT,
    debit NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    credit NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    third_party_id VARCHAR(100),
    third_party_name VARCHAR(255),
    lettering VARCHAR(30),
    tax_code VARCHAR(30),
    tax_rate NUMERIC(5,2) DEFAULT 0.00,
    tax_amount NUMERIC(15,2) DEFAULT 0.00,
    aib_rate NUMERIC(5,2) DEFAULT 0.00,
    aib_amount NUMERIC(15,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- CRITIQUE : Ajout garanti des colonnes si accounting_entry_lines existait déjà
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS sector_slug TEXT NOT NULL DEFAULT 'boutique';
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS entry_id UUID;
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS line_number INT DEFAULT 1;
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS account_number VARCHAR(50);
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS account_label VARCHAR(255);
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS debit NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS credit NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS third_party_id VARCHAR(100);
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS third_party_name VARCHAR(255);
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS lettering VARCHAR(30);
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS tax_code VARCHAR(30);
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5,2) DEFAULT 0.00;
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS aib_rate NUMERIC(5,2) DEFAULT 0.00;
ALTER TABLE IF EXISTS accounting_entry_lines ADD COLUMN IF NOT EXISTS aib_amount NUMERIC(15,2) DEFAULT 0.00;

-- 5. Index pour performances et isolation instantanée
CREATE INDEX IF NOT EXISTS idx_acc_entries_scope ON accounting_entries(company_id, sector_slug, journal_code);
CREATE INDEX IF NOT EXISTS idx_acc_entries_source ON accounting_entries(company_id, source_module, source_id, journal_code);
CREATE INDEX IF NOT EXISTS idx_acc_lines_entry ON accounting_entry_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_acc_lines_account ON accounting_entry_lines(company_id, sector_slug, account_number);

-- 6. Plan comptable SYSCOHADA Révisé 2018
CREATE TABLE IF NOT EXISTS syscohada_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    account_class INT NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, code)
);

-- 7. Activation RLS sécurisée
ALTER TABLE accounting_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE syscohada_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_accounting_entries_tenant ON accounting_entries;
CREATE POLICY p_accounting_entries_tenant ON accounting_entries
    FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid OR auth.jwt() IS NULL);

DROP POLICY IF EXISTS p_accounting_entry_lines_tenant ON accounting_entry_lines;
CREATE POLICY p_accounting_entry_lines_tenant ON accounting_entry_lines
    FOR ALL USING (company_id = (auth.jwt() ->> 'company_id')::uuid OR auth.jwt() IS NULL);
