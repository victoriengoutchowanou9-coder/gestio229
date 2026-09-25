-- ==============================================================================
-- M014 : ARCHITECTURE SAAS MULTI-SECTEURS & WORKSPACES LOGIQUES (RLS)
-- GESTIO 229 ERP — Stack : PostgreSQL / Supabase
-- Hiérarchie : TENANT (Company) -> SECTEUR -> WORKSPACE -> DONNÉES DU SECTEUR
-- Migration additive et rétrocompatible — Aucune suppression de données
-- ==============================================================================

-- 1. EXTENSIONS REQUISES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLE DES ESPACES DE TRAVAIL (WORKSPACES)
-- Chaque entreprise possède un ou plusieurs espaces métiers (ex: Poissonnerie, Quincaillerie...)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
    sector_slug VARCHAR(100) NOT NULL, -- 'poissonnerie', 'quincaillerie', 'boutique', etc.
    name VARCHAR(255) NOT NULL,        -- 'POISSONNERIE DIEU FERA', 'QUINCAILLERIE DUMONT', etc.
    location VARCHAR(255) DEFAULT 'Cotonou',
    manager_name VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE' | 'SUSPENDUE' | 'ARCHIVEE'
    currency VARCHAR(10) DEFAULT 'FCFA',
    configuration JSONB DEFAULT '{}'::jsonb,
    is_default BOOLEAN DEFAULT false,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour performances multi-tenant
CREATE INDEX IF NOT EXISTS idx_workspaces_company ON workspaces(company_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_sector_slug ON workspaces(sector_slug);
CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);

-- ==============================================================================
-- 3. AJOUT DES COLONNES workspace_id ET sector_slug SUR LES TABLES OPÉRATIONNELLES
-- ==============================================================================

-- Table des produits
ALTER TABLE products 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);

-- Catégories de produits
ALTER TABLE product_categories 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);

-- Ventes et lignes de commandes
ALTER TABLE sales_orders 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);

ALTER TABLE sales_order_items 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Stocks et mouvements
ALTER TABLE stock_levels 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE stock_movements 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);

ALTER TABLE stock_locations 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

ALTER TABLE stock_transfers 
    ADD COLUMN IF NOT EXISTS from_workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS to_workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL;

-- Caisses et sessions de caisse
ALTER TABLE cash_registers 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);

ALTER TABLE cash_sessions 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Dépenses et charges
ALTER TABLE expenses 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);

-- Achats fournisseurs
ALTER TABLE purchase_orders 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);

ALTER TABLE purchase_receipts 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE;

-- Clients et créances
ALTER TABLE customers 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);

-- Comptabilité SYSCOHADA et audit
ALTER TABLE accounting_entries 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);

ALTER TABLE audit_logs 
    ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);

