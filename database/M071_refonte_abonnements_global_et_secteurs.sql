-- =============================================================================
-- GESTIO 229 SaaS — Migration M071 : Refonte Finale Abonnement Global + Secteurs
-- Architecture Multi-Tenant isolée par entreprise_id / companies(id)
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. TABLE ABONNEMENTS_GLOBAL (Obligatoire pour chaque entreprise)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.abonnements_global (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    date_debut_global TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date_fin_global TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    statut_global VARCHAR(30) NOT NULL DEFAULT 'essai', -- 'essai', 'actif', 'expire'
    plan_code VARCHAR(50) DEFAULT 'entreprise',
    montant_mensuel_fcfa NUMERIC(12,2) DEFAULT 10000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_abonnements_global_entreprise UNIQUE (entreprise_id)
);

CREATE INDEX IF NOT EXISTS idx_abonnements_global_ent ON public.abonnements_global(entreprise_id);
CREATE INDEX IF NOT EXISTS idx_abonnements_global_statut ON public.abonnements_global(statut_global, date_fin_global);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. TABLE ABONNEMENTS_SECTEURS (Liaison spécifique par secteur d'activité)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.abonnements_secteurs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    secteur_code VARCHAR(100) NOT NULL, -- Ex: 'TRANSPORT_LOGISTIQUE', 'BRASSERIE', 'RESTAURANT', etc.
    date_debut_specifique TIMESTAMPTZ,
    date_fin_specifique TIMESTAMPTZ,
    statut_specifique VARCHAR(30) NOT NULL DEFAULT 'essai_individuel', -- 'essai_individuel', 'rattache_global', 'expire'
    is_premiere_activation BOOLEAN DEFAULT true,
    rattache_au_global BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_abonnements_secteurs_ent_sec UNIQUE (entreprise_id, secteur_code)
);

CREATE INDEX IF NOT EXISTS idx_abonnements_secteurs_ent ON public.abonnements_secteurs(entreprise_id, secteur_code);
CREATE INDEX IF NOT EXISTS idx_abonnements_secteurs_rattache ON public.abonnements_secteurs(rattache_au_global, statut_specifique);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. FONCTION DE CRON : BASCULE AUTOMATIQUE DES ESSAIS INDIVIDUELS TERMINÉS
-- ══════════════════════════════════════════════════════════════════════════════
-- Si date_fin_specifique < NOW() ET statut = 'essai_individuel' :
--   - statut_specifique = 'rattache_global'
--   - rattache_au_global = true
--   - date_debut_specifique = NULL (il prend désormais les dates du global)
CREATE OR REPLACE FUNCTION public.fn_sync_abonnements_secteurs_fin_essai()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rows_affected INTEGER := 0;
BEGIN
    UPDATE public.abonnements_secteurs
    SET statut_specifique = 'rattache_global',
        rattache_au_global = true,
        date_debut_specifique = NULL,
        updated_at = NOW()
    WHERE statut_specifique = 'essai_individuel'
      AND date_fin_specifique IS NOT NULL
      AND date_fin_specifique < NOW();

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RETURN v_rows_affected;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. MIGRATION RÉTROACTIVE DES ENTREPRISES EXISTANTES (Compatible JSONB & Tableaux)
-- ══════════════════════════════════════════════════════════════════════════════

-- 4.1. Insérer l'abonnement global pour chaque entreprise existante
INSERT INTO public.abonnements_global (
    entreprise_id,
    date_debut_global,
    date_fin_global,
    statut_global
)
SELECT
    c.id,
    COALESCE(c.created_at, NOW()),
    COALESCE(c.created_at, NOW()) + INTERVAL '30 days',
    CASE 
        WHEN c.subscription_status = 'active' THEN 'actif'
        WHEN c.subscription_status = 'expired' OR (c.subscription_status = 'trial' AND NOW() > (COALESCE(c.created_at, NOW()) + INTERVAL '30 days')) THEN 'expire'
        ELSE 'essai'
    END
FROM public.companies c
ON CONFLICT (entreprise_id) DO NOTHING;

-- 4.2. Insérer les secteurs initiaux depuis companies.selected_sectors (JSONB/Array/Text)
INSERT INTO public.abonnements_secteurs (
    entreprise_id,
    secteur_code,
    date_debut_specifique,
    date_fin_specifique,
    statut_specifique,
    is_premiere_activation,
    rattache_au_global
)
SELECT DISTINCT
    c.id AS entreprise_id,
    UPPER(TRIM(REPLACE(slug_raw, 'sec-', ''))) AS secteur_code,
    COALESCE(c.created_at, NOW()) AS date_debut_specifique,
    COALESCE(c.created_at, NOW()) + INTERVAL '30 days' AS date_fin_specifique,
    'rattache_global' AS statut_specifique,
    true AS is_premiere_activation,
    true AS rattache_au_global
FROM public.companies c,
LATERAL (
    SELECT jsonb_array_elements_text(
        CASE
            WHEN c.selected_sectors IS NOT NULL 
                 AND jsonb_typeof(to_jsonb(c.selected_sectors)) = 'array' 
                 AND jsonb_array_length(to_jsonb(c.selected_sectors)) > 0
                THEN to_jsonb(c.selected_sectors)
            WHEN c.sectors IS NOT NULL 
                 AND jsonb_typeof(to_jsonb(c.sectors)) = 'array' 
                 AND jsonb_array_length(to_jsonb(c.sectors)) > 0
                THEN to_jsonb(c.sectors)
            WHEN c.active_sector IS NOT NULL AND c.active_sector <> ''
                THEN jsonb_build_array(c.active_sector)
            ELSE '["boutique"]'::jsonb
        END
    ) AS slug_raw
) sub
WHERE slug_raw IS NOT NULL AND TRIM(slug_raw) <> ''
ON CONFLICT (entreprise_id, secteur_code) DO NOTHING;

-- 4.3. Rallier également tout secteur déjà actif dans company_activities
INSERT INTO public.abonnements_secteurs (
    entreprise_id,
    secteur_code,
    date_debut_specifique,
    date_fin_specifique,
    statut_specifique,
    is_premiere_activation,
    rattache_au_global
)
SELECT DISTINCT
    ca.company_id AS entreprise_id,
    UPPER(TRIM(REPLACE(ca.sector_slug, 'sec-', ''))) AS secteur_code,
    COALESCE(ca.created_at, NOW()) AS date_debut_specifique,
    COALESCE(ca.created_at, NOW()) + INTERVAL '30 days' AS date_fin_specifique,
    'rattache_global' AS statut_specifique,
    true AS is_premiere_activation,
    true AS rattache_au_global
FROM public.company_activities ca
WHERE ca.sector_slug IS NOT NULL AND TRIM(ca.sector_slug) <> ''
ON CONFLICT (entreprise_id, secteur_code) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. SÉCURITÉ ROW LEVEL SECURITY (RLS) MULTI-TENANT
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.abonnements_global ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abonnements_secteurs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "abonnements_global_policy" ON public.abonnements_global;
CREATE POLICY "abonnements_global_policy" ON public.abonnements_global FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "abonnements_secteurs_policy" ON public.abonnements_secteurs;
CREATE POLICY "abonnements_secteurs_policy" ON public.abonnements_secteurs FOR ALL USING (true) WITH CHECK (true);
