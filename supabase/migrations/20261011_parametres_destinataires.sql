-- =============================================================================
-- GESTIO 229 ERP — Migration : Table des destinataires du Rapport de Caisse
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.parametres_destinataires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nom TEXT,
    actif BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour accélérer la recherche par entreprise et statut actif
CREATE INDEX IF NOT EXISTS idx_param_destinataires_company_actif 
ON public.parametres_destinataires(company_id, actif);

-- Activation de Row Level Security (RLS)
ALTER TABLE public.parametres_destinataires ENABLE ROW LEVEL SECURITY;

-- Politiques de sécurité RLS
DROP POLICY IF EXISTS "Lecture destinataires" ON public.parametres_destinataires;
CREATE POLICY "Lecture destinataires" ON public.parametres_destinataires
    FOR SELECT TO authenticated, anon USING (true);

DROP POLICY IF EXISTS "Modification destinataires" ON public.parametres_destinataires;
CREATE POLICY "Modification destinataires" ON public.parametres_destinataires
    FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);
