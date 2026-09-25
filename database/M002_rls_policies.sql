-- ==============================================================================
-- M002 : ROW LEVEL SECURITY - ISOLATION MULTI-TENANT COMPLÈTE
-- Garantit que l'Entreprise A ne peut jamais accéder aux données de l'Entreprise B
-- À appliquer APRÈS M001_multitenant_core.sql
-- ==============================================================================

-- ==============================================================================
-- FONCTIONS HELPER (extraient les claims du JWT Supabase)
-- ==============================================================================

-- Récupère le company_id depuis le JWT (injecté via Supabase Auth hook)
CREATE OR REPLACE FUNCTION auth.company_id() RETURNS UUID AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'company_id')::UUID,
    NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Vérifie si l'utilisateur est admin de la plateforme GESTIO 229
CREATE OR REPLACE FUNCTION auth.is_platform_admin() RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_platform_admin')::BOOLEAN,
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ==============================================================================
-- ACTIVATION RLS SUR TOUTES LES TABLES
-- ==============================================================================

-- Tables publiques (secteurs & plans : tout le monde peut lire)
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Tables Core SaaS (isolées par company_id)
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_sessions ENABLE ROW LEVEL SECURITY;

-- Tables métier existantes
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE treasury_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE syscohada_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bons_commande ENABLE ROW LEVEL SECURITY;
ALTER TABLE bc_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures_bc ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_magasin ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- POLICIES TABLES PUBLIQUES
-- ==============================================================================

