-- =============================================================================
-- MIGRATION M047 : TABLEAU DE BORD HUB CONSOLIDÉ — DATE COTONOU & RESET MENSUEL
-- =============================================================================
-- Fuseau horaire : Africa/Porto-Novo (Bénin UTC+1)
-- Règle 1 : CA du jour = Ventes de la date Cotonou uniquement (0 si aucune vente)
-- Règle 2 : Synthèse du mois = Ventes entre le 1er et le dernier jour du mois en cours
-- Règle 3 : Quand le mois change, la synthèse mensuelle repart automatiquement à zéro
-- =============================================================================

-- 1. Rattrapage des dates nulles sur l'historique
UPDATE sales_orders
SET order_date = (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE
WHERE order_date IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'depenses') THEN
    UPDATE depenses
    SET date_depense = (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE
    WHERE date_depense IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ventes') THEN
    UPDATE ventes
    SET date_vente = (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE
    WHERE date_vente IS NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'factures') THEN
    UPDATE factures
    SET date_facture = (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE
    WHERE date_facture IS NULL;
  END IF;
END $$;

-- 2. Fonction consolidée fn_dashboard_hub
CREATE OR REPLACE FUNCTION fn_dashboard_hub(
  p_company_id UUID,
  p_date DATE DEFAULT (NOW() AT TIME ZONE 'Africa/Porto-Novo')::DATE
) RETURNS JSON AS $$
DECLARE
  v_ca_jour NUMERIC := 0;
  v_depenses_jour NUMERIC := 0;
  v_marge_jour NUMERIC := 0;
  v_ca_mois NUMERIC := 0;
  v_depenses_mois NUMERIC := 0;
  v_marge_mois NUMERIC := 0;
  v_date_debut_mois DATE;
  v_date_fin_mois DATE;
BEGIN
  v_date_debut_mois := date_trunc('month', p_date)::DATE;
  v_date_fin_mois := (date_trunc('month', p_date) + INTERVAL '1 month - 1 day')::DATE;

  -- ── CA DU JOUR ───────────────────────────────────────────────────────────
  -- 1. Factures si existantes
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'factures') THEN
    SELECT COALESCE(SUM(montant_ttc), 0) INTO v_ca_jour
    FROM factures
    WHERE company_id = p_company_id
      AND statut NOT IN ('annulée', 'annule', 'cancelled')
      AND (COALESCE(date_facture::DATE, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) = p_date;
  END IF;

  -- 2. Table ventes si factures = 0
  IF (v_ca_jour IS NULL OR v_ca_jour = 0) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ventes') THEN
    SELECT COALESCE(SUM(total_ttc), 0) INTO v_ca_jour
    FROM ventes
    WHERE company_id = p_company_id
      AND (COALESCE(date_vente::DATE, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) = p_date
      AND statut = 'validée';
  END IF;

  -- 3. Table sales_orders (POS actif GESTIO 229)
  IF (v_ca_jour IS NULL OR v_ca_jour = 0) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders') THEN
    SELECT COALESCE(SUM(total_amount), 0) INTO v_ca_jour
    FROM sales_orders
    WHERE company_id = p_company_id
      AND (COALESCE(order_date, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) = p_date
      AND status NOT IN ('annule', 'annulée', 'cancelled');
  END IF;

  -- ── DÉPENSES DU JOUR ─────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'depenses') THEN
    SELECT COALESCE(SUM(montant), 0) INTO v_depenses_jour
    FROM depenses
    WHERE company_id = p_company_id
      AND (COALESCE(date_depense, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) = p_date;
  END IF;

  -- ── MARGE DU JOUR ────────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders') THEN
    SELECT COALESCE(SUM(COALESCE(gross_margin, subtotal_ht - total_cost)), 0) INTO v_marge_jour
    FROM sales_orders
    WHERE company_id = p_company_id
      AND (COALESCE(order_date, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) = p_date
      AND status NOT IN ('annule', 'annulée', 'cancelled');
  END IF;

  IF (v_marge_jour IS NULL OR v_marge_jour = 0) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lignes_vente') THEN
    SELECT COALESCE(SUM((prix_vente - prix_achat) * qte), 0) INTO v_marge_jour
    FROM lignes_vente
    JOIN ventes ON ventes.id = lignes_vente.vente_id
    WHERE ventes.company_id = p_company_id
      AND (COALESCE(ventes.date_vente::DATE, (ventes.created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) = p_date;
  END IF;

  IF (v_marge_jour IS NULL OR v_marge_jour = 0) AND v_ca_jour > 0 THEN
    v_marge_jour := GREATEST(0, v_ca_jour - COALESCE(v_depenses_jour, 0));
  END IF;

  -- ── SYNTHÈSE DU MOIS ─────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'factures') THEN
    SELECT COALESCE(SUM(montant_ttc), 0) INTO v_ca_mois
    FROM factures
    WHERE company_id = p_company_id
      AND (COALESCE(date_facture::DATE, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) BETWEEN v_date_debut_mois AND v_date_fin_mois
      AND statut NOT IN ('annulée', 'annule', 'cancelled');
  END IF;

  IF (v_ca_mois IS NULL OR v_ca_mois = 0) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ventes') THEN
    SELECT COALESCE(SUM(total_ttc), 0) INTO v_ca_mois
    FROM ventes
    WHERE company_id = p_company_id
      AND (COALESCE(date_vente::DATE, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) BETWEEN v_date_debut_mois AND v_date_fin_mois
      AND statut = 'validée';
  END IF;

  IF (v_ca_mois IS NULL OR v_ca_mois = 0) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders') THEN
    SELECT COALESCE(SUM(total_amount), 0) INTO v_ca_mois
    FROM sales_orders
    WHERE company_id = p_company_id
      AND (COALESCE(order_date, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) BETWEEN v_date_debut_mois AND v_date_fin_mois
      AND status NOT IN ('annule', 'annulée', 'cancelled');
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'depenses') THEN
    SELECT COALESCE(SUM(montant), 0) INTO v_depenses_mois
    FROM depenses
    WHERE company_id = p_company_id
      AND (COALESCE(date_depense, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) BETWEEN v_date_debut_mois AND v_date_fin_mois;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders') THEN
    SELECT COALESCE(SUM(COALESCE(gross_margin, subtotal_ht - total_cost)), 0) INTO v_marge_mois
    FROM sales_orders
    WHERE company_id = p_company_id
      AND (COALESCE(order_date, (created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) BETWEEN v_date_debut_mois AND v_date_fin_mois
      AND status NOT IN ('annule', 'annulée', 'cancelled');
  END IF;

  IF (v_marge_mois IS NULL OR v_marge_mois = 0) AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lignes_vente') THEN
    SELECT COALESCE(SUM((prix_vente - prix_achat) * qte), 0) INTO v_marge_mois
    FROM lignes_vente
    JOIN ventes ON ventes.id = lignes_vente.vente_id
    WHERE ventes.company_id = p_company_id
      AND (COALESCE(ventes.date_vente::DATE, (ventes.created_at AT TIME ZONE 'Africa/Porto-Novo')::DATE)) BETWEEN v_date_debut_mois AND v_date_fin_mois;
  END IF;

  IF (v_marge_mois IS NULL OR v_marge_mois = 0) AND v_ca_mois > 0 THEN
    v_marge_mois := GREATEST(0, v_ca_mois - COALESCE(v_depenses_mois, 0));
  END IF;

  RETURN json_build_object(
    'date', p_date,
    'ca_jour', COALESCE(v_ca_jour, 0),
    'depenses_jour', COALESCE(v_depenses_jour, 0),
    'marge_jour', COALESCE(v_marge_jour, 0),
    'ca_mois', COALESCE(v_ca_mois, 0),
    'depenses_mois', COALESCE(v_depenses_mois, 0),
    'marge_mois', COALESCE(v_marge_mois, 0),
    'mois_debut', v_date_debut_mois,
    'mois_fin', v_date_fin_mois
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Accorder les permissions d'exécution
GRANT EXECUTE ON FUNCTION fn_dashboard_hub(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_dashboard_hub(UUID, DATE) TO anon;
