-- ==============================================================================
-- GESTIO 229 ERP — MIGRATION M081 : UNICITÉ EMAIL, JOURNALISATION EMAILS & STABILISATION SECTEURS
-- ==============================================================================

-- 1. Index d'unicité stricte sur l'email des entreprises (comptes principaux)
-- Empêche qu'une même adresse email soit enregistrée deux fois pour des entreprises différentes
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_email_lower_unique
ON public.companies(LOWER(TRIM(email)))
WHERE email IS NOT NULL AND TRIM(email) <> '';

-- 2. Index d'unicité sur l'email des profils administrateurs principaux
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_admin_email_unique
ON public.user_profiles(LOWER(TRIM(email)))
WHERE role = 'administrateur' AND email IS NOT NULL AND TRIM(email) <> '';

-- 3. Table de traçabilité et journalisation des envois d'emails (Audit Trail)
CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email VARCHAR(255) NOT NULL,
    email_type VARCHAR(50) NOT NULL, -- 'signup_confirmation', 'resend_confirmation', 'test_email', 'alert'
    status VARCHAR(50) NOT NULL,     -- 'demande', 'envoye', 'refuse', 'echec'
    provider VARCHAR(50) NOT NULL,   -- 'smtp_gmail', 'supabase_auth'
    subject VARCHAR(255),
    error_message TEXT,
    ip_address VARCHAR(50),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_email ON public.email_delivery_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_status ON public.email_delivery_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_created_at ON public.email_delivery_logs(created_at DESC);

-- Politiques RLS pour email_delivery_logs
ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_delivery_logs_admin_read" ON public.email_delivery_logs;
CREATE POLICY "email_delivery_logs_admin_read" ON public.email_delivery_logs
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_profiles
            WHERE auth_user_id = auth.uid()
            AND role IN ('administrateur', 'super_admin')
        )
    );

DROP POLICY IF EXISTS "email_delivery_logs_service_write" ON public.email_delivery_logs;
CREATE POLICY "email_delivery_logs_service_write" ON public.email_delivery_logs
    FOR ALL TO public
    USING (true)
    WITH CHECK (true);