-- SECTORS : lecture publique (vitrine + sélection à l'inscription)
DROP POLICY IF EXISTS "sectors_public_read" ON sectors;
CREATE POLICY "sectors_public_read" ON sectors
    FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "sectors_admin_all" ON sectors;
CREATE POLICY "sectors_admin_all" ON sectors
    FOR ALL USING (auth.is_platform_admin());

-- SUBSCRIPTION_PLANS : lecture publique (page tarifs)
DROP POLICY IF EXISTS "plans_public_read" ON subscription_plans;
CREATE POLICY "plans_public_read" ON subscription_plans
    FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "plans_admin_all" ON subscription_plans;
CREATE POLICY "plans_admin_all" ON subscription_plans
    FOR ALL USING (auth.is_platform_admin());

-- ==============================================================================
-- POLICIES TABLES CORE SAAS
-- ==============================================================================

-- COMPANIES
DROP POLICY IF EXISTS "companies_tenant" ON companies;
CREATE POLICY "companies_tenant" ON companies
    USING (id = auth.company_id() OR auth.is_platform_admin())
    WITH CHECK (id = auth.company_id() OR auth.is_platform_admin());

-- COMPANY_SECTORS
DROP POLICY IF EXISTS "company_sectors_tenant" ON company_sectors;
CREATE POLICY "company_sectors_tenant" ON company_sectors
    USING (company_id = auth.company_id() OR auth.is_platform_admin())
    WITH CHECK (company_id = auth.company_id() OR auth.is_platform_admin());

-- SUBSCRIPTIONS
DROP POLICY IF EXISTS "subscriptions_tenant" ON subscriptions;
CREATE POLICY "subscriptions_tenant" ON subscriptions
    USING (company_id = auth.company_id() OR auth.is_platform_admin())
    WITH CHECK (company_id = auth.company_id() OR auth.is_platform_admin());

-- SUBSCRIPTION_PAYMENTS
DROP POLICY IF EXISTS "payments_tenant" ON subscription_payments;
CREATE POLICY "payments_tenant" ON subscription_payments
    USING (company_id = auth.company_id() OR auth.is_platform_admin())
    WITH CHECK (company_id = auth.company_id() OR auth.is_platform_admin());

-- ROLE_PERMISSIONS
DROP POLICY IF EXISTS "role_perms_tenant" ON role_permissions;
CREATE POLICY "role_perms_tenant" ON role_permissions
    USING (company_id = auth.company_id() OR auth.is_platform_admin())
    WITH CHECK (company_id = auth.company_id() OR auth.is_platform_admin());

-- TENANT_SESSIONS
DROP POLICY IF EXISTS "tenant_sessions_rls" ON tenant_sessions;
CREATE POLICY "tenant_sessions_rls" ON tenant_sessions
    USING (company_id = auth.company_id() OR auth.is_platform_admin())
    WITH CHECK (company_id = auth.company_id() OR auth.is_platform_admin());

-- ==============================================================================
-- POLICIES TABLES MÉTIER (ISOLATION STRICTE PAR company_id)
-- ==============================================================================

-- USER_PROFILES
DROP POLICY IF EXISTS "user_profiles_tenant" ON user_profiles;
CREATE POLICY "user_profiles_tenant" ON user_profiles
    USING (company_id = auth.company_id() OR auth.is_platform_admin())
    WITH CHECK (company_id = auth.company_id() OR auth.is_platform_admin());

-- PRODUCTS
DROP POLICY IF EXISTS "tenant_isolation_products" ON products;
CREATE POLICY "tenant_isolation_products" ON products
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

-- PRODUCT_CATEGORIES
DROP POLICY IF EXISTS "tenant_isolation_product_categories" ON product_categories;
CREATE POLICY "tenant_isolation_product_categories" ON product_categories
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

-- CUSTOMERS
DROP POLICY IF EXISTS "tenant_isolation_customers" ON customers;
CREATE POLICY "tenant_isolation_customers" ON customers
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

-- CUSTOMER_GROUPS
DROP POLICY IF EXISTS "tenant_isolation_customer_groups" ON customer_groups;
CREATE POLICY "tenant_isolation_customer_groups" ON customer_groups
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

-- SUPPLIERS
DROP POLICY IF EXISTS "tenant_isolation_suppliers" ON suppliers;
CREATE POLICY "tenant_isolation_suppliers" ON suppliers
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

-- STOCK
DROP POLICY IF EXISTS "tenant_isolation_stock_locations" ON stock_locations;
CREATE POLICY "tenant_isolation_stock_locations" ON stock_locations
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

DROP POLICY IF EXISTS "tenant_isolation_stock_levels" ON stock_levels;
CREATE POLICY "tenant_isolation_stock_levels" ON stock_levels
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

DROP POLICY IF EXISTS "tenant_isolation_stock_movements" ON stock_movements;
CREATE POLICY "tenant_isolation_stock_movements" ON stock_movements
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

DROP POLICY IF EXISTS "tenant_isolation_stock_transfers" ON stock_transfers;
CREATE POLICY "tenant_isolation_stock_transfers" ON stock_transfers
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

DROP POLICY IF EXISTS "tenant_isolation_inventory_sessions" ON inventory_sessions;
CREATE POLICY "tenant_isolation_inventory_sessions" ON inventory_sessions
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

-- inventory_items : via jointure sur inventory_sessions
DROP POLICY IF EXISTS "tenant_isolation_inventory_items" ON inventory_items;
CREATE POLICY "tenant_isolation_inventory_items" ON inventory_items
    USING (
        inventory_id IN (
            SELECT id FROM inventory_sessions WHERE company_id = auth.company_id()
        )
    );

-- ACHATS
DROP POLICY IF EXISTS "tenant_isolation_purchase_orders" ON purchase_orders;
CREATE POLICY "tenant_isolation_purchase_orders" ON purchase_orders
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

DROP POLICY IF EXISTS "tenant_isolation_purchase_receipts" ON purchase_receipts;
CREATE POLICY "tenant_isolation_purchase_receipts" ON purchase_receipts
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

-- CAISSES
DROP POLICY IF EXISTS "tenant_isolation_cash_registers" ON cash_registers;
CREATE POLICY "tenant_isolation_cash_registers" ON cash_registers
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

DROP POLICY IF EXISTS "tenant_isolation_cash_sessions" ON cash_sessions;
CREATE POLICY "tenant_isolation_cash_sessions" ON cash_sessions
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

DROP POLICY IF EXISTS "tenant_isolation_treasury" ON treasury_accounts;
CREATE POLICY "tenant_isolation_treasury" ON treasury_accounts
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

DROP POLICY IF EXISTS "tenant_isolation_expenses" ON expenses;
CREATE POLICY "tenant_isolation_expenses" ON expenses
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

-- VENTES
DROP POLICY IF EXISTS "tenant_isolation_sales" ON sales_orders;
CREATE POLICY "tenant_isolation_sales" ON sales_orders
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

DROP POLICY IF EXISTS "tenant_isolation_sales_items" ON sales_order_items;
CREATE POLICY "tenant_isolation_sales_items" ON sales_order_items
    USING (
        order_id IN (
            SELECT id FROM sales_orders WHERE company_id = auth.company_id()
        )
    );

DROP POLICY IF EXISTS "tenant_isolation_credit_notes" ON credit_notes;
CREATE POLICY "tenant_isolation_credit_notes" ON credit_notes
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

-- COMPTABILITÉ
DROP POLICY IF EXISTS "tenant_isolation_accounting" ON accounting_entries;
CREATE POLICY "tenant_isolation_accounting" ON accounting_entries
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

DROP POLICY IF EXISTS "tenant_isolation_syscohada" ON syscohada_accounts;
CREATE POLICY "tenant_isolation_syscohada" ON syscohada_accounts
    USING (company_id = auth.company_id())
    WITH CHECK (company_id = auth.company_id());

-- AUDIT (lecture seule pour le tenant, admin peut tout voir)
DROP POLICY IF EXISTS "tenant_isolation_audit" ON audit_logs;
CREATE POLICY "tenant_isolation_audit" ON audit_logs
    USING (company_id = auth.company_id() OR auth.is_platform_admin());

-- BONS DE COMMANDE (remplace les anciennes policies permissives)
DROP POLICY IF EXISTS "Permettre lecture bons_commande" ON bons_commande;
DROP POLICY IF EXISTS "Permettre insertion bons_commande" ON bons_commande;
DROP POLICY IF EXISTS "Permettre mise à jour bons_commande" ON bons_commande;
DROP POLICY IF EXISTS "Permettre lecture bc_lignes" ON bc_lignes;
DROP POLICY IF EXISTS "Permettre insertion bc_lignes" ON bc_lignes;
DROP POLICY IF EXISTS "Permettre mise à jour bc_lignes" ON bc_lignes;
DROP POLICY IF EXISTS "Permettre lecture signatures_bc" ON signatures_bc;
DROP POLICY IF EXISTS "Permettre insertion signatures_bc" ON signatures_bc;
DROP POLICY IF EXISTS "Permettre lecture stock_magasin" ON stock_magasin;
DROP POLICY IF EXISTS "Permettre upsert stock_magasin" ON stock_magasin;

CREATE POLICY "tenant_bons_commande" ON bons_commande
    USING (company_id = auth.company_id() OR company_id IS NULL)
    WITH CHECK (company_id = auth.company_id());

CREATE POLICY "tenant_bc_lignes" ON bc_lignes
    USING (
        bc_id IN (SELECT id FROM bons_commande WHERE company_id = auth.company_id() OR company_id IS NULL)
    );

CREATE POLICY "tenant_signatures_bc" ON signatures_bc
    USING (
        bc_id IN (SELECT id FROM bons_commande WHERE company_id = auth.company_id() OR company_id IS NULL)
    );

CREATE POLICY "tenant_stock_magasin" ON stock_magasin
    USING (company_id = auth.company_id() OR company_id IS NULL)
    WITH CHECK (company_id = auth.company_id());

-- ==============================================================================
-- RÔLES SYSTÈME PAR DÉFAUT (injectés lors de la création d'une nouvelle entreprise)
-- ==============================================================================
-- Cette fonction est appelée depuis l'application après création d'une entreprise
CREATE OR REPLACE FUNCTION create_default_roles(p_company_id UUID)
RETURNS VOID AS $$
BEGIN
    INSERT INTO role_permissions (company_id, role_name, permissions, is_system_role) VALUES
    (p_company_id, 'administrateur', '{
        "ventes":      {"view":true,  "create":true,  "edit":true,  "delete":true},
        "stock":       {"view":true,  "create":true,  "edit":true,  "delete":true},
        "finances":    {"view":true,  "caisse":true,  "tresorerie":true, "banque":true},
        "clients":     {"view":true,  "create":true,  "edit":true,  "delete":true},
        "fournisseurs":{"view":true,  "create":true,  "edit":true,  "delete":true},
        "rh":          {"view":true,  "create":true,  "edit":true,  "delete":true},
        "depenses":    {"view":true,  "create":true,  "edit":true,  "delete":true},
        "rapports":    {"view":true},
        "audit":       {"view":true},
        "admin":       {"view":true}
    }'::jsonb, true),
    (p_company_id, 'gerant', '{
        "ventes":      {"view":true,  "create":true,  "edit":true,  "delete":false},
        "stock":       {"view":true,  "create":true,  "edit":true,  "delete":false},
        "finances":    {"view":true,  "caisse":true,  "tresorerie":true, "banque":false},
        "clients":     {"view":true,  "create":true,  "edit":true,  "delete":false},
        "fournisseurs":{"view":true,  "create":true,  "edit":true},
        "rh":          {"view":true,  "create":false},
        "depenses":    {"view":true,  "create":true},
        "rapports":    {"view":true},
        "audit":       {"view":true},
        "admin":       {"view":false}
    }'::jsonb, true),
    (p_company_id, 'caissier', '{
        "ventes":      {"view":true,  "create":true,  "edit":false, "delete":false},
        "stock":       {"view":true,  "create":false},
        "finances":    {"view":true,  "caisse":true,  "tresorerie":false, "banque":false},
        "clients":     {"view":true,  "create":true,  "edit":true,  "delete":false},
        "fournisseurs":{"view":false},
        "rh":          {"view":false},
        "depenses":    {"view":true,  "create":true},
        "rapports":    {"view":false},
        "audit":       {"view":false},
        "admin":       {"view":false}
    }'::jsonb, true),
    (p_company_id, 'magasinier', '{
        "ventes":      {"view":false},
        "stock":       {"view":true,  "create":true,  "edit":true,  "delete":false},
        "finances":    {"view":false},
        "clients":     {"view":true,  "create":false},
        "fournisseurs":{"view":true,  "create":false},
        "rh":          {"view":false},
        "depenses":    {"view":false},
        "rapports":    {"view":false},
        "audit":       {"view":false},
        "admin":       {"view":false}
    }'::jsonb, true),
    (p_company_id, 'comptable', '{
        "ventes":      {"view":true,  "create":false},
        "stock":       {"view":true,  "create":false},
        "finances":    {"view":true,  "caisse":false, "tresorerie":true, "banque":true},
        "clients":     {"view":true,  "create":false},
        "fournisseurs":{"view":true,  "create":false},
        "rh":          {"view":true,  "create":false},
        "depenses":    {"view":true,  "create":false},
        "rapports":    {"view":true},
        "audit":       {"view":true},
        "admin":       {"view":false}
    }'::jsonb, true)
    ON CONFLICT (company_id, role_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
