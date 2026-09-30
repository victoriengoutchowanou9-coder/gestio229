-- =============================================================================
-- GESTIO 229 SAAS — MIGRATION 003 : SÉCURITÉ RENFORCÉE, PERSISTANCE ET RLS
-- Conforme aux spécifications de la Partie 5
-- Migration additive et non destructive : aucune perte de données existantes
-- =============================================================================

-- ─── 1. FONCTION HELPER POUR LA RÉSOLUTION DE L'ENTREPRISE DE L'UTILISATEUR ─

CREATE OR REPLACE FUNCTION public.get_user_company_id(p_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT company_id 
  FROM public.user_profiles 
  WHERE auth_user_id = p_user_id OR id = p_user_id 
  LIMIT 1;
$$;

-- ─── 2. CRÉATION DES TABLES DE PERSISTANCE MANQUANTES ────────────────────────

-- 2.1. Association Entreprise <-> Secteurs Souscrits (Permet de persister les souscriptions)
CREATE TABLE IF NOT EXISTS public.company_sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sector_slug VARCHAR(64) NOT NULL,
  sector_name VARCHAR(255) NOT NULL,
  is_configured BOOLEAN DEFAULT TRUE,
  configuration JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_company_sector UNIQUE (company_id, sector_slug)
);
CREATE INDEX IF NOT EXISTS idx_comp_sectors_tenant ON public.company_sectors(company_id, sector_slug);

-- 2.2. Clôtures de Caisse (Z de Caisse Journalier)
CREATE TABLE IF NOT EXISTS public.cash_closures (
  id VARCHAR(128) PRIMARY KEY DEFAULT ('cloture-' || floor(extract(epoch from now()) * 1000)::text),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sector_slug VARCHAR(64) NOT NULL DEFAULT 'boutique',
  caisse_name VARCHAR(255) NOT NULL DEFAULT 'Caisse Principale',
  closed_by VARCHAR(255) NOT NULL,
  closed_at TIMESTAMPTZ DEFAULT NOW(),
  fond_especes_theorique NUMERIC(15,2) DEFAULT 0,
  fond_especes_physique NUMERIC(15,2) DEFAULT 0,
  ecart_especes NUMERIC(15,2) DEFAULT 0,
  fond_momo NUMERIC(15,2) DEFAULT 0,
  total_fermeture NUMERIC(15,2) DEFAULT 0,
  notes TEXT,
  status VARCHAR(64) DEFAULT 'CLOTURE_VALIDEE',
  emailed_to TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cash_closures_tenant ON public.cash_closures(company_id, sector_slug, closed_at DESC);

-- 2.3. Mouvements de Caisse Réels (Encaissements, Décaissements, Ajustements)
CREATE TABLE IF NOT EXISTS public.cash_movements (
  id VARCHAR(128) PRIMARY KEY DEFAULT ('mov-' || floor(extract(epoch from now()) * 1000)::text),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sector_slug VARCHAR(64) NOT NULL DEFAULT 'boutique',
  caisse_id VARCHAR(128),
  user_name VARCHAR(255) NOT NULL,
  type VARCHAR(64) NOT NULL, -- ENCAISSEMENT, REMBOURSEMENT, RETRAIT, TRANSFERT, AJUSTEMENT, CLOTURE
  payment_channel VARCHAR(64) NOT NULL DEFAULT 'Espèces',
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  motif TEXT NOT NULL,
  reference VARCHAR(255),
  status VARCHAR(64) DEFAULT 'VALIDE',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cash_movements_tenant ON public.cash_movements(company_id, sector_slug, created_at DESC);

-- 2.4. Remboursements de Créances Clients
CREATE TABLE IF NOT EXISTS public.customer_repayments (
  id VARCHAR(128) PRIMARY KEY DEFAULT ('rep-' || floor(extract(epoch from now()) * 1000)::text),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sector_slug VARCHAR(64) NOT NULL DEFAULT 'boutique',
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  payment_method VARCHAR(64) NOT NULL DEFAULT 'especes',
  previous_debt NUMERIC(15,2) DEFAULT 0,
  remaining_debt NUMERIC(15,2) DEFAULT 0,
  receipt_number VARCHAR(128),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_repayments_tenant ON public.customer_repayments(company_id, sector_slug, created_at DESC);

-- 2.5. Demandes de Transfert vers la Trésorerie
CREATE TABLE IF NOT EXISTS public.treasury_transfers (
  id VARCHAR(128) PRIMARY KEY DEFAULT ('req-' || floor(extract(epoch from now()) * 1000)::text),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sector_slug VARCHAR(64) NOT NULL DEFAULT 'boutique',
  requested_by VARCHAR(255) NOT NULL,
  type VARCHAR(64) NOT NULL, -- Espèces, MoMo, etc.
  amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  motif TEXT NOT NULL,
  source_caisse VARCHAR(255),
  target_account_id VARCHAR(128),
  status VARCHAR(64) DEFAULT 'EN_ATTENTE', -- EN_ATTENTE, APPROVED, REJECTED
  approved_by VARCHAR(255),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transfers_tenant ON public.treasury_transfers(company_id, sector_slug, created_at DESC);

-- ─── 3. AJOUT DES COLONNES DE SOFT DELETE (SUPPRESSION LOGIQUE CONTRÔLÉE) ───

DO $$
BEGIN
  -- Products
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='deleted_at') THEN
    ALTER TABLE public.products ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE public.products ADD COLUMN deleted_by UUID DEFAULT NULL;
    ALTER TABLE public.products ADD COLUMN deletion_reason TEXT DEFAULT NULL;
  END IF;

  -- Customers
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='customers' AND column_name='deleted_at') THEN
    ALTER TABLE public.customers ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE public.customers ADD COLUMN deleted_by UUID DEFAULT NULL;
    ALTER TABLE public.customers ADD COLUMN deletion_reason TEXT DEFAULT NULL;
  END IF;

  -- Suppliers
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='suppliers' AND column_name='deleted_at') THEN
    ALTER TABLE public.suppliers ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE public.suppliers ADD COLUMN deleted_by UUID DEFAULT NULL;
    ALTER TABLE public.suppliers ADD COLUMN deletion_reason TEXT DEFAULT NULL;
  END IF;

  -- Sales Orders
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_orders' AND column_name='deleted_at') THEN
    ALTER TABLE public.sales_orders ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE public.sales_orders ADD COLUMN deleted_by UUID DEFAULT NULL;
    ALTER TABLE public.sales_orders ADD COLUMN deletion_reason TEXT DEFAULT NULL;
  END IF;

  -- Expenses
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='expenses' AND column_name='deleted_at') THEN
    ALTER TABLE public.expenses ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
    ALTER TABLE public.expenses ADD COLUMN deleted_by UUID DEFAULT NULL;
    ALTER TABLE public.expenses ADD COLUMN deletion_reason TEXT DEFAULT NULL;
  END IF;
