-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M041 : MODULE CAISSE / DÉPENSES MULTI-SECTEURS
-- RÈGLE MÉTIER OFFICIELLE : DÉCOUVERT AUTORISÉ & RÉAJUSTEMENT AUTOMATIQUE
-- =============================================================================

-- 1. Secteurs / Sous-logiciels du HUB
CREATE TABLE IF NOT EXISTS secteurs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  nom TEXT NOT NULL,
  slug TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, slug)
);

-- 2. Fonds actuels par secteur + par caisse + par mode
DROP TABLE IF EXISTS fonds_actuels CASCADE;
CREATE TABLE fonds_actuels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL REFERENCES secteurs(id) ON DELETE CASCADE,
  caisse_id UUID,
  type_fond TEXT NOT NULL CHECK (type_fond IN ('espece','mtn_momo','moov','banque','orange_money')),
  solde_actuel NUMERIC DEFAULT 0, -- CRITIQUE : PAS DE CHECK >=0, NÉGATIF AUTORISÉ
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, secteur_id, caisse_id, type_fond)
);

-- 3. Dépenses tout secteur
DROP TABLE IF EXISTS depenses CASCADE;
CREATE TABLE depenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL REFERENCES secteurs(id) ON DELETE CASCADE,
  caisse_id UUID,
  categorie TEXT NOT NULL,
  description TEXT,
  montant NUMERIC NOT NULL CHECK (montant > 0),
  mode_paiement TEXT NOT NULL CHECK (mode_paiement IN ('espece','mtn_momo','moov','banque','orange_money')),
  date_depense DATE DEFAULT CURRENT_DATE,
  fond_avant NUMERIC,
  fond_apres NUMERIC,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_depenses_secteur_caisse ON depenses(company_id, secteur_id, caisse_id);

-- 4. Mouvements trésorerie pour audit
CREATE TABLE IF NOT EXISTS mouvements_tresorerie (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  secteur_id UUID NOT NULL,
  caisse_id UUID,
  type TEXT CHECK (type IN ('ENTREE','SORTIE')),
  source TEXT, -- VENTE, DEPENSE, DEPOT, TRANSFERT, CLOTURE
  montant NUMERIC NOT NULL,
  mode_paiement TEXT NOT NULL,
  fond_avant NUMERIC,
  fond_apres NUMERIC,
  reference_id UUID,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE fonds_actuels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_fonds" ON fonds_actuels;
CREATE POLICY "allow_all_fonds" ON fonds_actuels FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE depenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_depenses" ON depenses;
CREATE POLICY "allow_all_depenses" ON depenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE mouvements_tresorerie ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_mouv" ON mouvements_tresorerie;
CREATE POLICY "allow_all_mouv" ON mouvements_tresorerie FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. FONCTIONS SQL ATOMIQUES

-- Fonction unique pour TOUTES les dépenses tout secteur
CREATE OR REPLACE FUNCTION fn_creer_depense_caisse(
  p_company_id UUID,
  p_secteur_id UUID,
  p_caisse_id UUID,
  p_categorie TEXT,
  p_description TEXT,
  p_montant NUMERIC,
  p_mode_paiement TEXT,
  p_user_id UUID
) RETURNS JSON AS $$
DECLARE
  v_avant NUMERIC;
  v_apres NUMERIC;
  v_id UUID;
BEGIN
  -- Récupérer fond actuel de ce secteur + caisse + mode
  SELECT COALESCE(solde_actuel,0) INTO v_avant FROM fonds_actuels
  WHERE company_id=p_company_id AND secteur_id=p_secteur_id AND caisse_id=p_caisse_id AND type_fond=p_mode_paiement;
  IF v_avant IS NULL THEN v_avant := 0; END IF;

  v_apres := v_avant - p_montant; -- PEUT DEVENIR NEGATIF (DÉCOUVERT AUTORISÉ)

  INSERT INTO depenses (company_id, secteur_id, caisse_id, categorie, description, montant, mode_paiement, fond_avant, fond_apres, created_by)
  VALUES (p_company_id, p_secteur_id, p_caisse_id, p_categorie, p_description, p_montant, p_mode_paiement, v_avant, v_apres, p_user_id)
  RETURNING id INTO v_id;

  INSERT INTO fonds_actuels (company_id, secteur_id, caisse_id, type_fond, solde_actuel, updated_at)
  VALUES (p_company_id, p_secteur_id, p_caisse_id, p_mode_paiement, v_apres, NOW())
  ON CONFLICT (company_id, secteur_id, caisse_id, type_fond) DO UPDATE SET solde_actuel=v_apres, updated_at=NOW();

  INSERT INTO mouvements_tresorerie (company_id, secteur_id, caisse_id, type, source, montant, mode_paiement, fond_avant, fond_apres, reference_id, description)
  VALUES (p_company_id, p_secteur_id, p_caisse_id, 'SORTIE', 'DEPENSE', p_montant, p_mode_paiement, v_avant, v_apres, v_id, p_categorie);

  RETURN json_build_object('success',true,'depense_id',v_id,'avant',v_avant,'apres',v_apres);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonction pour toutes les entrées (ventes) qui réajuste automatiquement
CREATE OR REPLACE FUNCTION fn_creer_entree_caisse(
  p_company_id UUID,
  p_secteur_id UUID,
  p_caisse_id UUID,
  p_montant NUMERIC,
  p_mode_paiement TEXT,
  p_source TEXT,
  p_reference_id UUID
) RETURNS JSON AS $$
DECLARE 
  v_avant NUMERIC; 
  v_apres NUMERIC;
BEGIN
  SELECT COALESCE(solde_actuel,0) INTO v_avant FROM fonds_actuels 
  WHERE company_id=p_company_id AND secteur_id=p_secteur_id AND caisse_id=p_caisse_id AND type_fond=p_mode_paiement;
  IF v_avant IS NULL THEN v_avant := 0; END IF;

  v_apres := v_avant + p_montant; -- RÉAJUSTEMENT AUTOMATIQUE (ex: -15 000 + 30 000 = +15 000)

  INSERT INTO fonds_actuels (company_id, secteur_id, caisse_id, type_fond, solde_actuel, updated_at) 
  VALUES (p_company_id, p_secteur_id, p_caisse_id, p_mode_paiement, v_apres, NOW())
  ON CONFLICT (company_id, secteur_id, caisse_id, type_fond) DO UPDATE SET solde_actuel=v_apres, updated_at=NOW();

  INSERT INTO mouvements_tresorerie (company_id, secteur_id, caisse_id, type, source, montant, mode_paiement, fond_avant, fond_apres, reference_id) 
  VALUES (p_company_id, p_secteur_id, p_caisse_id, 'ENTREE', p_source, p_montant, p_mode_paiement, v_avant, v_apres, p_reference_id);

  RETURN json_build_object('success',true,'avant',v_avant,'apres',v_apres);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
