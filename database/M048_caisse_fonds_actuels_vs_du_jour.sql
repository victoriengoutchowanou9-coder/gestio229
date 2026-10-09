-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M048 : MODULE CAISSE TOUS SECTEURS
-- RÈGLE MÉTIER OFFICIELLE : FOND ACTUEL (CUMULÉ) vs DU JOUR (OPÉRATIONS EN COURS)
-- =============================================================================
-- 1. Espèces du jour = vente espèces du jour + remboursement espèces
--    Momo du jour = vente Momo du jour + Remboursement Momo du jour
-- 2. Tout encaissement reste dans DU JOUR tant que la caisse n'est pas clôturée
-- 3. C'est APRÈS clôture que DU JOUR est transféré dans FOND ACTUEL et remis à 0
-- 4. Le Fond Actuel sert à alimenter la trésorerie (retraits déduits du Fond Actuel)
-- 5. Les dépenses sont déduites du Fond Actuel selon le mode. Découvert négatif autorisé.
-- =============================================================================

-- 1. TABLES FOND ACTUEL ET COMPTEURS JOURNALIERS
CREATE TABLE IF NOT EXISTS fonds_actuels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL,
  caisse_id UUID,
  fond_initial_especes NUMERIC DEFAULT 0,
  fond_initial_momo NUMERIC DEFAULT 0,
  fond_actuel_especes NUMERIC DEFAULT 0,
  fond_actuel_momo NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assurer colonnes si la table existait déjà
ALTER TABLE fonds_actuels ADD COLUMN IF NOT EXISTS fond_initial_especes NUMERIC DEFAULT 0;
ALTER TABLE fonds_actuels ADD COLUMN IF NOT EXISTS fond_initial_momo NUMERIC DEFAULT 0;
ALTER TABLE fonds_actuels ADD COLUMN IF NOT EXISTS fond_actuel_especes NUMERIC DEFAULT 0;
ALTER TABLE fonds_actuels ADD COLUMN IF NOT EXISTS fond_actuel_momo NUMERIC DEFAULT 0;
ALTER TABLE fonds_actuels ADD COLUMN IF NOT EXISTS caisse_id UUID;
ALTER TABLE fonds_actuels ADD COLUMN IF NOT EXISTS secteur_id UUID;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'fonds_actuels' AND column_name = 'type_fond') THEN
    ALTER TABLE fonds_actuels ALTER COLUMN type_fond DROP NOT NULL;
  END IF;
  BEGIN
    ALTER TABLE fonds_actuels ADD CONSTRAINT uq_fonds_actuels_company_secteur_caisse UNIQUE (company_id, secteur_id, caisse_id);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN
    NULL;
  END;
END $$;