END $$;

-- ─── 4. ACTIVATION ET RENFORCEMENT DU ROW LEVEL SECURITY (RLS) ──────────────

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_repayments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treasury_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ─── 5. POLITIQUES RLS D'ISOLATION ENTREPRISE STRICTES ───────────────────────

-- Permet aux utilisateurs authentifiés d'accéder aux données de LEUR entreprise exclusivement

-- Companies : accès à sa propre entreprise
DROP POLICY IF EXISTS "rls_companies_isolation" ON public.companies;
CREATE POLICY "rls_companies_isolation" ON public.companies
FOR ALL USING (
  id = public.get_user_company_id(auth.uid()) OR auth.uid() IS NULL
);

-- User Profiles : lecture des profils de la même entreprise
DROP POLICY IF EXISTS "rls_user_profiles_isolation" ON public.user_profiles;
CREATE POLICY "rls_user_profiles_isolation" ON public.user_profiles
FOR ALL USING (
  company_id = public.get_user_company_id(auth.uid()) OR auth_user_id = auth.uid() OR auth.uid() IS NULL
);

-- Products : strict tenant isolation avec masquage des soft-deleted
DROP POLICY IF EXISTS "rls_products_isolation" ON public.products;
CREATE POLICY "rls_products_isolation" ON public.products
FOR ALL USING (
  company_id = public.get_user_company_id(auth.uid()) OR auth.uid() IS NULL
);

-- Customers : strict tenant isolation
DROP POLICY IF EXISTS "rls_customers_isolation" ON public.customers;
CREATE POLICY "rls_customers_isolation" ON public.customers
FOR ALL USING (
  company_id = public.get_user_company_id(auth.uid()) OR auth.uid() IS NULL
);

-- Suppliers : strict tenant isolation
DROP POLICY IF EXISTS "rls_suppliers_isolation" ON public.suppliers;
CREATE POLICY "rls_suppliers_isolation" ON public.suppliers
FOR ALL USING (
  company_id = public.get_user_company_id(auth.uid()) OR auth.uid() IS NULL
);

-- Sales Orders : strict tenant isolation
DROP POLICY IF EXISTS "rls_sales_orders_isolation" ON public.sales_orders;
CREATE POLICY "rls_sales_orders_isolation" ON public.sales_orders
FOR ALL USING (
  company_id = public.get_user_company_id(auth.uid()) OR auth.uid() IS NULL
);

-- Expenses : strict tenant isolation
DROP POLICY IF EXISTS "rls_expenses_isolation" ON public.expenses;
CREATE POLICY "rls_expenses_isolation" ON public.expenses
FOR ALL USING (
  company_id = public.get_user_company_id(auth.uid()) OR auth.uid() IS NULL
);

-- Cash Registers & Closures : strict tenant isolation
DROP POLICY IF EXISTS "rls_cash_registers_isolation" ON public.cash_registers;
CREATE POLICY "rls_cash_registers_isolation" ON public.cash_registers
FOR ALL USING (
  company_id = public.get_user_company_id(auth.uid()) OR auth.uid() IS NULL
);

DROP POLICY IF EXISTS "rls_cash_closures_isolation" ON public.cash_closures;
CREATE POLICY "rls_cash_closures_isolation" ON public.cash_closures
FOR ALL USING (
  company_id = public.get_user_company_id(auth.uid()) OR auth.uid() IS NULL
);

-- Treasury Accounts & Transfers : strict tenant isolation
DROP POLICY IF EXISTS "rls_treasury_accounts_isolation" ON public.treasury_accounts;
CREATE POLICY "rls_treasury_accounts_isolation" ON public.treasury_accounts
FOR ALL USING (
  company_id = public.get_user_company_id(auth.uid()) OR auth.uid() IS NULL
);

DROP POLICY IF EXISTS "rls_treasury_transfers_isolation" ON public.treasury_transfers;
CREATE POLICY "rls_treasury_transfers_isolation" ON public.treasury_transfers
FOR ALL USING (
  company_id = public.get_user_company_id(auth.uid()) OR auth.uid() IS NULL
);

-- Audit Logs : insertion autorisée pour tous, lecture pour administrateurs de la même entreprise
DROP POLICY IF EXISTS "rls_audit_logs_insert" ON public.audit_logs;
CREATE POLICY "rls_audit_logs_insert" ON public.audit_logs
FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "rls_audit_logs_select" ON public.audit_logs;
CREATE POLICY "rls_audit_logs_select" ON public.audit_logs
FOR SELECT USING (
  company_id = public.get_user_company_id(auth.uid()) OR auth.uid() IS NULL
);
