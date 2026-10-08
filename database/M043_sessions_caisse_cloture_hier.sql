-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M043 : SESSIONS DE CAISSE & CLÔTURE ANTERIEURE
-- MODULE CAISSE MULTI-SECTEURS (Brasseire, Quincaillerie, etc.)
-- =============================================================================

-- 1. Table sessions_caisse
CREATE TABLE IF NOT EXISTS public.sessions_caisse (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL, -- BRASSERIE, etc.
  caisse_id UUID NOT NULL,
  date_ouverture DATE NOT NULL DEFAULT CURRENT_DATE,
  heure_ouverture TIMESTAMPTZ DEFAULT NOW(),
  date_cloture DATE,
  heure_cloture TIMESTAMPTZ,
  statut TEXT CHECK (statut IN ('ouverte', 'fermée', 'fermee', 'cloturée', 'cloturee')) DEFAULT 'ouverte',
  ouvert_par UUID,
  ouvert_par_nom TEXT,
  ferme_par UUID,
  ferme_par_nom TEXT,
  solde_ouverture_espece NUMERIC DEFAULT 0,
  solde_ouverture_momo NUMERIC DEFAULT 0,
  solde_cloture_espece NUMERIC,
  solde_cloture_momo NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, secteur_id, caisse_id, date_ouverture) -- 1 session par jour par caisse
);

CREATE INDEX IF NOT EXISTS idx_sessions_caisse_statut 
  ON public.sessions_caisse(company_id, secteur_id, caisse_id, statut, date_ouverture);

-- RLS sur sessions_caisse
ALTER TABLE public.sessions_caisse ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_sessions_caisse" ON public.sessions_caisse;
CREATE POLICY "allow_all_sessions_caisse" ON public.sessions_caisse 
  FOR ALL TO authenticated, anon USING (true) WITH CHECK (true);

-- Synchronisation des contraintes sur caisse_sessions existante si présente
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'caisse_sessions') THEN
    ALTER TABLE public.caisse_sessions DROP CONSTRAINT IF EXISTS caisse_sessions_statut_check;
    ALTER TABLE public.caisse_sessions ADD CONSTRAINT caisse_sessions_statut_check 
      CHECK (statut IN ('ouverte', 'open', 'fermée', 'fermee', 'cloturée', 'cloturee', 'closed'));
  END IF;
END $$;

