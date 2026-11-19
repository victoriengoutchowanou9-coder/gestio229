-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M088 : ALIGNEMENT DES COLONNES SECTEUR USER_PROFILES
-- =============================================================================
-- Résolution définitive de l'erreur :
-- "Could not find the 'sector_id' column of 'user_profiles' in the schema cache"
-- =============================================================================

BEGIN;

-- 1. Ajout sécurisé et idempotent des colonnes sector_slug et sector_id sur user_profiles
ALTER TABLE public.user_profiles 
    ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'boutique',
    ADD COLUMN IF NOT EXISTS sector_id TEXT DEFAULT 'boutique';

-- 2. Initialisation des valeurs pour les profils existants
UPDATE public.user_profiles
SET 
    sector_slug = COALESCE(
        NULLIF(TRIM(sector_slug), ''),
        NULLIF(TRIM(permissions->>'sector_slug'), ''),
        NULLIF(TRIM(permissions->>'sector'), ''),
        NULLIF(TRIM(permissions->>'sector_id'), ''),
        'boutique'
    ),
    sector_id = COALESCE(
        NULLIF(TRIM(sector_id), ''),
        NULLIF(TRIM(permissions->>'sector_id'), ''),
        NULLIF(TRIM(permissions->>'sector_slug'), ''),
        NULLIF(TRIM(permissions->>'sector'), ''),
        'boutique'
    )
WHERE sector_slug IS NULL OR sector_id IS NULL OR sector_slug = '' OR sector_id = '';

-- 3. Indexation pour l'isolation multi-tenant & multi-secteurs
CREATE INDEX IF NOT EXISTS idx_user_profiles_company_sector_slug 
    ON public.user_profiles(company_id, sector_slug);

CREATE INDEX IF NOT EXISTS idx_user_profiles_company_sector_id 
    ON public.user_profiles(company_id, sector_id);

-- 4. Rechargement immédiat du cache de schéma PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