-- 2. Caisse journalière (compteurs du jour avant clôture)
CREATE TABLE IF NOT EXISTS caisse_journaliere (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL,
  caisse_id UUID,
  date_jour DATE DEFAULT CURRENT_DATE,
  especes_du_jour NUMERIC DEFAULT 0,
  momo_du_jour NUMERIC DEFAULT 0,
  ventes_especes_du_jour NUMERIC DEFAULT 0,
  ventes_momo_du_jour NUMERIC DEFAULT 0,
  remboursements_especes_du_jour NUMERIC DEFAULT 0,
  remboursements_momo_du_jour NUMERIC DEFAULT 0,
  nb_ventes INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
  BEGIN
    ALTER TABLE caisse_journaliere ADD CONSTRAINT uq_caisse_journaliere_unique UNIQUE (company_id, secteur_id, caisse_id, date_jour);
  EXCEPTION WHEN duplicate_table OR duplicate_object THEN
    NULL;
  END;
END $$;

-- 3. Historique clôtures
CREATE TABLE IF NOT EXISTS clotures_caisse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL,
  caisse_id UUID,
  date_cloture DATE DEFAULT CURRENT_DATE,
  especes_cloture NUMERIC DEFAULT 0,
  momo_cloture NUMERIC DEFAULT 0,
  fond_especes_avant NUMERIC DEFAULT 0,
  fond_momo_avant NUMERIC DEFAULT 0,
  fond_especes_apres NUMERIC DEFAULT 0,
  fond_momo_apres NUMERIC DEFAULT 0,
  cloture_par UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Demandes de retrait pour alimentation trésorerie
CREATE TABLE IF NOT EXISTS demandes_retrait (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL,
  caisse_id UUID,
  mode_paiement TEXT NOT NULL,
  montant NUMERIC NOT NULL,
  motif TEXT,
  statut TEXT DEFAULT 'en_attente', -- en_attente, valide, rejete
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_at TIMESTAMPTZ,
  validated_by UUID
);

-- Index d'isolation multi-secteurs
CREATE INDEX IF NOT EXISTS idx_fonds_actuels_iso ON fonds_actuels(company_id, secteur_id);
CREATE INDEX IF NOT EXISTS idx_caisse_jour_iso ON caisse_journaliere(company_id, secteur_id, date_jour);
CREATE INDEX IF NOT EXISTS idx_clotures_caisse_iso ON clotures_caisse(company_id, secteur_id, date_cloture);
CREATE INDEX IF NOT EXISTS idx_demandes_retrait_iso ON demandes_retrait(company_id, secteur_id, statut);

-- 5. RLS POLICIES
ALTER TABLE fonds_actuels ENABLE ROW LEVEL SECURITY;
ALTER TABLE caisse_journaliere ENABLE ROW LEVEL SECURITY;
ALTER TABLE clotures_caisse ENABLE ROW LEVEL SECURITY;
ALTER TABLE demandes_retrait ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "allow_all_fonds_actuels" ON fonds_actuels;
CREATE POLICY "allow_all_fonds_actuels" ON fonds_actuels FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_caisse_jour" ON caisse_journaliere;
CREATE POLICY "allow_all_caisse_jour" ON caisse_journaliere FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_clotures_caisse" ON clotures_caisse;
CREATE POLICY "allow_all_clotures_caisse" ON clotures_caisse FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_demandes_retrait" ON demandes_retrait;
CREATE POLICY "allow_all_demandes_retrait" ON demandes_retrait FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 6. TRIGGER VENTES : INCRÉMENTE CAISSE DU JOUR (PAS FOND ACTUEL)
CREATE OR REPLACE FUNCTION fn_add_vente_caisse_jour()
RETURNS TRIGGER AS $$
DECLARE
  v_rec JSONB;
  v_company_id UUID;
  v_secteur_id UUID;
  v_caisse_id UUID;
  v_montant NUMERIC;
  v_mode TEXT;
BEGIN
  v_rec := to_jsonb(NEW);
  v_company_id := (v_rec->>'company_id')::UUID;
  IF v_rec ? 'secteur_id' AND v_rec->>'secteur_id' IS NOT NULL THEN
    v_secteur_id := (v_rec->>'secteur_id')::UUID;
  END IF;
  IF v_rec ? 'caisse_id' AND v_rec->>'caisse_id' IS NOT NULL THEN
    v_caisse_id := (v_rec->>'caisse_id')::UUID;
  END IF;

  v_montant := COALESCE(
    (v_rec->>'total_amount')::NUMERIC,
    (v_rec->>'total_ttc')::NUMERIC,
    0
  );
  v_mode := LOWER(COALESCE(
    v_rec->>'payment_method',
    v_rec->>'mode_paiement',
    v_rec->>'payment_status',
    'especes'
  ));

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Déterminer secteur si non fourni
  IF v_secteur_id IS NULL THEN
    SELECT id INTO v_secteur_id FROM secteurs WHERE company_id = v_company_id LIMIT 1;
  END IF;

  IF v_secteur_id IS NOT NULL THEN
    INSERT INTO caisse_journaliere (
      company_id, secteur_id, caisse_id, date_jour,
      especes_du_jour, momo_du_jour,
      ventes_especes_du_jour, ventes_momo_du_jour,
      nb_ventes
    ) VALUES (
      v_company_id, v_secteur_id, v_caisse_id, CURRENT_DATE,
      CASE WHEN v_mode IN ('especes','cash') THEN v_montant ELSE 0 END,
      CASE WHEN v_mode IN ('momo','mtn','moov','mtn_momo','flooz','wave') THEN v_montant ELSE 0 END,
      CASE WHEN v_mode IN ('especes','cash') THEN v_montant ELSE 0 END,
      CASE WHEN v_mode IN ('momo','mtn','moov','mtn_momo','flooz','wave') THEN v_montant ELSE 0 END,
      1
    )
    ON CONFLICT (company_id, secteur_id, caisse_id, date_jour) DO UPDATE SET
      especes_du_jour = caisse_journaliere.especes_du_jour + CASE WHEN v_mode IN ('especes','cash') THEN v_montant ELSE 0 END,
      momo_du_jour = caisse_journaliere.momo_du_jour + CASE WHEN v_mode IN ('momo','mtn','moov','mtn_momo','flooz','wave') THEN v_montant ELSE 0 END,
      ventes_especes_du_jour = caisse_journaliere.ventes_especes_du_jour + CASE WHEN v_mode IN ('especes','cash') THEN v_montant ELSE 0 END,
      ventes_momo_du_jour = caisse_journaliere.ventes_momo_du_jour + CASE WHEN v_mode IN ('momo','mtn','moov','mtn_momo','flooz','wave') THEN v_montant ELSE 0 END,
      nb_ventes = caisse_journaliere.nb_ventes + 1,
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_vente_to_caisse_jour ON sales_orders;
CREATE TRIGGER trg_vente_to_caisse_jour
  AFTER INSERT ON sales_orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_add_vente_caisse_jour();

-- 7. FONCTION CLÔTURE CAISSE : TRANSFERT DU JOUR VERS FOND ACTUEL ET RESET
CREATE OR REPLACE FUNCTION fn_cloturer_caisse(
  p_company_id UUID,
  p_secteur_id UUID,
  p_caisse_id UUID,
  p_user_id UUID
) RETURNS JSON AS $$
DECLARE
  v_jour RECORD;
  v_fond RECORD;
  v_especes NUMERIC := 0;
  v_momo NUMERIC := 0;
  v_fond_esp_avant NUMERIC := 0;
  v_fond_momo_avant NUMERIC := 0;
BEGIN
  -- 1. Initialiser la ligne de fond actuel si elle n'existe pas encore
  INSERT INTO fonds_actuels (
    company_id, secteur_id, caisse_id,
    fond_initial_especes, fond_initial_momo,
    fond_actuel_especes, fond_actuel_momo
  ) VALUES (
    p_company_id, p_secteur_id, p_caisse_id,
    0, 0, 0, 0
  )
  ON CONFLICT (company_id, secteur_id, caisse_id) DO NOTHING;

  SELECT * INTO v_fond FROM fonds_actuels
  WHERE company_id = p_company_id AND secteur_id = p_secteur_id
    AND (caisse_id = p_caisse_id OR (caisse_id IS NULL AND p_caisse_id IS NULL) OR p_caisse_id IS NULL)
  LIMIT 1;

  IF FOUND THEN
    v_fond_esp_avant := COALESCE(v_fond.fond_actuel_especes, 0);
    v_fond_momo_avant := COALESCE(v_fond.fond_actuel_momo, 0);
  END IF;

  -- 2. Lire les compteurs du jour
  SELECT * INTO v_jour FROM caisse_journaliere
  WHERE company_id = p_company_id AND secteur_id = p_secteur_id
    AND (caisse_id = p_caisse_id OR (caisse_id IS NULL AND p_caisse_id IS NULL) OR p_caisse_id IS NULL)
    AND date_jour = CURRENT_DATE
  LIMIT 1;

  IF FOUND THEN
    v_especes := COALESCE(v_jour.especes_du_jour, 0);
    v_momo := COALESCE(v_jour.momo_du_jour, 0);
  END IF;

  -- 3. Transférer dans le fond actuel (coffre fort cumulé)
  UPDATE fonds_actuels SET
    fond_actuel_especes = COALESCE(fond_actuel_especes, 0) + v_especes,
    fond_actuel_momo = COALESCE(fond_actuel_momo, 0) + v_momo,
    updated_at = NOW()
  WHERE company_id = p_company_id AND secteur_id = p_secteur_id
    AND (caisse_id = p_caisse_id OR (caisse_id IS NULL AND p_caisse_id IS NULL) OR p_caisse_id IS NULL);

  -- 4. Historiser la clôture
  INSERT INTO clotures_caisse (
    company_id, secteur_id, caisse_id, date_cloture,
    especes_cloture, momo_cloture,
    fond_especes_avant, fond_momo_avant,
    fond_especes_apres, fond_momo_apres,
    cloture_par
  ) VALUES (
    p_company_id, p_secteur_id, p_caisse_id, CURRENT_DATE,
    v_especes, v_momo,
    v_fond_esp_avant, v_fond_momo_avant,
    v_fond_esp_avant + v_especes, v_fond_momo_avant + v_momo,
    p_user_id
  );

  -- 5. Remettre du jour à 0 pour reprendre les opérations
  UPDATE caisse_journaliere SET
    especes_du_jour = 0,
    momo_du_jour = 0,
    ventes_especes_du_jour = 0,
    ventes_momo_du_jour = 0,
    remboursements_especes_du_jour = 0,
    remboursements_momo_du_jour = 0,
    nb_ventes = 0,
    updated_at = NOW()
  WHERE company_id = p_company_id AND secteur_id = p_secteur_id
    AND (caisse_id = p_caisse_id OR (caisse_id IS NULL AND p_caisse_id IS NULL) OR p_caisse_id IS NULL)
    AND date_jour = CURRENT_DATE;

  RETURN json_build_object(
    'success', true,
    'especes', v_especes,
    'momo', v_momo,
    'fond_especes_apres', v_fond_esp_avant + v_especes,
    'fond_momo_apres', v_fond_momo_avant + v_momo
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. TRIGGER DÉPENSES : DÉDUIT DU FOND ACTUEL (NÉGATIF AUTORISÉ)
CREATE OR REPLACE FUNCTION fn_add_depense_fond()
RETURNS TRIGGER AS $$
DECLARE
  v_rec JSONB;
  v_company_id UUID;
  v_secteur_id UUID;
  v_caisse_id UUID;
  v_montant NUMERIC;
  v_mode TEXT;
BEGIN
  v_rec := to_jsonb(NEW);
  v_company_id := (v_rec->>'company_id')::UUID;
  IF v_rec ? 'secteur_id' AND v_rec->>'secteur_id' IS NOT NULL THEN
    v_secteur_id := (v_rec->>'secteur_id')::UUID;
  END IF;
  IF v_rec ? 'caisse_id' AND v_rec->>'caisse_id' IS NOT NULL THEN
    v_caisse_id := (v_rec->>'caisse_id')::UUID;
  END IF;
  v_montant := COALESCE((v_rec->>'montant')::NUMERIC, (v_rec->>'amount')::NUMERIC, 0);
  v_mode := LOWER(COALESCE(v_rec->>'mode_paiement', v_rec->>'payment_method', 'especes'));

  IF v_company_id IS NULL OR v_montant = 0 THEN
    RETURN NEW;
  END IF;

  IF v_secteur_id IS NULL THEN
    SELECT id INTO v_secteur_id FROM secteurs WHERE company_id = v_company_id LIMIT 1;
  END IF;

  IF v_secteur_id IS NOT NULL THEN
    -- Assurer existence de la ligne fonds_actuels
    INSERT INTO fonds_actuels (
      company_id, secteur_id, caisse_id,
      fond_initial_especes, fond_initial_momo,
      fond_actuel_especes, fond_actuel_momo
    ) VALUES (
      v_company_id, v_secteur_id, v_caisse_id,
      0, 0, 0, 0
    )
    ON CONFLICT (company_id, secteur_id, caisse_id) DO NOTHING;

    -- Déduction : Négatif autorisé en cas de découvert
    IF v_mode IN ('especes', 'espece', 'cash') THEN
      UPDATE fonds_actuels
      SET fond_actuel_especes = COALESCE(fond_actuel_especes, 0) - v_montant,
          updated_at = NOW()
      WHERE company_id = v_company_id AND secteur_id = v_secteur_id
        AND (caisse_id = v_caisse_id OR (caisse_id IS NULL AND v_caisse_id IS NULL) OR v_caisse_id IS NULL);
    ELSE
      UPDATE fonds_actuels
      SET fond_actuel_momo = COALESCE(fond_actuel_momo, 0) - v_montant,
          updated_at = NOW()
      WHERE company_id = v_company_id AND secteur_id = v_secteur_id
        AND (caisse_id = v_caisse_id OR (caisse_id IS NULL AND v_caisse_id IS NULL) OR v_caisse_id IS NULL);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_depense_to_fond ON depenses;
CREATE TRIGGER trg_depense_to_fond
  AFTER INSERT ON depenses
  FOR EACH ROW
  EXECUTE FUNCTION fn_add_depense_fond();

-- 9. TRIGGER RETRAITS VALIDÉS : DÉDUIT DU FOND ACTUEL (ALIMENTATION TRÉSORERIE)
CREATE OR REPLACE FUNCTION fn_retrait_valide_fond()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.statut IN ('valide', 'APPROVED') AND (OLD.statut IS NULL OR OLD.statut NOT IN ('valide', 'APPROVED')) THEN
    INSERT INTO fonds_actuels (
      company_id, secteur_id, caisse_id,
      fond_initial_especes, fond_initial_momo,
      fond_actuel_especes, fond_actuel_momo
    ) VALUES (
      NEW.company_id, NEW.secteur_id, NEW.caisse_id,
      0, 0, 0, 0
    )
    ON CONFLICT (company_id, secteur_id, caisse_id) DO NOTHING;

    IF LOWER(COALESCE(NEW.mode_paiement, '')) IN ('especes', 'cash') THEN
      UPDATE fonds_actuels
      SET fond_actuel_especes = COALESCE(fond_actuel_especes, 0) - NEW.montant,
          updated_at = NOW()
      WHERE company_id = NEW.company_id AND secteur_id = NEW.secteur_id
        AND (caisse_id = NEW.caisse_id OR (caisse_id IS NULL AND NEW.caisse_id IS NULL) OR NEW.caisse_id IS NULL);
    ELSE
      UPDATE fonds_actuels
      SET fond_actuel_momo = COALESCE(fond_actuel_momo, 0) - NEW.montant,
          updated_at = NOW()
      WHERE company_id = NEW.company_id AND secteur_id = NEW.secteur_id
        AND (caisse_id = NEW.caisse_id OR (caisse_id IS NULL AND NEW.caisse_id IS NULL) OR NEW.caisse_id IS NULL);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_retrait_to_fond ON demandes_retrait;
CREATE TRIGGER trg_retrait_to_fond
  AFTER UPDATE ON demandes_retrait
  FOR EACH ROW
  EXECUTE FUNCTION fn_retrait_valide_fond();
