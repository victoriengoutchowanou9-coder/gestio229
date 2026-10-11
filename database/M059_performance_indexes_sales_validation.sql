-- =============================================================================
-- GESTIO 229 SaaS — Migration M059 : Index de Performance Validation Vente (< 2s)
-- =============================================================================
-- Optimise les requêtes de recherche, filtrage et insertion de ventes (sales_orders)
-- Couvre : company_id / etablissement_id, date / order_date, created_at, sector_slug
-- =============================================================================

-- 1. Index composites de recherche et validation sur sales_orders
CREATE INDEX IF NOT EXISTS idx_sales_orders_company_order_date
ON public.sales_orders (company_id, order_date DESC);

CREATE INDEX IF NOT EXISTS idx_sales_orders_company_created_at
ON public.sales_orders (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_orders_company_sector_created
ON public.sales_orders (company_id, sector_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_orders_created_at_desc
ON public.sales_orders (created_at DESC);

-- 2. Index sur les lignes de vente (liaison parent-enfants ultra-rapide)
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order_id_lookup
ON public.sales_order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_product_lookup
ON public.sales_order_items (product_id);

-- 3. Index sur les mouvements de stock & caisse associés
CREATE INDEX IF NOT EXISTS idx_stock_movements_perf
ON public.stock_movements (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_perf
ON public.caisse_mouvements (company_id, created_at DESC);

-- 4. Index conditionnels si colonnes etablissement_id ou date existent
DO $$
BEGIN
  -- Si sales_orders a une colonne etablissement_id
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_orders' AND column_name = 'etablissement_id') THEN
    CREATE INDEX IF NOT EXISTS idx_sales_orders_etablissement_date ON public.sales_orders (etablissement_id, order_date DESC, created_at DESC);
  END IF;

  -- Si une table ou vue 'ventes' existe
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ventes' AND column_name = 'etablissement_id') THEN
    CREATE INDEX IF NOT EXISTS idx_ventes_etablissement_date ON public.ventes (etablissement_id, created_at DESC);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ventes' AND column_name = 'date') THEN
    CREATE INDEX IF NOT EXISTS idx_ventes_date ON public.ventes (date DESC);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ventes' AND column_name = 'created_at') THEN
    CREATE INDEX IF NOT EXISTS idx_ventes_created_at ON public.ventes (created_at DESC);
  END IF;
END $$;

-- 5. Notification de rafraîchissement du cache de schéma PostgREST
NOTIFY pgrst, 'reload schema';
