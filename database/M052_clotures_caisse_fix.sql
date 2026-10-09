-- =============================================================================
-- GESTIO 229 ERP — Migration M052 : Correction Critique Clôture Caisse Tous Secteurs
-- Résolution du bug z.from(...).insert(...).catch is not a function
-- =============================================================================

-- 1. Table clotures_caisse : Création / Alignement complet des colonnes
CREATE TABLE IF NOT EXISTS clotures_caisse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID,
  caisse_id UUID,
  date_cloture DATE DEFAULT CURRENT_DATE,
  especes_cloture NUMERIC DEFAULT 0,
  momo_cloture NUMERIC DEFAULT 0,
  fond_especes_avant NUMERIC DEFAULT 0,
  fond_momo_avant NUMERIC DEFAULT 0,
  fond_especes_apres NUMERIC DEFAULT 0,
  fond_momo_apres NUMERIC DEFAULT 0,
  fond_initial NUMERIC DEFAULT 0,
  total_entrees NUMERIC DEFAULT 0,
  total_sorties NUMERIC DEFAULT 0,
  fond_theorique NUMERIC DEFAULT 0,
  fond_reel NUMERIC DEFAULT 0,
  ecart NUMERIC DEFAULT 0,
  commentaire TEXT,
  created_by UUID,
  cloture_par UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assouplir les contraintes pour éviter les blocages sur secteur_id optionnel
ALTER TABLE clotures_caisse ALTER COLUMN secteur_id DROP NOT NULL;

-- Ajout des colonnes demandées si elles manquent
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS fond_initial NUMERIC DEFAULT 0;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS total_entrees NUMERIC DEFAULT 0;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS total_sorties NUMERIC DEFAULT 0;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS fond_theorique NUMERIC DEFAULT 0;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS fond_reel NUMERIC DEFAULT 0;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS ecart NUMERIC DEFAULT 0;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS commentaire TEXT;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS cloture_par UUID;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS especes_cloture NUMERIC DEFAULT 0;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS momo_cloture NUMERIC DEFAULT 0;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS fond_especes_avant NUMERIC DEFAULT 0;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS fond_momo_avant NUMERIC DEFAULT 0;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS fond_especes_apres NUMERIC DEFAULT 0;
ALTER TABLE clotures_caisse ADD COLUMN IF NOT EXISTS fond_momo_apres NUMERIC DEFAULT 0;

-- 2. Index pour optimisation des requêtes
CREATE INDEX IF NOT EXISTS idx_clotures_caisse_comp ON clotures_caisse(company_id, date_cloture DESC);
CREATE INDEX IF NOT EXISTS idx_clotures_caisse_sec ON clotures_caisse(company_id, secteur_id, date_cloture DESC);

-- 3. Politiques RLS permissives (allow_all) pour authentifiés et anonymes
ALTER TABLE clotures_caisse ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_clotures_caisse" ON clotures_caisse;
CREATE POLICY "allow_all_clotures_caisse" ON clotures_caisse FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_clotures_caisse" ON clotures_caisse;
CREATE POLICY "allow_anon_clotures_caisse" ON clotures_caisse FOR ALL TO anon USING (true) WITH CHECK (true);

