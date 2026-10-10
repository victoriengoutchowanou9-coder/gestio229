-- =============================================================================
-- GESTIO 229 SaaS — INDEXES DE PERFORMANCE POSTGRESQL (SUPABASE)
-- 100% vérifié avec les colonnes réelles de votre schéma Supabase
-- =============================================================================

-- 1. Clients (table: customers)
CREATE INDEX IF NOT EXISTS idx_customers_comp_active_name 
  ON customers(company_id, is_active, name);

CREATE INDEX IF NOT EXISTS idx_customers_sector_slug 
  ON customers(sector_slug);

CREATE INDEX IF NOT EXISTS idx_customers_phone 
  ON customers(phone);

-- 2. Ventes & Commandes (table: sales_orders)
CREATE INDEX IF NOT EXISTS idx_sales_orders_comp_sector_created 
  ON sales_orders(company_id, sector_slug, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_orders_comp_created 
  ON sales_orders(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_orders_customer_id 
  ON sales_orders(customer_id);

-- 3. Lignes de vente (table: sales_order_items)
CREATE INDEX IF NOT EXISTS idx_sales_order_items_order_id 
  ON sales_order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_product_id 
  ON sales_order_items(product_id);

-- 4. Produits & Catalogue (table: products)
CREATE INDEX IF NOT EXISTS idx_products_comp_active_name 
  ON products(company_id, is_active, name);

CREATE INDEX IF NOT EXISTS idx_products_sector_slug 
  ON products(sector_slug);

-- 5. Mouvements de Caisse (table: caisse_mouvements)
CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_caisse_created 
  ON caisse_mouvements(caisse_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_comp_sector 
  ON caisse_mouvements(company_id, sector_slug, created_at DESC);

-- 6. Sessions de Caisse (table: cash_sessions - colonne: opened_at)
CREATE INDEX IF NOT EXISTS idx_cash_sessions_opened 
  ON cash_sessions(opened_at DESC);

-- 7. Dépenses (table: expenses)
CREATE INDEX IF NOT EXISTS idx_expenses_comp_sector_created 
  ON expenses(company_id, sector_slug, created_at DESC);

-- 8. Mouvements de Stock (table: stock_movements)
CREATE INDEX IF NOT EXISTS idx_stock_movements_comp_prod_created 
  ON stock_movements(company_id, product_id, created_at DESC);
