-- =============================================================================
-- GESTIO 229 SaaS — Migration M075 : Gestion et Contrôle d'Accès des Entreprises
-- Super Administrateur Back-Office : Blocage, Déblocage, Suppression Logique & Restauration
-- =============================================================================

-- 1. Ajout des colonnes d'audit et de cycle de vie sur la table public.companies
ALTER TABLE public.companies
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- 2. Indexation pour filtrage rapide par statut d'accès
CREATE INDEX IF NOT EXISTS idx_companies_subscription_status ON public.companies(subscription_status);
CREATE INDEX IF NOT EXISTS idx_companies_active_status ON public.companies(is_active, subscription_status);

-- 3. Mise à jour de la table admin_audit_logs pour s'assurer que les colonnes nécessaires existent
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_username VARCHAR(100) DEFAULT 'Super Admin',
    action VARCHAR(100) NOT NULL,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    company_name VARCHAR(255),
    sector_slug VARCHAR(100),
    result VARCHAR(50) DEFAULT 'success',
    details JSONB DEFAULT '{}'::jsonb,
    ip_address VARCHAR(50),
    session_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_company ON public.admin_audit_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action ON public.admin_audit_logs(action, created_at DESC);