-- Vérifier également fonds_actuels et caisse_journaliere
ALTER TABLE fonds_actuels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_fonds_actuels" ON fonds_actuels;
CREATE POLICY "allow_all_fonds_actuels" ON fonds_actuels FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_fonds_actuels" ON fonds_actuels;
CREATE POLICY "allow_anon_fonds_actuels" ON fonds_actuels FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE caisse_journaliere ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_caisse_jour" ON caisse_journaliere;
CREATE POLICY "allow_all_caisse_jour" ON caisse_journaliere FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "allow_anon_caisse_jour" ON caisse_journaliere;
CREATE POLICY "allow_anon_caisse_jour" ON caisse_journaliere FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Fonction RPC PostgreSQL optimisée pour clôture immédiate et sans faille
CREATE OR REPLACE FUNCTION fn_cloturer_caisse(
  p_company_id UUID,
  p_secteur_id UUID DEFAULT NULL,
  p_caisse_id UUID DEFAULT NULL,
  p_user_id UUID DEFAULT NULL,
  p_fond_reel NUMERIC DEFAULT NULL,
  p_commentaire TEXT DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_today DATE;
  v_esp_jour NUMERIC := 0;
  v_momo_jour NUMERIC := 0;
  v_fond_esp_actuel NUMERIC := 0;
  v_fond_momo_actuel NUMERIC := 0;
  v_nouveau_fond_esp NUMERIC := 0;
  v_nouveau_fond_momo NUMERIC := 0;
  v_cloture_id UUID;
  v_fond_reel NUMERIC;
  v_ecart NUMERIC := 0;
BEGIN
  v_today := CURRENT_DATE;

  -- 1. Lire caisse_journaliere pour la journée
  SELECT 
    COALESCE(especes_du_jour, 0),
    COALESCE(momo_du_jour, 0)
  INTO v_esp_jour, v_momo_jour
  FROM caisse_journaliere
  WHERE company_id = p_company_id
    AND (p_secteur_id IS NULL OR secteur_id = p_secteur_id)
    AND date_jour = v_today
  LIMIT 1;

  -- 2. Lire fonds actuels
  SELECT 
    COALESCE(fond_actuel_especes, 0),
    COALESCE(fond_actuel_momo, 0)
  INTO v_fond_esp_actuel, v_fond_momo_actuel
  FROM fonds_actuels
  WHERE company_id = p_company_id
    AND (p_secteur_id IS NULL OR secteur_id = p_secteur_id)
  LIMIT 1;

  -- 3. Nouveaux fonds = Anciens fonds + Du jour
  v_nouveau_fond_esp := v_fond_esp_actuel + v_esp_jour;
  v_nouveau_fond_momo := v_fond_momo_actuel + v_momo_jour;

  v_fond_reel := COALESCE(p_fond_reel, v_nouveau_fond_esp);
  v_ecart := v_fond_reel - v_nouveau_fond_esp;

  -- 4. Mettre à jour fonds_actuels
  IF p_secteur_id IS NOT NULL THEN
    INSERT INTO fonds_actuels (
      company_id, secteur_id, caisse_id,
      fond_actuel_especes, fond_actuel_momo,
      updated_at
    ) VALUES (
      p_company_id, p_secteur_id, p_caisse_id,
      v_nouveau_fond_esp, v_nouveau_fond_momo,
      NOW()
    )
    ON CONFLICT (company_id, secteur_id)
    DO UPDATE SET
      fond_actuel_especes = EXCLUDED.fond_actuel_especes,
      fond_actuel_momo = EXCLUDED.fond_actuel_momo,
      updated_at = NOW();
  END IF;

  -- 5. Historiser dans clotures_caisse
  INSERT INTO clotures_caisse (
    company_id, secteur_id, caisse_id,
    date_cloture,
    especes_cloture, momo_cloture,
    fond_especes_avant, fond_momo_avant,
    fond_especes_apres, fond_momo_apres,
    fond_theorique, fond_reel, ecart,
    total_entrees, total_sorties,
    commentaire, created_by, cloture_par
  ) VALUES (
    p_company_id, p_secteur_id, p_caisse_id,
    v_today,
    v_esp_jour, v_momo_jour,
    v_fond_esp_actuel, v_fond_momo_actuel,
    v_nouveau_fond_esp, v_nouveau_fond_momo,
    v_nouveau_fond_esp, v_fond_reel, v_ecart,
    v_esp_jour, 0,
    COALESCE(p_commentaire, 'Clôture de caisse effectuée'),
    p_user_id, p_user_id
  ) RETURNING id INTO v_cloture_id;

  -- 6. Remettre à 0 les compteurs du jour
  UPDATE caisse_journaliere
  SET 
    especes_du_jour = 0,
    momo_du_jour = 0,
    ventes_especes_du_jour = 0,
    ventes_momo_du_jour = 0,
    remboursements_especes_du_jour = 0,
    remboursements_momo_du_jour = 0,
    nb_ventes = 0,
    updated_at = NOW()
  WHERE company_id = p_company_id
    AND (p_secteur_id IS NULL OR secteur_id = p_secteur_id)
    AND date_jour = v_today;

  RETURN json_build_object(
    'success', true,
    'cloture_id', v_cloture_id,
    'especes', v_esp_jour,
    'momo', v_momo_jour,
    'fond_actuel_especes', v_nouveau_fond_esp,
    'fond_actuel_momo', v_nouveau_fond_momo,
    'fond_reel', v_fond_reel,
    'ecart', v_ecart
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