-- Index pour filtres par workspace
CREATE INDEX IF NOT EXISTS idx_products_workspace ON products(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_workspace ON sales_orders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_workspace ON cash_sessions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_expenses_workspace ON expenses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_stock_levels_workspace ON stock_levels(workspace_id);

-- ==============================================================================
-- 4. FONCTIONS HELPER SUPABASE AUTH & CONTEXTE WORKSPACE
-- ==============================================================================

-- Récupération du workspace actif depuis le JWT ou les claims de session
CREATE OR REPLACE FUNCTION auth.current_workspace_id() RETURNS UUID AS $$
BEGIN
  RETURN COALESCE(
    NULLIF(current_setting('request.jwt.claim.workspace_id', true), '')::UUID,
    (auth.jwt() -> 'app_metadata' ->> 'workspace_id')::UUID,
    (auth.jwt() -> 'user_metadata' ->> 'current_workspace_id')::UUID,
    NULL
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Vérification des droits d'un utilisateur sur un workspace donné
CREATE OR REPLACE FUNCTION auth.has_workspace_access(p_workspace_id UUID) RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_company_id UUID;
  v_is_super_admin BOOLEAN;
  v_allowed_workspaces UUID[];
BEGIN
  -- Si super admin système, accès total
  IF (auth.jwt() -> 'app_metadata' ->> 'is_platform_admin')::BOOLEAN = true THEN
    RETURN true;
  END IF;

  -- Obtenir profil utilisateur
  SELECT company_id, is_super_admin, allowed_sites
  INTO v_company_id, v_is_super_admin, v_allowed_workspaces
  FROM user_profiles
  WHERE id = v_user_id;

  -- Vérifier que le workspace appartient à l'entreprise de l'utilisateur
  IF NOT EXISTS (
    SELECT 1 FROM workspaces 
    WHERE id = p_workspace_id AND company_id = v_company_id
  ) THEN
    RETURN false;
  END IF;

  -- Si administrateur ou gérant général de l'entreprise : accès à tous les workspaces de sa société
  IF v_is_super_admin = true OR (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'gerant') THEN
    RETURN true;
  END IF;

  -- Si l'utilisateur a une liste restreinte de workspaces assignés
  IF v_allowed_workspaces IS NOT NULL AND array_length(v_allowed_workspaces, 1) > 0 THEN
    RETURN p_workspace_id = ANY(v_allowed_workspaces);
  END IF;

  -- Par défaut : accès accordé si même entreprise
  RETURN true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ==============================================================================
-- 5. POLITIQUES ROW LEVEL SECURITY (RLS) ÉTANCHES
-- ==============================================================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

-- WORKSPACES : Lecture et écriture strictement limitées à l'entreprise
DROP POLICY IF EXISTS "workspaces_company_isolation" ON workspaces;
CREATE POLICY "workspaces_company_isolation" ON workspaces
    FOR ALL
    USING (
      company_id = auth.company_id() 
      OR (auth.jwt() -> 'app_metadata' ->> 'is_platform_admin')::BOOLEAN = true
    );

-- PRODUCTS : Isolation stricte par workspace (ou tous les workspaces de l'entreprise pour l'admin)
DROP POLICY IF EXISTS "products_workspace_isolation" ON products;
CREATE POLICY "products_workspace_isolation" ON products
    FOR ALL
    USING (
      company_id = auth.company_id() AND (
        workspace_id IS NULL OR 
        workspace_id = auth.current_workspace_id() OR
        auth.has_workspace_access(workspace_id)
      )
    );

-- SALES_ORDERS : Isolation des ventes
DROP POLICY IF EXISTS "sales_orders_workspace_isolation" ON sales_orders;
CREATE POLICY "sales_orders_workspace_isolation" ON sales_orders
    FOR ALL
    USING (
      company_id = auth.company_id() AND (
        workspace_id IS NULL OR 
        workspace_id = auth.current_workspace_id() OR
        auth.has_workspace_access(workspace_id)
      )
    );

-- EXPENSES : Isolation des dépenses
DROP POLICY IF EXISTS "expenses_workspace_isolation" ON expenses;
CREATE POLICY "expenses_workspace_isolation" ON expenses
    FOR ALL
    USING (
      company_id = auth.company_id() AND (
        workspace_id IS NULL OR 
        workspace_id = auth.current_workspace_id() OR
        auth.has_workspace_access(workspace_id)
      )
    );

-- CASH_SESSIONS : Isolation des caisses
DROP POLICY IF EXISTS "cash_sessions_workspace_isolation" ON cash_sessions;
CREATE POLICY "cash_sessions_workspace_isolation" ON cash_sessions
    FOR ALL
    USING (
      company_id = auth.company_id() AND (
        workspace_id IS NULL OR 
        workspace_id = auth.current_workspace_id() OR
        auth.has_workspace_access(workspace_id)
      )
    );

-- STOCK_LEVELS : Isolation des niveaux de stock
DROP POLICY IF EXISTS "stock_levels_workspace_isolation" ON stock_levels;
CREATE POLICY "stock_levels_workspace_isolation" ON stock_levels
    FOR ALL
    USING (
      company_id = auth.company_id() AND (
        workspace_id IS NULL OR 
        workspace_id = auth.current_workspace_id() OR
        auth.has_workspace_access(workspace_id)
      )
    );

-- ==============================================================================
-- 6. MIGRATION AUTOMATIQUE DES DONNÉES PRÉEXISTANTES VERS LE WORKSPACE PAR DÉFAUT
-- Garantit zéro perte de données existantes
-- ==============================================================================
DO $$
DECLARE
  comp RECORD;
  default_ws_id UUID;
BEGIN
  FOR comp IN SELECT id, name FROM companies LOOP
    -- Vérifier si un workspace par défaut existe pour cette entreprise
    SELECT id INTO default_ws_id FROM workspaces WHERE company_id = comp.id AND is_default = true LIMIT 1;
    
    IF default_ws_id IS NULL THEN
      -- Créer le workspace par défaut pour l'entreprise
      INSERT INTO workspaces (company_id, sector_slug, name, location, is_default, status)
      VALUES (comp.id, 'boutique', comp.name || ' - Espace Principal', 'Cotonou', true, 'ACTIVE')
      RETURNING id INTO default_ws_id;
    END IF;

    -- Rattacher les données existantes sans workspace_id à ce workspace par défaut
    UPDATE products SET workspace_id = default_ws_id WHERE company_id = comp.id AND workspace_id IS NULL;
    UPDATE sales_orders SET workspace_id = default_ws_id WHERE company_id = comp.id AND workspace_id IS NULL;
    UPDATE expenses SET workspace_id = default_ws_id WHERE company_id = comp.id AND workspace_id IS NULL;
    UPDATE cash_sessions SET workspace_id = default_ws_id WHERE company_id = comp.id AND workspace_id IS NULL;
    UPDATE stock_levels SET workspace_id = default_ws_id WHERE company_id = comp.id AND workspace_id IS NULL;
  END LOOP;
END $$;
