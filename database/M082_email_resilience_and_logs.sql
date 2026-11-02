-- =============================================================================
-- GESTIO 229 ERP — Migration M082 : Résilience Email & Traçabilité des Clôtures
-- Journalisation des livraisons emails, statuts et audit de clôture
-- =============================================================================

-- 1. Table de traçabilité des livraisons d'emails (Audit Trail)
CREATE TABLE IF NOT EXISTS public.email_delivery_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email VARCHAR(255) NOT NULL,
    email_type VARCHAR(50) NOT NULL, -- 'cash_report', 'test_email', 'signup_confirmation', 'resend_confirmation', 'alert'
    status VARCHAR(50) NOT NULL,     -- 'demande', 'envoye', 'refuse', 'echec'
    provider VARCHAR(50) NOT NULL,   -- 'resend_api', 'brevo_api', 'smtp_gmail_465', 'smtp_gmail_587'
    subject VARCHAR(255),
    error_message TEXT,
    ip_address VARCHAR(50),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour accélérer la recherche par destinataire, statut et chronologie
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_email ON public.email_delivery_logs(recipient_email);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_status ON public.email_delivery_logs(status);
CREATE INDEX IF NOT EXISTS idx_email_delivery_logs_created_at ON public.email_delivery_logs(created_at DESC);

-- RLS pour email_delivery_logs
ALTER TABLE public.email_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "email_delivery_logs_admin_read" ON public.email_delivery_logs;
CREATE POLICY "email_delivery_logs_admin_read" ON public.email_delivery_logs
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "email_delivery_logs_service_write" ON public.email_delivery_logs;
CREATE POLICY "email_delivery_logs_service_write" ON public.email_delivery_logs
    FOR ALL TO authenticated, anon
    USING (true)
    WITH CHECK (true);

-- 2. Colonnes de suivi email sur la table clotures_caisse
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clotures_caisse' AND column_name = 'email_status') THEN
        ALTER TABLE public.clotures_caisse ADD COLUMN email_status VARCHAR(50) DEFAULT 'EN_ATTENTE';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clotures_caisse' AND column_name = 'email_sent_at') THEN
        ALTER TABLE public.clotures_caisse ADD COLUMN email_sent_at TIMESTAMPTZ;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clotures_caisse' AND column_name = 'email_recipients') THEN
        ALTER TABLE public.clotures_caisse ADD COLUMN email_recipients TEXT[];
    END IF;
END $$;
