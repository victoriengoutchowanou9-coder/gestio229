-- ==============================================================================
-- M028 : REFONTE MODULE CLIENTS & CRÉANCES (ADDITIF UNIQUEMENT)
-- Tables : client_debts, debt_payments
-- Colonnes cash_sessions : cash_especes, cash_momo, total_remboursements
-- RLS ouvertes et rechargement de schéma PostgREST
-- ==============================================================================

-- 1. Table public.client_debts si inexistante
CREATE TABLE IF NOT EXISTS public.client_debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    sector_code TEXT NOT NULL,
    client_id UUID NOT NULL,
    total_dette NUMERIC DEFAULT 0,
    total_rembourse NUMERIC DEFAULT 0,
    solde_du NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'en_cours',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour accélérer les requêtes par client et statut
CREATE INDEX IF NOT EXISTS idx_client_debts_lookup
    ON public.client_debts (company_id, sector_code, client_id, status);

-- 2. Table public.debt_payments si inexistante
CREATE TABLE IF NOT EXISTS public.debt_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    sector_code TEXT NOT NULL,
    debt_id UUID REFERENCES public.client_debts(id) ON DELETE CASCADE,
    client_id UUID NOT NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL,
    payment_date TIMESTAMPTZ DEFAULT now(),
    cash_session_id UUID,
    reste_apres NUMERIC DEFAULT 0,
    reference TEXT,
    notes TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_debt_payments_lookup
    ON public.debt_payments (company_id, sector_code, client_id, debt_id);

-- 3. Colonnes sur public.cash_sessions si absentes
ALTER TABLE public.cash_sessions
    ADD COLUMN IF NOT EXISTS cash_especes NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS cash_momo NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_remboursements NUMERIC DEFAULT 0;

-- 4. Activer RLS sans toucher aux autres tables
ALTER TABLE public.client_debts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "client_debts_all_policy" ON public.client_debts;
CREATE POLICY "client_debts_all_policy" ON public.client_debts FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.debt_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "debt_payments_all_policy" ON public.debt_payments;
CREATE POLICY "debt_payments_all_policy" ON public.debt_payments FOR ALL USING (true) WITH CHECK (true);

-- 5. Notification de rechargement du schéma
NOTIFY pgrst, 'reload schema';
