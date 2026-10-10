-- =============================================================================
-- GESTIO 229 SaaS — INDEXES DE PERFORMANCE POSTGRESQL (SUPABASE)
-- Tables réelles : customers, sales_orders, sales_order_items, products, etc.
-- =============================================================================

-- 1. Index sur les clients (customers)
CREATE INDEX IF NOT EXISTS idx_customers_comp_active_name 
  ON customers(company_id, is_active, name);

CREATE INDEX IF NOT EXISTS idx_customers_sector_slug 
  ON customers(sector_slug);

CREATE INDEX IF NOT EXISTS idx_customers_phone 
  ON customers(phone);

-- 2. Index sur les ventes / commandes (sales_orders)
CREATE INDEX IF NOT EXISTS idx_sales_orders_comp_sector_created 
  ON sales_orders(company_id, sector_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_orders_comp_created 
  ON sales_orders(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_id 
  ON sales_orders(customer_id);

-- 3. Index sur les lignes de vente (sales_order_items)
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order_id 
  ON sales_order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_product_id 
  ON sales_order_items(product_id);

-- 4. Index sur les produits (products)
CREATE INDEX IF NOT EXISTS idx_products_comp_active_name 
  ON products(company_id, is_active, name);

CREATE INDEX IF NOT EXISTS idx_products_sector_slug 
  ON products(sector_slug);

-- 5. Index sur les mouvements de caisse (caisse_mouvements)
CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_caisse_created 
  ON caisse_mouvements(caisse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_comp_sector 
  ON caisse_mouvements(company_id, sector_slug, created_at DESC);

-- 6. Index sur les sessions de caisse (cash_sessions)
CREATE INDEX IF NOT EXISTS idx_cash_sessions_created 
  ON cash_sessions(created_at DESC);

-- 7. Index sur les dépenses (expenses)
CREATE INDEX IF NOT EXISTS idx_expenses_created 
  ON expenses(created_at DESC);

-- 8. Index sur les mouvements de stock (stock_movements)
CREATE INDEX IF NOT EXISTS idx_stock_movements_comp_prod_created 
  ON stock_movements(company_id, product_id, created_at DESC);