-- 2. FONCTION SQL : fn_cloturer_caisse_hier
DROP FUNCTION IF EXISTS fn_cloturer_caisse_hier(UUID, UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION fn_cloturer_caisse_hier(
  p_company_id UUID,
  p_secteur_id UUID,
  p_caisse_id UUID,
  p_user_id UUID
) RETURNS JSON AS $$
DECLARE
  v_session RECORD;
  v_solde_espece NUMERIC := 0;
  v_solde_momo NUMERIC := 0;
  v_found_id UUID := NULL;
  v_date_ouv DATE := NULL;
BEGIN
  -- 1. Chercher dans sessions_caisse la session antérieure ouverte
  SELECT * INTO v_session FROM sessions_caisse
  WHERE company_id = p_company_id
    AND (secteur_id = p_secteur_id OR secteur_id IS NULL)
    AND caisse_id = p_caisse_id
    AND statut = 'ouverte'
    AND date_ouverture < CURRENT_DATE
  ORDER BY date_ouverture DESC LIMIT 1;

  IF v_session IS NOT NULL THEN
    v_found_id := v_session.id;
    v_date_ouv := v_session.date_ouverture;
  END IF;

  -- 2. Fallback dans caisse_sessions si non trouvé
  IF v_found_id IS NULL AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'caisse_sessions') THEN
    SELECT id, (date_ouverture::date) INTO v_found_id, v_date_ouv FROM caisse_sessions
    WHERE company_id = p_company_id
      AND caisse_id = p_caisse_id
      AND (statut = 'ouverte' OR statut = 'open')
      AND (date_ouverture::date) < CURRENT_DATE
    ORDER BY date_ouverture DESC LIMIT 1;
  END IF;

  IF v_found_id IS NULL THEN
    RETURN json_build_object('success', false, 'message', 'Aucune session antérieure ouverte trouvée');
  END IF;

  -- Récupérer soldes actuels de cette caisse depuis fonds_actuels si disponible
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fonds_actuels') THEN
    SELECT COALESCE(solde_actuel, 0) INTO v_solde_espece FROM fonds_actuels 
    WHERE company_id = p_company_id AND (secteur_id = p_secteur_id OR secteur_id IS NULL) 
      AND (caisse_id = p_caisse_id OR caisse_id IS NULL) AND type_fond = 'espece'
    LIMIT 1;

    SELECT COALESCE(solde_actuel, 0) INTO v_solde_momo FROM fonds_actuels 
    WHERE company_id = p_company_id AND (secteur_id = p_secteur_id OR secteur_id IS NULL) 
      AND (caisse_id = p_caisse_id OR caisse_id IS NULL) AND type_fond = 'mtn_momo'
    LIMIT 1;
  END IF;

  IF v_solde_espece IS NULL THEN v_solde_espece := 0; END IF;
  IF v_solde_momo IS NULL THEN v_solde_momo := 0; END IF;

  -- FERMER dans sessions_caisse
  UPDATE sessions_caisse SET
    statut = 'fermée',
    date_cloture = CURRENT_DATE,
    heure_cloture = NOW(),
    ferme_par = p_user_id,
    solde_cloture_espece = COALESCE(v_solde_espece, 0),
    solde_cloture_momo = COALESCE(v_solde_momo, 0),
    updated_at = NOW()
  WHERE company_id = p_company_id AND caisse_id = p_caisse_id AND statut = 'ouverte' AND date_ouverture < CURRENT_DATE;

  -- FERMER également dans caisse_sessions (synchro bilatérale)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'caisse_sessions') THEN
    UPDATE caisse_sessions SET
      statut = 'fermée',
      date_fermeture = NOW(),
      ferme_par = p_user_id,
      fond_actuel_especes = COALESCE(v_solde_espece, 0),
      fond_actuel_momo = COALESCE(v_solde_momo, 0),
      updated_at = NOW()
    WHERE company_id = p_company_id AND caisse_id = p_caisse_id AND (statut = 'ouverte' OR statut = 'open') AND (date_ouverture::date) < CURRENT_DATE;
  END IF;

  -- FERMER dans la table caisses
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'caisses') THEN
    UPDATE caisses SET
      statut = 'fermee',
      date_fermeture = NOW(),
      updated_at = NOW()
    WHERE id = p_caisse_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'session_id', v_found_id,
    'date_cloturee', COALESCE(v_date_ouv, CURRENT_DATE - 1),
    'solde_espece', v_solde_espece,
    'solde_momo', v_solde_momo
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. FONCTION SQL : fn_ouvrir_caisse_jour
DROP FUNCTION IF EXISTS fn_ouvrir_caisse_jour(UUID, UUID, UUID, UUID);

CREATE OR REPLACE FUNCTION fn_ouvrir_caisse_jour(
  p_company_id UUID,
  p_secteur_id UUID,
  p_caisse_id UUID,
  p_user_id UUID
) RETURNS JSON AS $$
DECLARE
  v_exist UUID;
  v_new_id UUID;
BEGIN
  -- Vérifier qu'il n'y a plus de session antérieure ouverte
  SELECT id INTO v_exist FROM sessions_caisse 
  WHERE company_id = p_company_id AND secteur_id = p_secteur_id AND caisse_id = p_caisse_id 
    AND statut = 'ouverte' AND date_ouverture < CURRENT_DATE 
  LIMIT 1;

  IF v_exist IS NOT NULL THEN 
    RETURN json_build_object('success', false, 'message', 'Clôturez d''abord la session antérieure'); 
  END IF;

  -- Vérifier session du jour existe déjà
  SELECT id INTO v_exist FROM sessions_caisse 
  WHERE company_id = p_company_id AND secteur_id = p_secteur_id AND caisse_id = p_caisse_id 
    AND date_ouverture = CURRENT_DATE 
  LIMIT 1;

  IF v_exist IS NOT NULL THEN 
    RETURN json_build_object('success', false, 'message', 'Caisse du jour déjà ouverte'); 
  END IF;

  INSERT INTO sessions_caisse (company_id, secteur_id, caisse_id, date_ouverture, statut, ouvert_par) 
  VALUES (p_company_id, p_secteur_id, p_caisse_id, CURRENT_DATE, 'ouverte', p_user_id)
  RETURNING id INTO v_new_id;

  -- Synchroniser la table caisses
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'caisses') THEN
    UPDATE caisses SET
      statut = 'ouverte',
      date_ouverture = NOW(),
      date_fermeture = NULL,
      ouvert_par = p_user_id,
      updated_at = NOW()
    WHERE id = p_caisse_id;
  END IF;

  RETURN json_build_object('success', true, 'session_id', v_new_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
