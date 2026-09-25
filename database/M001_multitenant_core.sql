-- ==============================================================================
-- M001 : CORE SAAS MULTI-TENANT - GESTIO 229
-- Migration additive (ne supprime rien) - Appliquer APRÈS supabase_schema_gestio229.sql
-- Stack : PostgreSQL / Supabase | Date : Septembre 2026
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. SECTEURS D'ACTIVITÉ (table maîtresse des activités, gérée par l'admin)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'Store',
    color VARCHAR(20) DEFAULT '#3B82F6',
    modules JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Modules communs activés : ["ventes","stock","finances","clients","fournisseurs","rh","depenses","rapports","audit","equipe"]
    specific_modules JSONB DEFAULT '[]'::jsonb,
    -- Modules spécifiques : ["ordonnances","lots_peremption"] pour pharmacie, etc.
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 2. PLANS D'ABONNEMENT
-- ==============================================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL UNIQUE,
    max_sectors INT NOT NULL DEFAULT 1,
    max_users INT NOT NULL DEFAULT 3,
    max_products INT DEFAULT 1000,
    price_monthly NUMERIC(12,2) NOT NULL DEFAULT 5000.00,
    price_yearly NUMERIC(12,2),
    features JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 3. MISE À JOUR TABLE companies (REFACTORING ADDITIF)
-- ==============================================================================
ALTER TABLE companies
    ADD COLUMN IF NOT EXISTS slug VARCHAR(100),
    ADD COLUMN IF NOT EXISTS responsible_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS logo_url TEXT,
    ADD COLUMN IF NOT EXISTS logo_base64 TEXT,
    ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50) DEFAULT 'trial',
    -- États : 'trial' | 'active' | 'grace_period' | 'readonly' | 'suspended'
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
    ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS plan_id UUID,
    ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'Africa/Porto-Novo',
    ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'fr';

-- Index unique sur slug (sparse, ignore les NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug) WHERE slug IS NOT NULL;

-- ==============================================================================
-- 4. LIAISON ENTREPRISE ↔ SECTEURS (Many-to-Many)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS company_sectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
    is_configured BOOLEAN DEFAULT false,
    configuration JSONB DEFAULT '{}'::jsonb,
    -- {"point_of_sale_name":"Quincaillerie Dantokpa","address":"...","phone":"...","manager":"...","currency":"FCFA","billing_mode":"direct","warehouses":["Principal"],"cash_registers":["Caisse 1"]}
    activated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, sector_id)
);

-- ==============================================================================
-- 5. ABONNEMENTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id),
    status VARCHAR(50) NOT NULL DEFAULT 'trial',
    -- 'trial' | 'active' | 'grace_period' | 'readonly' | 'expired' | 'suspended' | 'cancelled'
    started_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ,
    grace_ends_at TIMESTAMPTZ, -- = expires_at + 7 jours
    cancelled_at TIMESTAMPTZ,
    auto_renew BOOLEAN DEFAULT true,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 6. HISTORIQUE DES PAIEMENTS D'ABONNEMENT
--    (Prêt pour intégration MTN MoMo, Moov Money, Wave, CB)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id),
    reference VARCHAR(100) UNIQUE NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'FCFA',
    payment_method VARCHAR(50) NOT NULL,
    -- 'mtn_momo' | 'moov_money' | 'wave' | 'card' | 'cash' | 'manual'
    gateway_reference VARCHAR(255),  -- Référence renvoyée par l'API de paiement
    gateway_response JSONB,          -- Réponse brute de l'API (pour audit)
    status VARCHAR(50) DEFAULT 'pending',
    -- 'pending' | 'success' | 'failed' | 'refunded'
    period_start DATE,
    period_end DATE,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 7. MISE À JOUR user_profiles : RBAC MULTI-SECTEUR
-- ==============================================================================
ALTER TABLE user_profiles
    ADD COLUMN IF NOT EXISTS allowed_sectors UUID[] DEFAULT '{}',
    -- UUIDs des secteurs que cet utilisateur peut accéder
    ADD COLUMN IF NOT EXISTS allowed_sites UUID[] DEFAULT '{}',
    -- UUIDs des stock_locations autorisées
    ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS locale VARCHAR(10) DEFAULT 'fr';

-- ==============================================================================
-- 8. PERMISSIONS PAR RÔLE (table dédiée, plus granulaire que JSONB simple)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role_name VARCHAR(100) NOT NULL,
    -- 'administrateur' | 'gerant' | 'caissier' | 'magasinier' | 'comptable' | 'custom_*'
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    /*
    Format permissions :
    {
      "ventes":      {"view":true,  "create":true,  "edit":false,  "delete":false},
      "stock":       {"view":true,  "create":false, "edit":false,  "delete":false},
      "finances":    {"view":true,  "caisse":true,  "tresorerie":false, "banque":false},
      "clients":     {"view":true,  "create":true,  "edit":true,   "delete":false},
      "fournisseurs":{"view":true,  "create":false},
      "rh":          {"view":false},
      "depenses":    {"view":true,  "create":true},
      "rapports":    {"view":true},
      "audit":       {"view":false},
      "admin":       {"view":false}
    }
    */
    is_system_role BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, role_name)
);

-- ==============================================================================
-- 9. SESSIONS TENANT (sécurité + audit multi-accès)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS tenant_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
    current_sector_id UUID REFERENCES sectors(id),
    session_token TEXT UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ,
    last_activity TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 10. COLONNES MANQUANTES : company_id sur tables sans tenant isolation
-- ==============================================================================
ALTER TABLE bons_commande ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE signatures_bc ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE stock_magasin ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;

-- ==============================================================================
-- INDEX (PERFORMANCE CRITIQUE)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_sectors_slug ON sectors(slug);
CREATE INDEX IF NOT EXISTS idx_sectors_active ON sectors(is_active);
CREATE INDEX IF NOT EXISTS idx_company_sectors_company ON company_sectors(company_id);
CREATE INDEX IF NOT EXISTS idx_company_sectors_sector ON company_sectors(sector_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_company ON subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);
CREATE INDEX IF NOT EXISTS idx_payments_company ON subscription_payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON subscription_payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_ref ON subscription_payments(reference);
CREATE INDEX IF NOT EXISTS idx_tenant_sessions_company ON tenant_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_tenant_sessions_user ON tenant_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_role_perms_company ON role_permissions(company_id);
-- Index sur les tables métier existantes (critique pour les filtres multi-tenant)
CREATE INDEX IF NOT EXISTS idx_products_company ON products(company_id);
CREATE INDEX IF NOT EXISTS idx_product_cats_company ON product_categories(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON suppliers(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_locs_company ON stock_locations(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_company ON stock_levels(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_moves_company ON stock_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_company ON sales_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_orders(company_id, order_date);
CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_accounting_company ON accounting_entries(company_id);
CREATE INDEX IF NOT EXISTS idx_audit_company ON audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_company ON cash_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_company ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_bc_company ON bons_commande(company_id);
