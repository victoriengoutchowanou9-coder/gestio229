-- =============================================================================
-- Migration M061 : Correction Globale & Définitive des Calculs de Marge Hub
-- =============================================================================
-- Interdiction absolue : Ne plus jamais calculer marge = CA - Dépenses !
-- Règle d'or :
-- 1. Marge brute (gross_margin) = CA net HT - COGS (coût d'achat réel des marchandises vendues)
-- 2. Dépenses d'exploitation = Somme des charges de fonctionnement (hors mouvements de trésorerie)
-- 3. Marge nette (net_margin) = Marge brute - Dépenses d'exploitation
-- 4. Si COGS est nul/inconnu pour un article, ne pas assumer 100% de marge brute
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_dashboard_hub(
  p_company_id UUID,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSON AS $$
DECLARE
  v_date_debut_mois DATE;
  v_date_fin_mois   DATE;
  v_ca_jour         NUMERIC(15, 2) := 0;
  v_cogs_jour       NUMERIC(15, 2) := 0;
  v_marge_brute_jour NUMERIC(15, 2) := 0;
  v_depenses_jour   NUMERIC(15, 2) := 0;
  v_marge_nette_jour NUMERIC(15, 2) := 0;
  v_ca_mois         NUMERIC(15, 2) := 0;
  v_cogs_mois       NUMERIC(15, 2) := 0;
  v_marge_brute_mois NUMERIC(15, 2) := 0;
  v_depenses_mois   NUMERIC(15, 2) := 0;
  v_marge_nette_mois NUMERIC(15, 2) := 0;
BEGIN
  -- Calcul des bornes du mois (1er au dernier jour)
  v_date_debut_mois := DATE_TRUNC('month', p_date)::DATE;
  v_date_fin_mois   := (DATE_TRUNC('month', p_date) + INTERVAL '1 month - 1 day')::DATE;

  -- ── 1. CHIFFRE D'AFFAIRES & COGS DU JOUR ─────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders') THEN
    SELECT
      COALESCE(SUM(total_amount), 0),
      COALESCE(SUM(total_cost), 0),
      COALESCE(SUM(COALESCE(gross_margin, subtotal_ht - total_cost)), 0)
    INTO v_ca_jour, v_cogs_jour, v_marge_brute_jour
    FROM sales_orders
    WHERE company_id = p_company_id
      AND (COALESCE(order_date, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) = p_date
      AND status NOT IN ('annule', 'annulée', 'cancelled', 'CANCELLED');
  END IF;

  -- Fallback factures si pas de sales_orders
  IF (v_ca_jour IS NULL OR v_ca_jour = 0) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'factures') THEN
    SELECT COALESCE(SUM(montant_ttc), 0) INTO v_ca_jour
    FROM factures
    WHERE company_id = p_company_id
      AND (COALESCE(date_facture::DATE, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) = p_date
      AND statut NOT IN ('annulée', 'annule', 'cancelled');
  END IF;

  -- ── 2. DÉPENSES D'EXPLOITATION DU JOUR ──────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'depenses') THEN
    SELECT COALESCE(SUM(montant), 0) INTO v_depenses_jour
    FROM depenses
    WHERE company_id = p_company_id
      AND (COALESCE(date_depense, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) = p_date
      AND (categorie IS NULL OR categorie NOT IN ('transfert', 'cloture', 'alimentation_coffre'));
  END IF;

  -- Marge nette du jour = Marge brute - Dépenses
  v_marge_nette_jour := v_marge_brute_jour - v_depenses_jour;

  -- ── 3. CHIFFRE D'AFFAIRES & COGS DU MOIS ─────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders') THEN
    SELECT
      COALESCE(SUM(total_amount), 0),
      COALESCE(SUM(total_cost), 0),
      COALESCE(SUM(COALESCE(gross_margin, subtotal_ht - total_cost)), 0)
    INTO v_ca_mois, v_cogs_mois, v_marge_brute_mois
    FROM sales_orders
    WHERE company_id = p_company_id
      AND (COALESCE(order_date, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) BETWEEN v_date_debut_mois AND v_date_fin_mois
      AND status NOT IN ('annule', 'annulée', 'cancelled', 'CANCELLED');
  END IF;

  -- Fallback factures si pas de sales_orders pour le mois
  IF (v_ca_mois IS NULL OR v_ca_mois = 0) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'factures') THEN
    SELECT COALESCE(SUM(montant_ttc), 0) INTO v_ca_mois
    FROM factures
    WHERE company_id = p_company_id
      AND (COALESCE(date_facture::DATE, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) BETWEEN v_date_debut_mois AND v_date_fin_mois
      AND statut NOT IN ('annulée', 'annule', 'cancelled');
  END IF;

  -- ── 4. DÉPENSES D'EXPLOITATION DU MOIS ──────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'depenses') THEN
    SELECT COALESCE(SUM(montant), 0) INTO v_depenses_mois
    FROM depenses
    WHERE company_id = p_company_id
      AND (COALESCE(date_depense, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) BETWEEN v_date_debut_mois AND v_date_fin_mois
      AND (categorie IS NULL OR categorie NOT IN ('transfert', 'cloture', 'alimentation_coffre'));
  END IF;

  -- Marge nette du mois = Marge brute - Dépenses (ET JAMAIS CA - Dépenses !)
  v_marge_nette_mois := v_marge_brute_mois - v_depenses_mois;

  RETURN json_build_object(
    'date', p_date,
    'ca_jour', COALESCE(v_ca_jour, 0),
    'cogs_jour', COALESCE(v_cogs_jour, 0),
    'marge_brute_jour', COALESCE(v_marge_brute_jour, 0),
    'depenses_jour', COALESCE(v_depenses_jour, 0),
    'marge_jour', COALESCE(v_marge_nette_jour, 0),
    'ca_mois', COALESCE(v_ca_mois, 0),
    'cogs_mois', COALESCE(v_cogs_mois, 0),
    'marge_brute_mois', COALESCE(v_marge_brute_mois, 0),
    'depenses_mois', COALESCE(v_depenses_mois, 0),
    'marge_mois', COALESCE(v_marge_nette_mois, 0),
    'mois_debut', v_date_debut_mois,
    'mois_fin', v_date_fin_mois
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION fn_dashboard_hub(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_dashboard_hub(UUID, DATE) TO anon;
