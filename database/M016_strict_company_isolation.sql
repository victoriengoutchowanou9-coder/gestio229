-- ==============================================================================
-- GESTIO 229 — MIGRATION M016 : Isolation Stricte Multi-Appareils & Multi-Tenants
-- Garantit : 1 compte -> 1 entreprise -> uniquement ses activités et ses données
-- Synchronisation temps réel Supabase company_activities (PC, Téléphone, Tablette)
-- ==============================================================================

-- 1. Table des activités d'entreprise
CREATE TABLE IF NOT EXISTS public.company_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(50) NOT NULL,
    sector_code VARCHAR(50) NOT NULL,
    activity_name VARCHAR(255) NOT NULL,
    pos_location VARCHAR(255) NOT NULL,
    manager_name VARCHAR(150),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDUE', 'ARCHIVEE')),
    is_active BOOLEAN DEFAULT true,
    color VARCHAR(20),
    settings JSONB DEFAULT '{}'::jsonb,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour requêtes instantanées cloisonnées
CREATE INDEX IF NOT EXISTS idx_company_activities_company ON public.company_activities(company_id);
CREATE INDEX IF NOT EXISTS idx_company_activities_sector ON public.company_activities(sector_slug);
CREATE INDEX IF NOT EXISTS idx_company_activities_status ON public.company_activities(status);

-- 2. Activation RLS
ALTER TABLE public.company_activities ENABLE ROW LEVEL SECURITY;

-- 3. Politiques RLS pour company_activities
DROP POLICY IF EXISTS "company_activities_isolation_select" ON public.company_activities;
CREATE POLICY "company_activities_isolation_select" ON public.company_activities
    FOR SELECT USING (
        company_id IN (
            SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid()
        )
        OR company_id IN (
            SELECT id FROM public.companies WHERE LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS "company_activities_isolation_write" ON public.company_activities;
CREATE POLICY "company_activities_isolation_write" ON public.company_activities
    FOR ALL USING (
        company_id IN (
            SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid()
        )
        OR company_id IN (
            SELECT id FROM public.companies WHERE LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
        )
    );
