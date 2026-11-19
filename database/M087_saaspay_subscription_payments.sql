-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M087 : SAAS PAY INTEGRATION & AUTOMATIC PAYMENTS
-- =============================================================================
-- Table dédiée au suivi des sessions, transactions et webhooks SaaS Pay
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.saaspay_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    checkout_session_id VARCHAR(255) UNIQUE,
    transaction_reference VARCHAR(255) UNIQUE NOT NULL,
    amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'XOF',
    sector_slug VARCHAR(100) DEFAULT 'all',
    sectors_covered JSONB DEFAULT '[]'::jsonb,
    duration_months INTEGER DEFAULT 1,
    plan_slug VARCHAR(100) DEFAULT 'entreprise',
    payer_email VARCHAR(255),
    payer_name VARCHAR(255),
    payer_phone VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'successful', 'failed', 'cancelled'
    payment_method VARCHAR(100) DEFAULT 'saas_pay',
    payment_operator VARCHAR(100),
    checkout_url TEXT,
    raw_session_data JSONB DEFAULT '{}'::jsonb,
    raw_webhook_data JSONB DEFAULT '{}'::jsonb,
    subscription_extended_until TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saaspay_company 
    ON public.saaspay_transactions(company_id, status);
CREATE INDEX IF NOT EXISTS idx_saaspay_reference 
    ON public.saaspay_transactions(transaction_reference);
CREATE INDEX IF NOT EXISTS idx_saaspay_session 
    ON public.saaspay_transactions(checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_saaspay_status_created 
    ON public.saaspay_transactions(status, created_at DESC);

-- Sécurité RLS (Row Level Security)
ALTER TABLE public.saaspay_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_saaspay_transactions" ON public.saaspay_transactions;
CREATE POLICY "tenant_isolation_saaspay_transactions" ON public.saaspay_transactions
    FOR ALL TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- Rechargement immédiat du cache PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
