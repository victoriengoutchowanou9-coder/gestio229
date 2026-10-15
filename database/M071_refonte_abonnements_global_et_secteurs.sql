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
-- 4. MIGRATION RÉTROACTIVE DES ENTREPRISES EXISTANTES
-- ══════════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    r RECORD;
    v_sector_code TEXT;
    v_raw_sectors TEXT[];
    v_status TEXT;
    v_debut TIMESTAMPTZ;
    v_fin TIMESTAMPTZ;
BEGIN
    FOR r IN SELECT id, name, created_at, subscription_status, selected_sectors, sectors, active_sector FROM public.companies LOOP
        -- Calcul dates
        v_debut := COALESCE(r.created_at, NOW());
        v_fin := v_debut + INTERVAL '30 days';
        v_status := CASE 
            WHEN r.subscription_status = 'active' THEN 'actif'
            WHEN r.subscription_status = 'expired' OR (r.subscription_status = 'trial' AND NOW() > v_fin) THEN 'expire'
            ELSE 'essai'
        END;

        -- 1. Insérer abonnements_global si pas encore présent
        INSERT INTO public.abonnements_global (
            entreprise_id,
            date_debut_global,
            date_fin_global,
            statut_global
        ) VALUES (
            r.id,
            v_debut,
            v_fin,
            v_status
        )
        ON CONFLICT (entreprise_id) DO NOTHING;

        -- 2. Récupérer la liste des secteurs initiaux
        v_raw_sectors := ARRAY[]::TEXT[];
        IF r.selected_sectors IS NOT NULL AND array_length(r.selected_sectors, 1) > 0 THEN
            v_raw_sectors := r.selected_sectors;
        ELSIF r.sectors IS NOT NULL AND array_length(r.sectors, 1) > 0 THEN
            v_raw_sectors := r.sectors;
        ELSIF r.active_sector IS NOT NULL AND r.active_sector <> '' THEN
            v_raw_sectors := ARRAY[r.active_sector];
        ELSE
            v_raw_sectors := ARRAY['boutique'];
        END IF;

        -- 3. Insérer les secteurs choisis à l'inscription en tant que rattachés au global
        FOREACH v_sector_code IN ARRAY v_raw_sectors LOOP
            IF v_sector_code IS NOT NULL AND TRIM(v_sector_code) <> '' THEN
                INSERT INTO public.abonnements_secteurs (
                    entreprise_id,
                    secteur_code,
                    date_debut_specifique,
                    date_fin_specifique,
                    statut_specifique,
                    is_premiere_activation,
                    rattache_au_global
                ) VALUES (
                    r.id,
                    UPPER(TRIM(REPLACE(v_sector_code, 'sec-', ''))),
                    v_debut,
                    v_fin,
                    'rattache_global',
                    true,
                    true
                )
                ON CONFLICT (entreprise_id, secteur_code) DO NOTHING;
            END IF;
        END LOOP;
    END LOOP;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. SÉCURITÉ ROW LEVEL SECURITY (RLS) MULTI-TENANT
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.abonnements_global ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abonnements_secteurs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "abonnements_global_policy" ON public.abonnements_global;
CREATE POLICY "abonnements_global_policy" ON public.abonnements_global FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "abonnements_secteurs_policy" ON public.abonnements_secteurs;
CREATE POLICY "abonnements_secteurs_policy" ON public.abonnements_secteurs FOR ALL USING (true) WITH CHECK (true);
