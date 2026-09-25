-- ==============================================================================
-- GESTIO 229 ERP - BASE DE DONNÉES POSTGRESQL / SUPABASE (V3.0 RECETTE COMPLÈTE)
-- Slogan : Votre gestion, au standard du Bénin
-- Version : 3.0 Entreprise | Date : 05 Septembre 2026 | Marché : Bénin & UEMOA
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. ENTREPRISES (Boutique & Restaurant)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    legal_form VARCHAR(50) DEFAULT 'SARL',
    ifu_number VARCHAR(50) NOT NULL,
    rccm_number VARCHAR(100),
    regime_fiscal VARCHAR(100) DEFAULT 'Régime Réel Simplifié (RRS)',
    address TEXT,
    city VARCHAR(100) DEFAULT 'Cotonou',
    country VARCHAR(100) DEFAULT 'Bénin',
    phone VARCHAR(50),
    email VARCHAR(100),
    currency VARCHAR(10) DEFAULT 'FCFA',
    tva_default_rate NUMERIC(5,2) DEFAULT 18.00,
    aib_default_rate NUMERIC(5,2) DEFAULT 1.00,
    active_sector VARCHAR(50) DEFAULT 'boutique',
    e_mecef_active BOOLEAN DEFAULT true,
    e_mecef_nim VARCHAR(50) DEFAULT 'BENIN-DGI-EMEF-2026-001',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 2. UTILISATEURS & PERMISSIONS (RBAC)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    auth_user_id UUID,
    full_name VARCHAR(255) NOT NULL,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT,
    phone VARCHAR(50),
    role VARCHAR(50) NOT NULL DEFAULT 'caissier', -- super_admin, gerant, caissier, magasinier, comptable
    pos_pin_code VARCHAR(10) DEFAULT '1234',
    is_active BOOLEAN DEFAULT true,
    permissions JSONB NOT NULL,
    last_login TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 3. CATÉGORIES & 20 PRODUITS DE TEST
-- ==============================================================================
CREATE TABLE IF NOT EXISTS product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50),
    description TEXT,
    icon VARCHAR(50) DEFAULT 'Package',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    code VARCHAR(50) NOT NULL,
    barcode VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    unit VARCHAR(50) DEFAULT 'Unité',
    cost_price NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    selling_price NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    wholesale_price NUMERIC(15,2) DEFAULT 0.00,
    vip_price NUMERIC(15,2) DEFAULT 0.00,
    tva_rate NUMERIC(5,2) DEFAULT 18.00,
    is_taxable BOOLEAN DEFAULT true,
    min_stock_alert NUMERIC(15,2) DEFAULT 5.00,
    sector_meta JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 4. TIERS : 5 CLIENTS & 2 FOURNISSEURS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS customer_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    discount_percentage NUMERIC(5,2) DEFAULT 0.00,
    price_tier VARCHAR(50) DEFAULT 'selling_price',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    group_id UUID REFERENCES customer_groups(id) ON DELETE SET NULL,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    ifu_number VARCHAR(50),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(150),
    address TEXT,
    city VARCHAR(100) DEFAULT 'Cotonou',
    credit_limit NUMERIC(15,2) DEFAULT 0.00,
    current_debt NUMERIC(15,2) DEFAULT 0.00,
    payment_terms_days INT DEFAULT 30,
    whatsapp_enabled BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    company_name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(150),
    ifu_number VARCHAR(50),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(150),
    address TEXT,
    city VARCHAR(100) DEFAULT 'Cotonou',
    country VARCHAR(100) DEFAULT 'Bénin',
    current_payable NUMERIC(15,2) DEFAULT 0.00,
    payment_terms_days INT DEFAULT 30,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 5. DOUBLE STOCK (MAGASIN / VENTE) & INVENTAIRES
-- ==============================================================================
CREATE TABLE IF NOT EXISTS stock_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    type VARCHAR(50) NOT NULL, -- magasin, vente
    address TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_levels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    location_id UUID REFERENCES stock_locations(id) ON DELETE CASCADE,
    quantity NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(product_id, location_id)
);

