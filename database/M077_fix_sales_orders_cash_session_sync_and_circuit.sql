-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M077 (2026-10-24)
-- CORRECTION CRITIQUE DU CIRCUIT VENTE ET CAISSE :
--   1. Synchronisation automatique et rétroactive de public.caisse_sessions
--      vers public.cash_sessions pour respecter la contrainte de clé étrangère
--      sales_orders_cash_session_id_fkey sans jamais la supprimer.
--   2. Synchronisation des colonnes stock_vente et stock_magasin avec
--      sector_meta sur public.products.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. BACKFILL RÉTROACTIF DE TOUTES LES SESSIONS DE CAISSE EXISTANTES
-- Garantit que toute session présente dans public.caisse_sessions possède son
-- enregistrement exact (même UUID) dans public.cash_sessions.
-- -----------------------------------------------------------------------------
INSERT INTO public.cash_sessions (
  id,
  company_id,
  cashier_id,
  opened_at,
  closed_at,
  opening_cash,
  opening_momo,
  status,
  closing_notes
)
SELECT
  cs.id,
  cs.company_id,
  cs.ouvert_par_id,
  COALESCE(cs.date_ouverture, cs.created_at, NOW()),
  cs.date_fermeture,
  COALESCE(cs.fond_ouverture_especes, 0),
  COALESCE(cs.fond_actuel_momo, 0),
  CASE
    WHEN cs.statut IN ('ouverte', 'open') AND cs.date_fermeture IS NULL THEN 'ouverte'
    ELSE 'fermee'
  END,
  COALESCE(
    cs.observations,
    '[SECTOR:' || COALESCE(cs.sector_slug, cs.secteur_slug, 'boutique') || '][CAISSE:' || COALESCE(cs.caisse_id::text, '') || ']'
  )
FROM public.caisse_sessions cs
WHERE cs.company_id IS NOT NULL
ON CONFLICT (id) DO UPDATE
SET
  closed_at = EXCLUDED.closed_at,
  status = EXCLUDED.status;

-- -----------------------------------------------------------------------------
-- 2. TRIGGER DE SYNCHRONISATION AUTOMATIQUE caisse_sessions -> cash_sessions
-- Toute ouverture ou fermeture dans caisse_sessions maintient cash_sessions
-- synchronisé en temps réel au niveau PostgreSQL.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_sync_caisse_session_to_cash_sessions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NOT NULL THEN
    INSERT INTO public.cash_sessions (
      id,
      company_id,
      cashier_id,
      opened_at,
      closed_at,
      opening_cash,
      opening_momo,
      status,
      closing_notes
    )
    VALUES (
      NEW.id,
      NEW.company_id,
      NEW.ouvert_par_id,
      COALESCE(NEW.date_ouverture, NEW.created_at, NOW()),
      NEW.date_fermeture,
      COALESCE(NEW.fond_ouverture_especes, 0),
      COALESCE(NEW.fond_actuel_momo, 0),
      CASE
        WHEN NEW.statut IN ('ouverte', 'open') AND NEW.date_fermeture IS NULL THEN 'ouverte'
        ELSE 'fermee'
      END,
      COALESCE(
        NEW.observations,
        '[SECTOR:' || COALESCE(NEW.sector_slug, NEW.secteur_slug, 'boutique') || '][CAISSE:' || COALESCE(NEW.caisse_id::text, '') || ']'
      )
    )
    ON CONFLICT (id) DO UPDATE
    SET
      closed_at = EXCLUDED.closed_at,
      status = EXCLUDED.status,
      closing_notes = COALESCE(EXCLUDED.closing_notes, public.cash_sessions.closing_notes);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_caisse_session_to_cash_sessions ON public.caisse_sessions;
CREATE TRIGGER trg_sync_caisse_session_to_cash_sessions
AFTER INSERT OR UPDATE ON public.caisse_sessions
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_caisse_session_to_cash_sessions();

-- -----------------------------------------------------------------------------
-- 3. HARMONISATION DES COLONNES stock_vente ET stock_magasin SUR products
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.products
  ADD COLUMN IF NOT EXISTS stock_vente NUMERIC(15,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_magasin NUMERIC(15,3) DEFAULT 0;

UPDATE public.products
SET
  stock_vente = COALESCE(
    stock_vente,
    NULLIF(sector_meta->>'stock_vente', '')::numeric,
    0
  ),
  stock_magasin = COALESCE(
    stock_magasin,
    NULLIF(sector_meta->>'stock_magasin', '')::numeric,
    0
  )
WHERE sector_meta IS NOT NULL;

COMMIT;
