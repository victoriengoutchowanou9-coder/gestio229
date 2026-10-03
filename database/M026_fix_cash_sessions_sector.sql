-- ==============================================================================
-- M026 : FIX BUG CAISSE - cash_sessions.sector_slug manquant
-- Problème : La table cash_sessions n'a pas de colonne sector_slug,
--            donc getActiveCaisse ne peut pas filtrer par secteur dessus.
-- Solution : Ajouter sector_slug + cashier_name (pour l'affichage ouvert_par)
--            et migrer les sessions existantes vers 'boutique' par défaut.
-- ==============================================================================

-- 1. Ajouter sector_slug et cashier_name à cash_sessions
ALTER TABLE public.cash_sessions
    ADD COLUMN IF NOT EXISTS sector_slug    VARCHAR(100) DEFAULT 'boutique',
    ADD COLUMN IF NOT EXISTS cashier_name   VARCHAR(255);

-- 2. Rétro-remplir sector_slug pour les sessions existantes depuis closing_notes
-- Pattern : [SECTOR:boutique] dans closing_notes
UPDATE public.cash_sessions
SET sector_slug = REGEXP_REPLACE(closing_notes, '.*\[SECTOR:([a-z0-9_-]+)\].*', '\1')
WHERE closing_notes ~ '\[SECTOR:[a-z0-9_-]+\]'
  AND (sector_slug IS NULL OR sector_slug = 'boutique');

-- 3. Valeur par défaut 'boutique' pour toutes les sessions sans sector_slug
UPDATE public.cash_sessions
SET sector_slug = 'boutique'
WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';

-- 4. Index pour les requêtes getActiveCaisse : (company_id, sector_slug, status, closed_at)
CREATE INDEX IF NOT EXISTS idx_cash_sessions_company_sector_status
    ON public.cash_sessions(company_id, sector_slug, status)
    WHERE closed_at IS NULL;

-- 5. Ajouter opening_momo si absent (utilisé dans handleOpenCaisse)
ALTER TABLE public.cash_sessions
    ADD COLUMN IF NOT EXISTS opening_momo   NUMERIC(15,2) DEFAULT 0.00;

-- 6. Reload du schema cache PostgREST
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- FIN M026
-- Colonnes ajoutées à cash_sessions : sector_slug, cashier_name, opening_momo
-- ==============================================================================