CREATE TABLE IF NOT EXISTS stock_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    transfer_number VARCHAR(50) NOT NULL,
    source_location_id UUID REFERENCES stock_locations(id),
    destination_location_id UUID REFERENCES stock_locations(id),
    requested_by UUID REFERENCES user_profiles(id),
    approved_by UUID REFERENCES user_profiles(id),
    status VARCHAR(50) DEFAULT 'valide',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    location_id UUID REFERENCES stock_locations(id),
    user_id UUID REFERENCES user_profiles(id),
    movement_type VARCHAR(50) NOT NULL,
    reference_type VARCHAR(50),
    reference_id UUID,
    reference_number VARCHAR(100),
    quantity NUMERIC(15,2) NOT NULL,
    previous_stock NUMERIC(15,2) NOT NULL,
    new_stock NUMERIC(15,2) NOT NULL,
    unit_cost NUMERIC(15,2) DEFAULT 0.00,
    total_cost NUMERIC(15,2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    inventory_number VARCHAR(50) NOT NULL,
    location_id UUID REFERENCES stock_locations(id),
    created_by UUID REFERENCES user_profiles(id),
    validated_by UUID REFERENCES user_profiles(id),
    status VARCHAR(50) DEFAULT 'en_cours',
    total_theoretical_value NUMERIC(15,2) DEFAULT 0.00,
    total_physical_value NUMERIC(15,2) DEFAULT 0.00,
    total_discrepancy_value NUMERIC(15,2) DEFAULT 0.00,
    notes TEXT,
    validated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_id UUID REFERENCES inventory_sessions(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    theoretical_qty NUMERIC(15,2) NOT NULL,
    physical_qty NUMERIC(15,2) NOT NULL,
    discrepancy_qty NUMERIC(15,2) GENERATED ALWAYS AS (physical_qty - theoretical_qty) STORED,
    unit_cost NUMERIC(15,2) NOT NULL,
    discrepancy_value NUMERIC(15,2) GENERATED ALWAYS AS ((physical_qty - theoretical_qty) * unit_cost) STORED,
    notes TEXT
);

-- ==============================================================================
-- 6. ACHATS (BC ➔ BL ➔ FACTURE)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES suppliers(id),
    order_number VARCHAR(50) NOT NULL,
    order_date DATE DEFAULT CURRENT_DATE,
    expected_delivery_date DATE,
    status VARCHAR(50) DEFAULT 'valide',
    subtotal NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    tva_amount NUMERIC(15,2) DEFAULT 0.00,
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    advance_paid NUMERIC(15,2) DEFAULT 0.00,
    magasinier_signature TEXT,
    gerant_signature TEXT,
    notes TEXT,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES suppliers(id),
    receipt_number VARCHAR(50) NOT NULL,
    supplier_bl_ref VARCHAR(100),
    receipt_date DATE DEFAULT CURRENT_DATE,
    target_location_id UUID REFERENCES stock_locations(id),
    status VARCHAR(50) DEFAULT 'valide',
    received_by UUID REFERENCES user_profiles(id),
    signed_bl_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 7. CAISSES POS & TRÉSORERIE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS cash_registers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    location_id UUID REFERENCES stock_locations(id),
    current_cash_balance NUMERIC(15,2) DEFAULT 0.00,
    current_momo_balance NUMERIC(15,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    cash_register_id UUID REFERENCES cash_registers(id),
    cashier_id UUID REFERENCES user_profiles(id),
    opened_at TIMESTAMPTZ DEFAULT now(),
    closed_at TIMESTAMPTZ,
    opening_cash NUMERIC(15,2) DEFAULT 0.00,
    opening_momo NUMERIC(15,2) DEFAULT 0.00,
    total_sales_cash NUMERIC(15,2) DEFAULT 0.00,
    total_sales_momo NUMERIC(15,2) DEFAULT 0.00,
    total_sales_credit NUMERIC(15,2) DEFAULT 0.00,
    total_credit_collected NUMERIC(15,2) DEFAULT 0.00,
    total_expenses NUMERIC(15,2) DEFAULT 0.00,
    total_transferred_to_treasury NUMERIC(15,2) DEFAULT 0.00,
    closing_cash_counted NUMERIC(15,2),
    closing_momo_counted NUMERIC(15,2),
    cash_discrepancy NUMERIC(15,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'ouverte',
    closing_notes TEXT,
    email_report_sent BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS treasury_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    account_number VARCHAR(100),
    balance NUMERIC(15,2) DEFAULT 0.00,
    syscohada_code VARCHAR(50) DEFAULT '521000',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
    treasury_account_id UUID REFERENCES treasury_accounts(id) ON DELETE SET NULL,
    expense_number VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    beneficiary VARCHAR(255),
    amount NUMERIC(15,2) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    syscohada_account VARCHAR(50) DEFAULT '605000',
    notes TEXT,
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 8. VENTES, CRÉANCES & AVOIRS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    cash_session_id UUID REFERENCES cash_sessions(id) ON DELETE SET NULL,
    order_number VARCHAR(50) NOT NULL,
    order_type VARCHAR(50) DEFAULT 'pos_direct',
    order_date DATE DEFAULT CURRENT_DATE,
    subtotal_ht NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    tva_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    aib_amount NUMERIC(15,2) DEFAULT 0.00,
    total_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    total_cost NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    gross_margin NUMERIC(15,2) GENERATED ALWAYS AS (total_amount - tva_amount - total_cost) STORED,
    paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    credit_amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    due_date DATE,
    payment_status VARCHAR(50) DEFAULT 'paye',
    e_mecef_uid VARCHAR(100),
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales_order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    quantity NUMERIC(15,2) NOT NULL,
    unit_price NUMERIC(15,2) NOT NULL,
    unit_cost NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    tva_rate NUMERIC(5,2) DEFAULT 18.00,
    total_ht NUMERIC(15,2) NOT NULL,
    total_ttc NUMERIC(15,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    original_order_id UUID REFERENCES sales_orders(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES customers(id),
    credit_note_number VARCHAR(50) NOT NULL,
    date DATE DEFAULT CURRENT_DATE,
    reason TEXT NOT NULL,
    subtotal_ht NUMERIC(15,2) NOT NULL,
    tva_amount NUMERIC(15,2) NOT NULL,
    total_amount NUMERIC(15,2) NOT NULL,
    refund_method VARCHAR(50) DEFAULT 'avoir_credit',
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 9. COMPTABILITÉ SYSCOHADA RÉVISÉ & AUDIT
-- ==============================================================================
CREATE TABLE IF NOT EXISTS syscohada_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    account_class INT NOT NULL,
    account_type VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, code)
);

CREATE TABLE IF NOT EXISTS accounting_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    journal_code VARCHAR(10) NOT NULL, -- VT, AC, CA, MM, BQ, OD
    piece_ref VARCHAR(100) NOT NULL,
    entry_date DATE DEFAULT CURRENT_DATE,
    account_code VARCHAR(50) NOT NULL,
    account_name VARCHAR(255),
    label VARCHAR(255) NOT NULL,
    debit NUMERIC(15,2) DEFAULT 0.00,
    credit NUMERIC(15,2) DEFAULT 0.00,
    lettering VARCHAR(20),
    created_by UUID REFERENCES user_profiles(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    user_name VARCHAR(150),
    action VARCHAR(100) NOT NULL,
    entity_name VARCHAR(100) NOT NULL,
    entity_id UUID,
    details JSONB,
    ip_address VARCHAR(50) DEFAULT '127.0.0.1',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 10. JEU DE DONNÉES DE RECETTE (2 ENTREPRISES, 20 PRODUITS, 5 CLIENTS, 2 FOURNISSEURS, 4 USERS)
-- ==============================================================================

-- 1. Entreprise 1 : Boutique Test & Entreprise 2 : Restaurant Test
INSERT INTO companies (id, name, legal_form, ifu_number, rccm_number, address, city, phone, email, active_sector)
VALUES 
('11111111-1111-1111-1111-111111111111', 'GESTIO 229 BOUTIQUE TEST', 'SARL', '3202612345678', 'RB/COT/26 B 12345', 'Avenue Clozel, Ganhi', 'Cotonou', '+229 01 97 00 00 01', 'boutique@test.bj', 'boutique'),
('22222222-2222-2222-2222-222222222222', 'LE MAQUIS 229 RESTAURANT TEST', 'SARL', '3202698765432', 'RB/COT/26 B 98765', 'Boulevard de la Marina, Haie Vive', 'Cotonou', '+229 01 95 00 00 02', 'restaurant@test.bj', 'restaurant')
ON CONFLICT DO NOTHING;

-- 2. Utilisateurs de test (Admin, Gérant, Caissier, Magasinier)
INSERT INTO user_profiles (id, company_id, full_name, username, email, password_hash, role, permissions)
VALUES 
('00000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Super Administrateur Bénin', 'admin', 'admin@test.bj', '123456', 'super_admin', '{"commercial": true, "stock": true, "purchases": true, "treasury": true, "hr": true, "accounting": true, "reporting": true, "admin": true}'::jsonb),
('00000001-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Gérant de Magasin Test', 'gerant', 'gerant@test.bj', '123456', 'gerant', '{"commercial": true, "stock": true, "purchases": true, "treasury": true, "hr": true, "accounting": true, "reporting": true, "admin": false}'::jsonb),
('00000001-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Caissière Test (Limité)', 'caissier', 'caissier@test.bj', '123456', 'caissier', '{"commercial": true, "stock": false, "purchases": false, "treasury": true, "hr": false, "accounting": false, "reporting": false, "admin": false}'::jsonb),
('00000001-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Magasinier Test', 'magasinier', 'magasinier@test.bj', '123456', 'magasinier', '{"commercial": false, "stock": true, "purchases": true, "treasury": false, "hr": false, "accounting": false, "reporting": false, "admin": false}'::jsonb)
ON CONFLICT DO NOTHING;

-- 3. Emplacements de stock (2 Entrepôts : Magasin Principal vs Stock Vente POS)
INSERT INTO stock_locations (id, company_id, name, code, type, is_default)
VALUES 
('00000002-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Stock Magasin (Entrepôt Réserve)', 'MAGASIN_RESERVE', 'magasin', true),
('00000002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Stock Vente (Rayon Caisse POS)', 'STOCK_VENTE_POS', 'vente', false)
ON CONFLICT DO NOTHING;

-- 4. 3 Catégories
INSERT INTO product_categories (id, company_id, name, code)
VALUES 
('00000003-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alimentation & Boissons', 'ALIM'),
('00000003-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Textile & Confection', 'TEXT'),
('00000003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Électronique & Équipements', 'ELEC')
ON CONFLICT DO NOTHING;

-- 5. 20 Produits de test complets
INSERT INTO products (id, company_id, category_id, code, barcode, name, unit, cost_price, selling_price, wholesale_price, vip_price)
VALUES 
('00000004-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000001', 'PRD-001', '615110000001', 'Riz Parfumé 25kg (Bénin)', 'Sac', 18500, 22000, 20500, 21000),
('00000004-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000001', 'PRD-002', '615110000002', 'Huile Végétale 5 Litres', 'Bidon', 5500, 7000, 6500, 6800),
('00000004-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000001', 'PRD-003', '615110000003', 'Pack Eau Possotomè 1.5L x6', 'Pack', 2200, 3000, 2700, 2800),
('00000004-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000001', 'PRD-004', '615110000004', 'Sucre Blanc en Morceaux 1kg', 'Paquet', 800, 1100, 1000, 1050),
('00000004-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000001', 'PRD-005', '615110000005', 'Lait Concentré Sucré Bonnet Rouge', 'Boîte', 650, 900, 800, 850),
('00000004-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000001', 'PRD-006', '615110000006', 'Farine de Blé 50kg Grands Moulins', 'Sac', 21000, 25000, 23500, 24000),
('00000004-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000001', 'PRD-007', '615110000007', 'Café Moulu Bénin 250g', 'Paquet', 1500, 2200, 1900, 2000),
('00000004-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000002', 'PRD-008', '615110000008', 'Pagne Vlisco Hollandais 6 Yards', 'Pièce', 38000, 48000, 44000, 46000),
('00000004-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000002', 'PRD-009', '615110000009', 'Pagne Uniwax Woodin 6 Yards', 'Pièce', 22000, 28000, 26000, 27000),
('00000004-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000002', 'PRD-010', '615110000010', 'Chemise Manches Longues Homme', 'Unité', 8500, 13000, 11500, 12000),
('00000004-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000002', 'PRD-011', '615110000011', 'Robe Soirée Wax Moderne', 'Unité', 15000, 24000, 21000, 22500),
('00000004-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000002', 'PRD-012', '615110000012', 'Chaussures Cuir Ville Homme', 'Paire', 18000, 28000, 25000, 26500),
('00000004-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000002', 'PRD-013', '615110000013', 'T-Shirt Coton Bio Bénin', 'Unité', 3500, 6000, 5000, 5500),
('00000004-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000003', 'PRD-014', '615110000014', 'Smartphone Tecno Spark 20 Pro', 'Unité', 72000, 89000, 84000, 86000),
('00000004-0000-0000-0000-000000000015', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000003', 'PRD-015', '615110000015', 'Téléviseur Smart LED 43 Pouces', 'Unité', 115000, 145000, 135000, 140000),
('00000004-0000-0000-0000-000000000016', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000003', 'PRD-016', '615110000016', 'Ventilateur Rechargeable Solaire', 'Unité', 24000, 32000, 29000, 30500),
('00000004-0000-0000-0000-000000000017', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000003', 'PRD-017', '615110000017', 'Multiprise Parasurtenseur 6 Prises', 'Unité', 4500, 7500, 6500, 7000),
('00000004-0000-0000-0000-000000000018', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000003', 'PRD-018', '615110000018', 'Fer à Repasser Vapeur Philips', 'Unité', 12000, 17500, 15500, 16500),
('00000004-0000-0000-0000-000000000019', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000003', 'PRD-019', '615110000019', 'Écouteurs Sans Fil Bluetooth', 'Paire', 6500, 11000, 9500, 10000),
('00000004-0000-0000-0000-000000000020', '11111111-1111-1111-1111-111111111111', '00000003-0000-0000-0000-000000000003', 'PRD-020', '615110000020', 'Batterie Externe Powerbank 20000mAh', 'Unité', 9500, 15000, 13000, 14000)
ON CONFLICT DO NOTHING;

-- 6. 5 Clients de test
INSERT INTO customers (id, company_id, code, name, ifu_number, phone, email, address, credit_limit, current_debt)
VALUES 
('00000005-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CLI-001', 'ETS BIO BÉNIN & FILS', '3201999888777', '+229 97 10 20 30', 'contact@biobenin.bj', 'Dantokpa, Cotonou', 3000000, 0),
('00000005-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'CLI-002', 'SOCIÉTÉ AGOS DISTRIBUTION', '3201888777666', '+229 95 40 50 60', 'agos@distrib.bj', 'Akpakpa, Cotonou', 5000000, 0),
('00000005-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'CLI-003', 'M. KOUASSI Jean (Particulier VIP)', '3202111222333', '+229 96 70 80 90', 'kouassi@gmail.com', 'Cadjehoun, Cotonou', 1000000, 10000),
('00000005-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'CLI-004', 'PHARMACIE DE L ETOILE', '3201444555666', '+229 21 30 15 20', 'etoile@pharma.bj', 'Saint-Michel, Cotonou', 2000000, 0),
('00000005-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'CLI-005', 'HÔTEL DU LAC COTONOU', '3201333222111', '+229 21 33 44 55', 'hotel@dulac.bj', 'Plage, Cotonou', 4000000, 0)
ON CONFLICT DO NOTHING;

-- 7. 2 Fournisseurs de test
INSERT INTO suppliers (id, company_id, code, company_name, contact_person, ifu_number, phone, email, city, current_payable)
VALUES 
('00000006-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'FOURN-001', 'IMPORT-EXPORT BÉNIN SÀRL', 'M. SOSSOU Bernard', '3201888999000', '+229 97 88 77 66', 'contact@importbenin.bj', 'Cotonou', 0),
('00000006-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'FOURN-002', 'GRANDS MOULINS DU BÉNIN SA', 'Direction Commerciale', '3201555666777', '+229 21 30 40 50', 'ventes@gmb.bj', 'Cotonou', 0)
ON CONFLICT DO NOTHING;

-- ==============================================================================
-- 8. MODULE BON DE COMMANDE PRO (BC) & RÈGLE B.1 (UCD)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS bons_commande (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) NOT NULL UNIQUE,
    fournisseur_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    fournisseur_nom VARCHAR(255) NOT NULL,
    date_commande DATE NOT NULL DEFAULT CURRENT_DATE,
    date_livraison_prevue DATE,
    statut VARCHAR(50) NOT NULL DEFAULT 'En attente Signature Gestionnaire',
    total_ttc NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bons_commande_ref ON bons_commande(reference);
CREATE INDEX IF NOT EXISTS idx_bons_commande_statut ON bons_commande(statut);

CREATE TABLE IF NOT EXISTS bc_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bc_id UUID NOT NULL REFERENCES bons_commande(id) ON DELETE CASCADE,
    produit_id UUID REFERENCES products(id) ON DELETE SET NULL,
    code_produit VARCHAR(50) NOT NULL,
    nom_produit VARCHAR(255) NOT NULL,
    ucd VARCHAR(50) NOT NULL DEFAULT 'Carton',
    stock_actuel_ucd NUMERIC(15,2) DEFAULT 0.00,
    qte_commande NUMERIC(15,2) NOT NULL CHECK (qte_commande > 0),
    qte_recue NUMERIC(15,2) DEFAULT 0.00 CHECK (qte_recue >= 0),
    pu_ttc NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (pu_ttc >= 0),
    total_ligne NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bc_lignes_bc ON bc_lignes(bc_id);

CREATE TABLE IF NOT EXISTS signatures_bc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bc_id UUID NOT NULL REFERENCES bons_commande(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL,
    signer_name VARCHAR(255) NOT NULL,
    signature_image_base64 TEXT NOT NULL,
    date_signature TIMESTAMPTZ DEFAULT now(),
    ip_address VARCHAR(50),
    CONSTRAINT chk_bc_role CHECK (role IN ('gestionnaire', 'directeur', 'magasinier'))
);

CREATE INDEX IF NOT EXISTS idx_signatures_bc ON signatures_bc(bc_id);

CREATE TABLE IF NOT EXISTS stock_magasin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produit_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    code_produit VARCHAR(50),
    stock_ucd NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    ucd VARCHAR(50) NOT NULL DEFAULT 'Carton',
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE bons_commande ENABLE ROW LEVEL SECURITY;
ALTER TABLE bc_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures_bc ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_magasin ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permettre lecture bons_commande" ON bons_commande FOR SELECT USING (true);
CREATE POLICY "Permettre insertion bons_commande" ON bons_commande FOR INSERT WITH CHECK (true);
CREATE POLICY "Permettre mise à jour bons_commande" ON bons_commande FOR UPDATE USING (true);

CREATE POLICY "Permettre lecture bc_lignes" ON bc_lignes FOR SELECT USING (true);
CREATE POLICY "Permettre insertion bc_lignes" ON bc_lignes FOR INSERT WITH CHECK (true);
CREATE POLICY "Permettre mise à jour bc_lignes" ON bc_lignes FOR UPDATE USING (true);

CREATE POLICY "Permettre lecture signatures_bc" ON signatures_bc FOR SELECT USING (true);
CREATE POLICY "Permettre insertion signatures_bc" ON signatures_bc FOR INSERT WITH CHECK (true);

CREATE POLICY "Permettre lecture stock_magasin" ON stock_magasin FOR SELECT USING (true);
CREATE POLICY "Permettre upsert stock_magasin" ON stock_magasin FOR ALL USING (true);

CREATE OR REPLACE FUNCTION receptionner_bc_maj_stock(
    p_bc_id UUID,
    p_magasinier_name VARCHAR,
    p_signature_base64 TEXT,
    p_lignes_recues JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bc RECORD;
    v_item JSONB;
    v_prod_id UUID;
    v_code VARCHAR;
    v_qte_recue NUMERIC(15,2);
    v_ucd VARCHAR;
BEGIN
    SELECT * INTO v_bc FROM bons_commande WHERE id = p_bc_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bon de Commande introuvable.');
    END IF;

    IF v_bc.statut <> 'Validé' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Statut non éligible à la réception: ' || v_bc.statut);
    END IF;

    INSERT INTO signatures_bc (bc_id, role, signer_name, signature_image_base64, date_signature)
    VALUES (p_bc_id, 'magasinier', COALESCE(p_magasinier_name, 'Magasinier'), p_signature_base64, now());

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_lignes_recues)
    LOOP
        v_prod_id := (v_item->>'produit_id')::UUID;
        v_code := v_item->>'code_produit';
        v_qte_recue := COALESCE((v_item->>'qte_recue')::NUMERIC, 0);
        v_ucd := COALESCE(v_item->>'ucd', 'Carton');

        UPDATE bc_lignes
        SET qte_recue = v_qte_recue
        WHERE bc_id = p_bc_id AND produit_id = v_prod_id;

        -- Règle B.1 : UPSERT stock_magasin en UCD
        INSERT INTO stock_magasin (produit_id, code_produit, stock_ucd, ucd, updated_at)
        VALUES (v_prod_id, v_code, v_qte_recue, v_ucd, now())
        ON CONFLICT (produit_id)
        DO UPDATE SET
            stock_ucd = stock_magasin.stock_ucd + EXCLUDED.stock_ucd,
            updated_at = now();
    END LOOP;

    UPDATE bons_commande SET statut = 'Réceptionné', updated_at = now() WHERE id = p_bc_id;

    RETURN jsonb_build_object('success', true, 'message', 'Bon de Commande ' || v_bc.reference || ' réceptionné en UCD.');
END;
$$;

-- ==============================================================================
-- PARTIE NOUVELLE : HUB CENTRAL & MULTI-ACTIVITÉS GESTIO 229 (SANS RÉGRESSION)
-- ==============================================================================

-- 1. CATALOGUE DES SECTEURS D ACTIVITE (15+ SECTEURS)
CREATE TABLE IF NOT EXISTS sectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) NOT NULL,
    emoji VARCHAR(10) NOT NULL,
    icon VARCHAR(50) NOT NULL,
    color VARCHAR(20) DEFAULT '#059669',
    badge VARCHAR(50),
    description TEXT,
    modules JSONB NOT NULL DEFAULT '["ventes", "stock", "caisse", "finances", "clients", "depenses", "rapports"]'::jsonb,
    specific_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ACTIVITES SOUSCRITES & CREEES PAR L ENTREPRISE DANS LE HUB (PARTIES 5, 6, 7, 9)
CREATE TABLE IF NOT EXISTS company_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(50) NOT NULL,
    sector_code VARCHAR(50) NOT NULL,
    activity_name VARCHAR(255) NOT NULL,
    pos_location VARCHAR(255) NOT NULL,  -- Lieu de l activite (PARTIE 6)
    manager_name VARCHAR(150),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDUE', 'ARCHIVEE')), -- PARTIE 9
    is_active BOOLEAN DEFAULT true,
    color VARCHAR(20),
    settings JSONB DEFAULT '{}'::jsonb,
    archived_at TIMESTAMPTZ,             -- Horodatage de l archivage lors de la suppression (PARTIE 9)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_activities_company ON company_activities(company_id);
CREATE INDEX IF NOT EXISTS idx_company_activities_sector ON company_activities(sector_slug);
CREATE INDEX IF NOT EXISTS idx_company_activities_status ON company_activities(status);

-- 3. CONSOLIDATION JOURNALIÈRE DU TABLEAU DE BORD HUB (TEMPS RÉEL)
CREATE TABLE IF NOT EXISTS activity_daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    sector_slug VARCHAR(50) NOT NULL,
    metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
    revenue NUMERIC(15,2) DEFAULT 0.00,       -- CA DU JOUR
    cogs NUMERIC(15,2) DEFAULT 0.00,          -- Coût marchandises vendues
    gross_margin NUMERIC(15,2) DEFAULT 0.00,  -- Marge brute = CA - COGS
    expenses NUMERIC(15,2) DEFAULT 0.00,      -- DÉPENSES DU JOUR
    net_margin NUMERIC(15,2) DEFAULT 0.00,    -- MARGE NETTE DU JOUR = Marge brute - Dépenses
    sales_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_activity_date UNIQUE (activity_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_activity_daily_metrics_date ON activity_daily_metrics(metric_date);

-- 4. CONSOLIDATION MENSUELLE DU TABLEAU DE BORD HUB (PARTIE 4 - SYNTHÈSE DU MOIS)
CREATE TABLE IF NOT EXISTS activity_monthly_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    sector_slug VARCHAR(50) NOT NULL,
    metric_month VARCHAR(7) NOT NULL,         -- Format 'YYYY-MM' (mois en cours automatique)
    revenue NUMERIC(15,2) DEFAULT 0.00,       -- CA DU MOIS
    cogs NUMERIC(15,2) DEFAULT 0.00,          -- Coût marchandises vendues du mois
    gross_margin NUMERIC(15,2) DEFAULT 0.00,  -- Marge brute du mois
    expenses NUMERIC(15,2) DEFAULT 0.00,      -- DÉPENSES DU MOIS
    net_margin NUMERIC(15,2) DEFAULT 0.00,    -- MARGE NETTE DU MOIS = Marge brute - Dépenses
    sales_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_activity_month UNIQUE (activity_id, metric_month)
);

CREATE INDEX IF NOT EXISTS idx_activity_monthly_metrics_month ON activity_monthly_metrics(metric_month);

-- ==============================================================================
-- TABLES SPÉCIFIQUES MÉTIERS (DONNÉES INITIALES VIDES POUR PRODUCTION RÉELLE)
-- ==============================================================================

-- [SECTEUR 1] POISSONNERIE & SURGELÉS (RÉFÉRENCE EXISTANTE CONSERVÉE)
CREATE TABLE IF NOT EXISTS poissonnerie_cold_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    room_name VARCHAR(100) NOT NULL,
    temperature_target NUMERIC(5,2) DEFAULT -18.00,
    current_temperature NUMERIC(5,2) DEFAULT -18.00,
    capacity_cartons INTEGER DEFAULT 0,
    last_defrost_date DATE,
    status VARCHAR(50) DEFAULT 'optimal',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS poissonnerie_avaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    loss_date DATE NOT NULL DEFAULT CURRENT_DATE,
    weight_kg NUMERIC(10,3) NOT NULL,
    reason VARCHAR(150),
    loss_amount NUMERIC(15,2) DEFAULT 0.00,
    declared_by VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- [SECTEUR 2] QUINCAILLERIE & MATÉRIAUX BTP (RÉFÉRENCE EXISTANTE CONSERVÉE)
CREATE TABLE IF NOT EXISTS quincaillerie_chantiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    chantier_name VARCHAR(255) NOT NULL,
    location TEXT,
    site_manager VARCHAR(150),
    phone VARCHAR(50),
    estimated_budget NUMERIC(15,2) DEFAULT 0.00,
    current_balance NUMERIC(15,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quincaillerie_livraisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chantier_id UUID REFERENCES quincaillerie_chantiers(id) ON DELETE CASCADE,
    bl_number VARCHAR(100) NOT NULL,
    delivery_date TIMESTAMPTZ DEFAULT now(),
    truck_registration VARCHAR(50),
    driver_name VARCHAR(100),
    status VARCHAR(50) DEFAULT 'livre',
    items JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- [SECTEUR 3] BOUTIQUE & COMMERCE GÉNÉRAL
CREATE TABLE IF NOT EXISTS boutique_variantes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    size VARCHAR(50),
    color VARCHAR(50),
    sku VARCHAR(100),
    additional_price NUMERIC(15,2) DEFAULT 0.00,
    stock_quantity NUMERIC(15,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- [SECTEUR 4] BRASSERIE & DÉPÔT DE BOISSONS
CREATE TABLE IF NOT EXISTS brasserie_casiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    casier_format VARCHAR(50) DEFAULT '24 Bouteilles',
    consigne_unit_price NUMERIC(15,2) DEFAULT 3000.00,
    stock_casiers_pleins INTEGER DEFAULT 0,
    stock_casiers_vides INTEGER DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS brasserie_consignations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    movement_type VARCHAR(20) NOT NULL, -- 'depot_consigne', 'restitution_consigne'
    nb_casiers INTEGER NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    receipt_date TIMESTAMPTZ DEFAULT now(),
    notes TEXT
);

-- [SECTEUR 5] STATION-SERVICE & HYDROCARBURES
CREATE TABLE IF NOT EXISTS station_cuves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    fuel_type VARCHAR(50) NOT NULL, -- 'Super 95', 'Gazole', 'Pétrole'
    capacity_liters NUMERIC(15,2) NOT NULL,
    current_volume_liters NUMERIC(15,2) DEFAULT 0.00,
    min_alert_liters NUMERIC(15,2) DEFAULT 2000.00,
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS station_pompes_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    cuve_id UUID REFERENCES station_cuves(id) ON DELETE CASCADE,
    pump_code VARCHAR(50) NOT NULL,
    opening_index NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    closing_index NUMERIC(15,2) DEFAULT 0.00,
    pompiste_name VARCHAR(150),
    shift_date DATE NOT NULL DEFAULT CURRENT_DATE,
    revenue_cash NUMERIC(15,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- [SECTEUR 6] SUPERMARCHÉ & SUPÉRETTE
CREATE TABLE IF NOT EXISTS supermarche_rayons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    code_rayon VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    chef_rayon VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- [SECTEUR 7] IMPRIMERIE & PRINT
CREATE TABLE IF NOT EXISTS imprimerie_dossiers_bat (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    dossier_code VARCHAR(50) NOT NULL,
    titre_ouvrage VARCHAR(255) NOT NULL,
    format_papier VARCHAR(50), -- 'A4', 'A3', 'Bâche 3x2m', etc.
    quantite INTEGER NOT NULL,
    statut_bat VARCHAR(50) DEFAULT 'En attente validation', -- 'Validé BAT', 'En tirage', 'Façonnage', 'Livré'
    fichier_maquette_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- [SECTEUR 8] ÉVÉNEMENTIEL (TRAITEUR, LOCATION MATÉRIEL, DÉCORATION)
CREATE TABLE IF NOT EXISTS evenementiel_prestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL, -- 'Mariage', 'Conférence', 'Anniversaire'
    event_date DATE NOT NULL,
    location TEXT,
    guests_count INTEGER DEFAULT 0,
    acompte_paye NUMERIC(15,2) DEFAULT 0.00,
    solde_restant NUMERIC(15,2) DEFAULT 0.00,
    status VARCHAR(50) DEFAULT 'Réservé',
    materiel_loue JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- [SECTEUR 9] HÔTEL & RÉSIDENCES HÔTELIÈRES
CREATE TABLE IF NOT EXISTS hotel_chambres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    room_number VARCHAR(50) NOT NULL,
    room_type VARCHAR(100) NOT NULL, -- 'Standard', 'Suite VIP', 'Appartement'
    price_per_night NUMERIC(15,2) NOT NULL,
    occupancy_status VARCHAR(50) DEFAULT 'Libre', -- 'Occupée', 'Réservée', 'En Nettoyage'
    cleanliness_status VARCHAR(50) DEFAULT 'Propre',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hotel_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES hotel_chambres(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    check_in_date TIMESTAMPTZ NOT NULL,
    check_out_date TIMESTAMPTZ NOT NULL,
    total_amount NUMERIC(15,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'Confirmée',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- [SECTEUR 10] PHARMACIE & PARAPHARMACIE
CREATE TABLE IF NOT EXISTS pharmacie_lots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    stock_quantity NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    repartiteur VARCHAR(150), -- 'CAMU', 'UBIPHAR', 'COPHARBI'
    created_at TIMESTAMPTZ DEFAULT now()
);

-- [SECTEUR 11] ÉCOLE & FORMATION
CREATE TABLE IF NOT EXISTS ecole_classes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL, -- '6ème A', 'Terminale D', etc.
    frais_scolarite_total NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ecole_eleves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    classe_id UUID REFERENCES ecole_classes(id) ON DELETE CASCADE,
    matricule VARCHAR(50) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    parent_name VARCHAR(255),
    parent_phone VARCHAR(50),
    scolarite_payee NUMERIC(15,2) DEFAULT 0.00,
    scolarite_solde NUMERIC(15,2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- [SECTEUR 12] ATELIER GARAGE & MÉCANIQUE
CREATE TABLE IF NOT EXISTS garage_ordres_reparation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    numero_or VARCHAR(50) NOT NULL,
    immatriculation VARCHAR(50) NOT NULL,
    marque_modele VARCHAR(100),
    kilometrage INTEGER,
    diagnostic TEXT,
    statut_reparation VARCHAR(50) DEFAULT 'En cours', -- 'En attente pièces', 'Terminé', 'Livré'
    cout_pieces NUMERIC(15,2) DEFAULT 0.00,
    cout_main_oeuvre NUMERIC(15,2) DEFAULT 0.00,
    total_ttc NUMERIC(15,2) DEFAULT 0.00,
    date_entree TIMESTAMPTZ DEFAULT now()
);

-- [SECTEUR 13] GESTION DE LOCATION & IMMOBILIER
CREATE TABLE IF NOT EXISTS location_biens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    designation VARCHAR(255) NOT NULL,
    type_bien VARCHAR(100) NOT NULL, -- 'Boutique', 'Appartement 2 pièces', 'Villa'
    adresse TEXT,
    loyer_mensuel NUMERIC(15,2) NOT NULL,
    statut_location VARCHAR(50) DEFAULT 'Disponible', -- 'Loué', 'Travaux'
    compteur_sbee VARCHAR(50),
    compteur_soneb VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS location_quittances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bien_id UUID REFERENCES location_biens(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    mois_loyer VARCHAR(20) NOT NULL, -- '2026-09'
    montant_loyer NUMERIC(15,2) NOT NULL,
    charges NUMERIC(15,2) DEFAULT 0.00,
    total_paye NUMERIC(15,2) NOT NULL,
    date_paiement TIMESTAMPTZ DEFAULT now(),
    numero_quittance VARCHAR(100) NOT NULL
);

-- [SECTEUR 14] MICROFINANCE & CRÉDIT
CREATE TABLE IF NOT EXISTS microfinance_comptes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    numero_compte VARCHAR(50) UNIQUE NOT NULL,
    solde_epargne NUMERIC(15,2) DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS microfinance_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    compte_id UUID REFERENCES microfinance_comptes(id) ON DELETE CASCADE,
    montant_emprunte NUMERIC(15,2) NOT NULL,
    taux_interet NUMERIC(5,2) DEFAULT 2.00,
    duree_mois INTEGER NOT NULL,
    mensualite NUMERIC(15,2) NOT NULL,
    capital_restant NUMERIC(15,2) NOT NULL,
    statut VARCHAR(50) DEFAULT 'En cours', -- 'Soldé', 'En retard'
    date_octroi DATE NOT NULL DEFAULT CURRENT_DATE
);

-- [SECTEUR 15] TONTINE & COLLECTE D EPARGNE
CREATE TABLE IF NOT EXISTS tontine_cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id UUID REFERENCES company_activities(id) ON DELETE CASCADE,
    nom_cycle VARCHAR(150) NOT NULL,
    mise_journaliere NUMERIC(15,2) NOT NULL DEFAULT 500.00, -- ex: 500 F, 1000 F CFA
    duree_jours INTEGER DEFAULT 31,
    date_debut DATE NOT NULL DEFAULT CURRENT_DATE,
    statut VARCHAR(50) DEFAULT 'Actif',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tontine_cotisations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id UUID REFERENCES tontine_cycles(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    date_cotisation DATE NOT NULL DEFAULT CURRENT_DATE,
    montant NUMERIC(15,2) NOT NULL,
    collecteur_name VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 4. AMORÇAGE DU CATALOGUE DES 15+ SECTEURS (MÉTADONNÉES SEULEMENT, SANS DONNÉES TRANSACTIONNELLES)
-- ==============================================================================
INSERT INTO sectors (code, slug, name, category, emoji, icon, color, badge, description, modules, specific_modules)
VALUES
('POISSONNERIE', 'poissonnerie', 'Poissonnerie & Surgelés', 'Alimentation & Frais', '🐟', 'Fish', '#06b6d4', 'Surgelés & Frais', 'Chambres froides (-18°C), pesée au kg, gestion des cartons et alertes avaries.', '["ventes", "stock", "caisse", "finances", "clients", "depenses", "rapports"]', '["chambres_froides", "pesee_kg", "avaries"]'),
('QUINCAILLERIE', 'quincaillerie', 'Quincaillerie & Matériaux BTP', 'Bâtiment & Construction', '🔨', 'Hammer', '#f59e0b', 'Matériaux BTP', 'Ciment, fer à béton, facturation au mètre/tonne, livraison chantiers et comptes entrepreneurs.', '["ventes", "stock", "caisse", "finances", "clients", "depenses", "rapports"]', '["chantiers", "conversions_btp", "livraisons"]'),
('BOUTIQUE', 'boutique', 'Boutique & Commerce général', 'Commerce Détail', '🏪', 'Store', '#3b82f6', 'Commerce Détail', 'Vente comptoir rapide, gestion des variantes (taille/couleur), approvisionnement et remises.', '["ventes", "stock", "caisse", "finances", "clients", "depenses", "rapports"]', '["variantes", "fidélité"]'),
('BRASSERIE', 'brasserie', 'Brasserie & Dépôt Boissons', 'Boissons & Restauration', '🍾', 'Wine', '#eab308', 'Dépôt Boissons', 'Gestion des casiers pleins/vides Sobebra, suivi strict des consignes emballages et fiches maquis.', '["ventes", "stock", "caisse", "finances", "clients", "depenses", "rapports"]', '["casiers", "consignes", "vente_gros"]'),
('STATION', 'station', 'Station-Service & Hydrocarbures', 'Énergie & Carburants', '⛽', 'Fuel', '#f97316', 'Hydrocarbures', 'Jaugeage des cuves (Super, Gazole), index pompes début/fin de quart et lubrifiants.', '["ventes", "stock", "caisse", "finances", "clients", "depenses", "rapports"]', '["pompes_cuves", "postes_pompistes", "lubrifiants"]'),
('SUPERMARCHE', 'supermarche', 'Supermarché & Supérette', 'Grande Distribution', '🛒', 'ShoppingCart', '#10b981', 'Grande Distribution', 'Scannage codes-barres POS rapide, têtes de gondoles, démarques DLC courtes et rayons.', '["ventes", "stock", "caisse", "finances", "clients", "depenses", "rapports"]', '["rayons", "promos_dlc"]'),
('IMPRESSION', 'impression', 'Imprimerie & Print', 'Industrie Graphique', '🖨️', 'Printer', '#ec4899', 'Imprimerie & Graphisme', 'Calculette BAT, formats et grammages papiers, suivi atelier et sous-traitance.', '["ventes", "stock", "caisse", "finances", "clients", "depenses", "rapports"]', '["devis_bat", "production_atelier"]'),
('EVENEMENTIEL', 'evenementiel', 'Événementiel & Prestations', 'Services & Loisirs', '🎉', 'PartyPopper', '#8b5cf6', 'Prestations & Fêtes', 'Réservations dates, traiteur, location bâches, chaises, sono et encaissements acomptes.', '["ventes", "caisse", "finances", "clients", "depenses", "rapports"]', '["reservations_dates", "location_materiel"]'),
('HOTEL', 'hotel', 'Hôtel & Résidences Hôtelières', 'Hôtellerie & Hébergement', '🏨', 'Building2', '#6366f1', 'Hébergement', 'Planning chambres, nuitées, check-in/check-out, housekeeping et factures séjour.', '["ventes", "caisse", "finances", "clients", "depenses", "rapports"]', '["chambres_reservations", "housekeeping"]'),
('PHARMACIE', 'pharmacie', 'Pharmacie & Parapharmacie', 'Santé', '💊', 'Pill', '#14b8a6', 'Santé & Médicaments', 'Ordonnances, numéros de lots, dates de péremption et répartiteurs agréés (CAMU/UBIPHAR).', '["ventes", "stock", "caisse", "finances", "clients", "depenses", "rapports"]', '["ordonnances", "lots_peremption"]'),
('ECOLE', 'ecole', 'École & Établissement Scolaire', 'Éducation & Formation', '🎓', 'GraduationCap', '#3b82f6', 'Éducation', 'Classes, inscriptions élèves, suivi des tranches de frais de scolarité et reçus.', '["ventes", "caisse", "finances", "clients", "depenses", "rapports"]', '["eleves_classes", "frais_scolaires"]'),
('GARAGE', 'garage', 'Atelier Garage & Mécanique', 'Automobile & Transport', '🚗', 'Wrench', '#64748b', 'Mécanique Auto', 'Ordres de réparation (OR), pièces détachées, fiches véhicules clients et main oeuvre.', '["ventes", "stock", "caisse", "finances", "clients", "depenses", "rapports"]', '["ordres_reparation", "pieces_detachees"]'),
('LOCATION', 'location', 'Gestion de location & Immobilier', 'Immobilier', '🏠', 'Home', '#a855f7', 'Immobilier & Baux', 'Baux locatifs, états des lieux, quittances de loyer, suivi des impayés et charges.', '["caisse", "finances", "clients", "depenses", "rapports"]', '["biens_logements", "quittances_loyer", "relances_impayes"]'),
('MICROFINANCE', 'microfinance', 'Microfinance & Crédit', 'Services Financiers', '🏦', 'Landmark', '#059669', 'Finance Inclusive', 'Comptes épargne membres, demandes de crédits, échéanciers et remboursements.', '["caisse", "finances", "clients", "depenses", "rapports"]', '["comptes_epargne", "credits_echeanciers"]'),
('TONTINE', 'tontine', 'Tontine & Épargne Journalière', 'Finance Populaire', '🔄', 'Repeat', '#0284c7', 'Tontine Traditionnelle', 'Cycles de tontine, pointage journalier des collecteurs, mises quotidiennes et attributions.', '["caisse", "finances", "clients", "depenses", "rapports"]', '["cycles_tontine", "collecteurs_mises"]')
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    emoji = EXCLUDED.emoji,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    badge = EXCLUDED.badge,
    description = EXCLUDED.description,
    modules = EXCLUDED.modules,
    specific_modules = EXCLUDED.specific_modules;

