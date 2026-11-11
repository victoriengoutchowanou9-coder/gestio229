-- =============================================================================
-- M084 : FIX DOUBLE COMPTABILISATION LORS DE LA CLÔTURE DE CAISSE
-- =============================================================================
-- PROBLÈME CORRIGÉ :
--   La fonction fn_cloturer_caisse calculait :
--     v_nouveau_fond_esp := v_fond_esp_actuel + v_esp_jour
--   Or, fond_actuel_especes (dans fonds_actuels) CONTIENT DÉJÀ les ventes du jour
--   car chaque vente POS met immédiatement à jour fonds_actuels via enregistrerEntreeCaisse.
--   Résultat : les ventes étaient comptées UNE DEUXIÈME FOIS lors de la clôture.
--
-- CORRECTION :
--   v_nouveau_fond_esp := v_fond_esp_actuel  (fond_actuel contient déjà tout)
--   v_nouveau_fond_momo := v_fond_momo_actuel
--   Le fond réel peut être passé en paramètre (p_fond_reel) pour override.
--
-- RÈGLE COMPTABLE STRICTE :
--   Solde théorique = Fond initial + Encaissements - Dépenses - Retraits
--   La clôture ne fait que :
--   1. Figer le solde actuel comme référence
--   2. Historiser dans clotures_caisse
--   3. Remettre les compteurs journaliers à 0
--   4. Préparer le fond d'ouverture pour le lendemain
-- =============================================================================

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

  -- 1. Lire caisse_journaliere pour la journée (pour historisation uniquement)
  SELECT 
    COALESCE(especes_du_jour, 0),
    COALESCE(momo_du_jour, 0)
  INTO v_esp_jour, v_momo_jour
  FROM caisse_journaliere
  WHERE company_id = p_company_id
    AND (p_secteur_id IS NULL OR secteur_id = p_secteur_id)
    AND date_jour = v_today
  LIMIT 1;

  -- 2. Lire fonds actuels (CONTIENT DÉJÀ les ventes du jour)
  SELECT 
    COALESCE(fond_actuel_especes, 0),
    COALESCE(fond_actuel_momo, 0)
  INTO v_fond_esp_actuel, v_fond_momo_actuel
  FROM fonds_actuels
  WHERE company_id = p_company_id
    AND (p_secteur_id IS NULL OR secteur_id = p_secteur_id)
  LIMIT 1;

  -- 3. CORRECTION ANTI-DOUBLE COMPTABILISATION :
  --    fond_actuel CONTIENT DÉJÀ les ventes du jour (mises à jour en temps réel par POS).
  --    On NE doit PAS rajouter v_esp_jour dessus !
  --    Ancien calcul incorrect (AncienFond + EspJour) SUPPRIMÉ pour préserver le solde réel.
  v_nouveau_fond_esp := v_fond_esp_actuel;
  v_nouveau_fond_momo := v_fond_momo_actuel;

  v_fond_reel := COALESCE(p_fond_reel, v_nouveau_fond_esp);
  v_ecart := v_fond_reel - v_nouveau_fond_esp;

  -- 4. Mettre à jour fonds_actuels (le fond réel laissé en caisse)
  IF p_secteur_id IS NOT NULL THEN
    INSERT INTO fonds_actuels (
      company_id, secteur_id, caisse_id,
      fond_actuel_especes, fond_actuel_momo,
      updated_at
    ) VALUES (
      p_company_id, p_secteur_id, p_caisse_id,
      v_fond_reel, v_nouveau_fond_momo,
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
    v_fond_reel, v_nouveau_fond_momo,
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
    'fond_actuel_especes', v_fond_reel,
    'fond_actuel_momo', v_nouveau_fond_momo,
    'fond_reel', v_fond_reel,
    'ecart', v_ecart
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
