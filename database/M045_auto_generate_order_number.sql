-- =============================================================================
-- GESTIO 229 SAAS — MIGRATION M045
-- GÉNÉRATION AUTOMATIQUE ET CONTRAINTE DE SÉCURITÉ SUR SALES_ORDERS.ORDER_NUMBER
-- TOUS SECTEURS D'ACTIVITÉ CONFONDUS
-- =============================================================================

-- 1. Créer la séquence si elle n'existe pas
CREATE SEQUENCE IF NOT EXISTS sales_orders_number_seq;

-- 2. Fonction de génération de numéro de commande unique par secteur
CREATE OR REPLACE FUNCTION fn_generate_order_number(p_company_id UUID, p_secteur_id UUID DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
  v_secteur_code TEXT;
  v_count BIGINT;
  v_date TEXT;
  v_rand TEXT;
BEGIN
  -- Déterminer le code secteur court (3 lettres)
  IF p_secteur_id IS NOT NULL THEN
    SELECT UPPER(LEFT(COALESCE(slug, nom, 'GEN'), 3)) INTO v_secteur_code 
    FROM secteurs 
    WHERE id = p_secteur_id;
  END IF;

  IF v_secteur_code IS NULL OR v_secteur_code = '' THEN 
    v_secteur_code := 'VTE'; 
  END IF;

  -- Date du jour au fuseau Bénin (Africa/Porto-Novo)
  v_date := TO_CHAR(NOW() AT TIME ZONE 'Africa/Porto-Novo', 'YYYYMMDD');
  v_rand := UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 4));

  -- Compteur du jour pour cette entreprise
  SELECT COUNT(*) + 1 INTO v_count 
  FROM sales_orders 
  WHERE company_id = p_company_id 
    AND DATE(created_at AT TIME ZONE 'Africa/Porto-Novo') = CURRENT_DATE;

  RETURN v_secteur_code || '-' || v_date || '-' || LPAD(COALESCE(v_count, 1)::TEXT, 4, '0') || '-' || v_rand;
END;
$$ LANGUAGE plpgsql;

-- 3. Trigger automatique avant insertion si order_number est NULL ou vide
CREATE OR REPLACE FUNCTION trg_set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := fn_generate_order_number(NEW.company_id, NULL);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_order_number_on_sales_orders ON sales_orders;
CREATE TRIGGER set_order_number_on_sales_orders
BEFORE INSERT ON sales_orders
FOR EACH ROW EXECUTE FUNCTION trg_set_order_number();

-- 4. Sécurité renforcée : valeur DEFAULT au niveau de la colonne pour garantir l'absence de NULL
ALTER TABLE sales_orders ALTER COLUMN order_number SET DEFAULT ('VTE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::TEXT, 1, 6)));

-- 5. Mettre à jour les anciennes ventes ayant order_number vide ou NULL
UPDATE sales_orders 
SET order_number = 'VTE-' || TO_CHAR(created_at, 'YYYYMMDD') || '-' || UPPER(SUBSTRING(id::TEXT, 1, 6))
WHERE order_number IS NULL OR order_number = '';

-- 6. Garantir la contrainte NOT NULL
ALTER TABLE sales_orders ALTER COLUMN order_number SET NOT NULL;

-- 7. Ajout sécurisé de secteur_id sur sales_order_items si besoin
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS secteur_id UUID;
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS secteur_id UUID;
