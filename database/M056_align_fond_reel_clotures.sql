-- =============================================================================
-- GESTIO 229 SaaS — Migration M056 : Alignement Clôtures Caisse (fond_reel_especes, fond_reel_momo)
-- =============================================================================

ALTER TABLE IF EXISTS clotures_caisse ADD COLUMN IF NOT EXISTS fond_reel_especes NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS clotures_caisse ADD COLUMN IF NOT EXISTS fond_reel_momo NUMERIC DEFAULT 0;

-- Mettre à jour les anciennes lignes de clotures_caisse si fond_reel_especes ou fond_reel_momo sont à 0 ou null
UPDATE clotures_caisse
SET fond_reel_especes = COALESCE(fond_reel, fond_especes_apres, especes_cloture, 0)
WHERE fond_reel_especes IS NULL OR fond_reel_especes = 0;

UPDATE clotures_caisse
SET fond_reel_momo = COALESCE(fond_momo_apres, momo_cloture, 0)
WHERE fond_reel_momo IS NULL OR fond_reel_momo = 0;
