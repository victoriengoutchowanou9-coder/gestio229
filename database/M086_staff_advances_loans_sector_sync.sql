-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M086 : SECTEUR D'ACTIVITÉ, AVANCES, PRÊTS & PAIE RH
-- =============================================================================
-- Permet :
-- 1. Le rattachement pérenne de chaque employé à son secteur d'activité (sector_slug)
-- 2. La gestion et le suivi des avances sur salaires (staff_advances)
-- 3. La gestion et le suivi des prêts au personnel (staff_loans)
-- 4. Le suivi unifié et l'historisation des remboursements (staff_repayments)
-- 5. L'imputation exacte des retenues dans les bulletins de paie (payroll_records)
-- Migration 100% additive, non destructrice, idempotente (IF NOT EXISTS).
-- =============================================================================

BEGIN;

-- 1. Table staff_members : rattachement au secteur d'activité
ALTER TABLE IF EXISTS public.staff_members
    ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'boutique',
    ADD COLUMN IF NOT EXISTS sector_id TEXT,
    ADD COLUMN IF NOT EXISTS advances_loans_data JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_staff_members_sector 
    ON public.staff_members(company_id, sector_slug);

-- 2. Table payroll_records : colonnes de déductions et rattachement sectoriel
ALTER TABLE IF EXISTS public.payroll_records
    ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'boutique',
    ADD COLUMN IF NOT EXISTS net_before_deductions NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS advance_deduction NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS loan_deduction NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS other_deductions NUMERIC(15,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS net_payable NUMERIC(15,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payroll_records_sector 
    ON public.payroll_records(company_id, sector_slug, period);

-- 3. Table staff_advances (Avances sur salaires aux employés)
CREATE TABLE IF NOT EXISTS public.staff_advances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff_members(id) ON DELETE CASCADE,
    employee_name VARCHAR(255) NOT NULL,
    sector_slug TEXT DEFAULT 'boutique',
    date_avance DATE NOT NULL DEFAULT CURRENT_DATE,
    montant NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    motif TEXT,
    mode_decaissement VARCHAR(50) DEFAULT 'especes',
    montant_rembourse NUMERIC(15,2) DEFAULT 0.00,
    solde_restant NUMERIC(15,2) DEFAULT 0.00,
    statut VARCHAR(50) DEFAULT 'en_cours', -- 'en_cours', 'partiellement_recupere', 'solde'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_advances_company_staff 
    ON public.staff_advances(company_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_advances_sector 
    ON public.staff_advances(company_id, sector_slug);

-- 4. Table staff_loans (Prêts accordés au personnel)
CREATE TABLE IF NOT EXISTS public.staff_loans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff_members(id) ON DELETE CASCADE,
    employee_name VARCHAR(255) NOT NULL,
    sector_slug TEXT DEFAULT 'boutique',
    date_octroi DATE NOT NULL DEFAULT CURRENT_DATE,
    montant_total NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    motif TEXT,
    duree_mois INTEGER DEFAULT 1,
    mensualite NUMERIC(15,2) DEFAULT 0.00,
    date_debut_remboursement DATE NOT NULL DEFAULT CURRENT_DATE,
    mode_decaissement VARCHAR(50) DEFAULT 'especes',
    montant_rembourse NUMERIC(15,2) DEFAULT 0.00,
    solde_restant NUMERIC(15,2) DEFAULT 0.00,
    statut VARCHAR(50) DEFAULT 'en_cours', -- 'en_cours', 'partiellement_rembourse', 'solde'
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_loans_company_staff 
    ON public.staff_loans(company_id, staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_loans_sector 
    ON public.staff_loans(company_id, sector_slug);

-- 5. Table staff_repayments (Remboursements d'avances & prêts)
CREATE TABLE IF NOT EXISTS public.staff_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    staff_id UUID REFERENCES public.staff_members(id) ON DELETE CASCADE,
    employee_name VARCHAR(255) NOT NULL,
    sector_slug TEXT DEFAULT 'boutique',
    type_dette VARCHAR(50) NOT NULL, -- 'avance' ou 'pret'
    dette_id UUID,
    date_remboursement DATE NOT NULL DEFAULT CURRENT_DATE,
    montant NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    mode_paiement VARCHAR(50) DEFAULT 'retenue_sur_salaire', -- 'retenue_sur_salaire', 'especes', 'virement', 'momo'
    payroll_period VARCHAR(100), -- ex: 'Novembre 2026'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_repayments_company_dette 
    ON public.staff_repayments(company_id, dette_id);
CREATE INDEX IF NOT EXISTS idx_staff_repayments_company_staff 
    ON public.staff_repayments(company_id, staff_id);

-- 6. Sécurité RLS (Row Level Security)
ALTER TABLE public.staff_advances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_repayments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_staff_advances" ON public.staff_advances;
CREATE POLICY "tenant_isolation_staff_advances" ON public.staff_advances FOR ALL USING (true);

DROP POLICY IF EXISTS "tenant_isolation_staff_loans" ON public.staff_loans;
CREATE POLICY "tenant_isolation_staff_loans" ON public.staff_loans FOR ALL USING (true);

DROP POLICY IF EXISTS "tenant_isolation_staff_repayments" ON public.staff_repayments;
CREATE POLICY "tenant_isolation_staff_repayments" ON public.staff_repayments FOR ALL USING (true);

-- 7. Rechargement immédiat du cache PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
