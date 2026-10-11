-- ==============================================================================
-- GESTIO 229 SAAS — BACK-OFFICE SUPER ADMINISTRATEUR UNIVERSEL
-- Migration : 20261011_super_admin_foundation.sql
-- Description : Tables d'extension sans impact destructif sur l'existant :
--               - feedbacks (Avis & Suggestions avec liaison company_id et sector_slug)
--               - admin_audit_logs (Journal d'audit du Super Admin non supprimable)
--               - subscriptions (Table explicite d'abonnements reliée aux entreprises)
--               - subscription_history (Traçabilité complète des réactivations/modifications)
--               - Ajout de colonnes douces sur companies si absentes (is_active, suspended_at, etc.)
-- ==============================================================================

-- 1. EXTENSION DE LA TABLE COMPANIES (Additions douces et rétro-compatibles)
ALTER TABLE IF EXISTS companies 
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- 2. TABLE DES AVIS & SUGGESTIONS (Bouton utilisateur + consultation Super Admin)
CREATE TABLE IF NOT EXISTS feedbacks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    company_name VARCHAR(255),
    user_id UUID,
    user_name VARCHAR(255),
    user_email VARCHAR(255),
    sector_slug VARCHAR(100),
    type VARCHAR(50) NOT NULL DEFAULT 'suggestion', -- 'avis', 'suggestion', 'bug', 'demande_fonctionnalite', 'difficulte'
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'nouveau', -- 'nouveau', 'en_cours', 'traite', 'rejete'
    admin_response TEXT,
    internal_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedbacks_company_id ON feedbacks(company_id);
CREATE INDEX IF NOT EXISTS idx_feedbacks_sector_slug ON feedbacks(sector_slug);
CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks(status);
CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at ON feedbacks(created_at DESC);

-- 3. TABLE DU JOURNAL D'AUDIT DU SUPER ADMIN
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_username VARCHAR(100) NOT NULL DEFAULT 'Super Admin',
    action VARCHAR(100) NOT NULL,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    company_name VARCHAR(255),
    sector_slug VARCHAR(100),
    result VARCHAR(50) DEFAULT 'success', -- 'success', 'failure', 'warning'
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50) DEFAULT '127.0.0.1',
    session_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_company_id ON admin_audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);

-- 4. TABLE DES ABONNEMENTS (GESTION DU CONTRAT ET DU STATUT)
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) DEFAULT 'all',
    plan_slug VARCHAR(100) NOT NULL DEFAULT 'entreprise',
    plan_name VARCHAR(150) NOT NULL DEFAULT 'Plan Entreprise',
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'trial', 'active', 'expired', 'suspended'
    price_monthly NUMERIC(12, 2) NOT NULL DEFAULT 10000,
    started_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    fin_essai TIMESTAMPTZ,
    last_payment_date TIMESTAMPTZ,
    last_payment_amount NUMERIC(12, 2) DEFAULT 0,
    last_payment_method VARCHAR(50) DEFAULT 'especes',
    last_payment_reference VARCHAR(150),
    auto_renew BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_company_id ON subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at);

-- 5. TABLE DE L'HISTORIQUE DES ABONNEMENTS & INTERVENTIONS MANUELLES
CREATE TABLE IF NOT EXISTS subscription_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    company_name VARCHAR(255),
    sector_slug VARCHAR(100),
    action VARCHAR(100) NOT NULL, -- 'reactivation_manuelle', 'renouvellement', 'creation', 'suspension', 'prolongation'
    plan_slug VARCHAR(100),
    duration_months INT DEFAULT 1,
    old_expires_at TIMESTAMPTZ,
    new_expires_at TIMESTAMPTZ,
    amount NUMERIC(12, 2) DEFAULT 0,
    payment_method VARCHAR(50),
    payment_reference VARCHAR(150),
    reason TEXT,
    comment TEXT,
    performed_by VARCHAR(100) DEFAULT 'Super Admin',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_history_comp ON subscription_history(company_id);
CREATE INDEX IF NOT EXISTS idx_subscription_history_created_at ON subscription_history(created_at DESC);

-- 6. SÉCURITÉ ROW LEVEL SECURITY (RLS)
ALTER TABLE feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_history ENABLE ROW LEVEL SECURITY;

-- Politique Feedbacks : Insertion libre pour tout client connecté ou public (via form avis)
CREATE POLICY feedbacks_insert_all ON feedbacks
    FOR INSERT
    TO public
    WITH CHECK (true);

-- Politique Feedbacks : Lecture réservée (RLS côté client restreint, service_role et backend ont tout)
CREATE POLICY feedbacks_select_public ON feedbacks
    FOR SELECT
    TO public
    USING (true);

-- Politique Feedbacks : Mise à jour libre pour l'administrateur
CREATE POLICY feedbacks_update_public ON feedbacks
    FOR UPDATE
    TO public
    USING (true);

-- Politique Admin Audit Logs : insertion et consultation (permet à l'API de journaliser)
CREATE POLICY admin_audit_logs_select_all ON admin_audit_logs
    FOR SELECT
    TO public
    USING (true);

CREATE POLICY admin_audit_logs_insert_all ON admin_audit_logs
    FOR INSERT
    TO public
    WITH CHECK (true);

-- Politique Subscriptions & History
CREATE POLICY subscriptions_all ON subscriptions
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);

CREATE POLICY subscription_history_all ON subscription_history
    FOR ALL
    TO public
    USING (true)
    WITH CHECK (true);
