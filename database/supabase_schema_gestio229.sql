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
('aaaa0001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Super Administrateur Bénin', 'admin', 'admin@test.bj', '123456', 'super_admin', '{"commercial": true, "stock": true, "purchases": true, "treasury": true, "hr": true, "accounting": true, "reporting": true, "admin": true}'::jsonb),
('aaaa0002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Gérant de Magasin Test', 'gerant', 'gerant@test.bj', '123456', 'gerant', '{"commercial": true, "stock": true, "purchases": true, "treasury": true, "hr": true, "accounting": true, "reporting": true, "admin": false}'::jsonb),
('aaaa0003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Caissière Test (Limité)', 'caissier', 'caissier@test.bj', '123456', 'caissier', '{"commercial": true, "stock": false, "purchases": false, "treasury": true, "hr": false, "accounting": false, "reporting": false, "admin": false}'::jsonb),
('aaaa0004-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Magasinier Test', 'magasinier', 'magasinier@test.bj', '123456', 'magasinier', '{"commercial": false, "stock": true, "purchases": true, "treasury": false, "hr": false, "accounting": false, "reporting": false, "admin": false}'::jsonb)
ON CONFLICT DO NOTHING;

-- 3. Emplacements de stock (2 Entrepôts : Magasin Principal vs Stock Vente POS)
INSERT INTO stock_locations (id, company_id, name, code, type, is_default)
VALUES 
('loc00001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Stock Magasin (Entrepôt Réserve)', 'MAGASIN_RESERVE', 'magasin', true),
('loc00002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Stock Vente (Rayon Caisse POS)', 'STOCK_VENTE_POS', 'vente', false)
ON CONFLICT DO NOTHING;

-- 4. 3 Catégories
INSERT INTO product_categories (id, company_id, name, code)
VALUES 
('cat00001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Alimentation & Boissons', 'ALIM'),
('cat00002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Textile & Confection', 'TEXT'),
('cat00003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Électronique & Équipements', 'ELEC')
ON CONFLICT DO NOTHING;

-- 5. 20 Produits de test complets
INSERT INTO products (id, company_id, category_id, code, barcode, name, unit, cost_price, selling_price, wholesale_price, vip_price)
VALUES 
('p0000001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'cat00001-0000-0000-0000-000000000001', 'PRD-001', '615110000001', 'Riz Parfumé 25kg (Bénin)', 'Sac', 18500, 22000, 20500, 21000),
('p0000002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'cat00001-0000-0000-0000-000000000001', 'PRD-002', '615110000002', 'Huile Végétale 5 Litres', 'Bidon', 5500, 7000, 6500, 6800),
('p0000003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'cat00001-0000-0000-0000-000000000001', 'PRD-003', '615110000003', 'Pack Eau Possotomè 1.5L x6', 'Pack', 2200, 3000, 2700, 2800),
('p0000004-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'cat00001-0000-0000-0000-000000000001', 'PRD-004', '615110000004', 'Sucre Blanc en Morceaux 1kg', 'Paquet', 800, 1100, 1000, 1050),
('p0000005-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'cat00001-0000-0000-0000-000000000001', 'PRD-005', '615110000005', 'Lait Concentré Sucré Bonnet Rouge', 'Boîte', 650, 900, 800, 850),
('p0000006-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'cat00001-0000-0000-0000-000000000001', 'PRD-006', '615110000006', 'Farine de Blé 50kg Grands Moulins', 'Sac', 21000, 25000, 23500, 24000),
('p0000007-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'cat00001-0000-0000-0000-000000000001', 'PRD-007', '615110000007', 'Café Moulu Bénin 250g', 'Paquet', 1500, 2200, 1900, 2000),
('p0000008-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'cat00002-0000-0000-0000-000000000002', 'PRD-008', '615110000008', 'Pagne Vlisco Hollandais 6 Yards', 'Pièce', 38000, 48000, 44000, 46000),
('p0000009-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'cat00002-0000-0000-0000-000000000002', 'PRD-009', '615110000009', 'Pagne Uniwax Woodin 6 Yards', 'Pièce', 22000, 28000, 26000, 27000),
('p0000010-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'cat00002-0000-0000-0000-000000000002', 'PRD-010', '615110000010', 'Chemise Manches Longues Homme', 'Unité', 8500, 13000, 11500, 12000),
('p0000011-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'cat00002-0000-0000-0000-000000000002', 'PRD-011', '615110000011', 'Robe Soirée Wax Moderne', 'Unité', 15000, 24000, 21000, 22500),
('p0000012-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', 'cat00002-0000-0000-0000-000000000002', 'PRD-012', '615110000012', 'Chaussures Cuir Ville Homme', 'Paire', 18000, 28000, 25000, 26500),
('p0000013-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111', 'cat00002-0000-0000-0000-000000000002', 'PRD-013', '615110000013', 'T-Shirt Coton Bio Bénin', 'Unité', 3500, 6000, 5000, 5500),
('p0000014-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111', 'cat00003-0000-0000-0000-000000000003', 'PRD-014', '615110000014', 'Smartphone Tecno Spark 20 Pro', 'Unité', 72000, 89000, 84000, 86000),
('p0000015-0000-0000-0000-000000000015', '11111111-1111-1111-1111-111111111111', 'cat00003-0000-0000-0000-000000000003', 'PRD-015', '615110000015', 'Téléviseur Smart LED 43 Pouces', 'Unité', 115000, 145000, 135000, 140000),
('p0000016-0000-0000-0000-000000000016', '11111111-1111-1111-1111-111111111111', 'cat00003-0000-0000-0000-000000000003', 'PRD-016', '615110000016', 'Ventilateur Rechargeable Solaire', 'Unité', 24000, 32000, 29000, 30500),
('p0000017-0000-0000-0000-000000000017', '11111111-1111-1111-1111-111111111111', 'cat00003-0000-0000-0000-000000000003', 'PRD-017', '615110000017', 'Multiprise Parasurtenseur 6 Prises', 'Unité', 4500, 7500, 6500, 7000),
('p0000018-0000-0000-0000-000000000018', '11111111-1111-1111-1111-111111111111', 'cat00003-0000-0000-0000-000000000003', 'PRD-018', '615110000018', 'Fer à Repasser Vapeur Philips', 'Unité', 12000, 17500, 15500, 16500),
('p0000019-0000-0000-0000-000000000019', '11111111-1111-1111-1111-111111111111', 'cat00003-0000-0000-0000-000000000003', 'PRD-019', '615110000019', 'Écouteurs Sans Fil Bluetooth', 'Paire', 6500, 11000, 9500, 10000),
('p0000020-0000-0000-0000-000000000020', '11111111-1111-1111-1111-111111111111', 'cat00003-0000-0000-0000-000000000003', 'PRD-020', '615110000020', 'Batterie Externe Powerbank 20000mAh', 'Unité', 9500, 15000, 13000, 14000)
ON CONFLICT DO NOTHING;

-- 6. 5 Clients de test
INSERT INTO customers (id, company_id, code, name, ifu_number, phone, email, address, credit_limit, current_debt)
VALUES 
('cli00001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'CLI-001', 'ETS BIO BÉNIN & FILS', '3201999888777', '+229 97 10 20 30', 'contact@biobenin.bj', 'Dantokpa, Cotonou', 3000000, 0),
('cli00002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'CLI-002', 'SOCIÉTÉ AGOS DISTRIBUTION', '3201888777666', '+229 95 40 50 60', 'agos@distrib.bj', 'Akpakpa, Cotonou', 5000000, 0),
('cli00003-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'CLI-003', 'M. KOUASSI Jean (Particulier VIP)', '3202111222333', '+229 96 70 80 90', 'kouassi@gmail.com', 'Cadjehoun, Cotonou', 1000000, 10000),
('cli00004-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'CLI-004', 'PHARMACIE DE L\'ÉTOILE', '3201444555666', '+229 21 30 15 20', 'etoile@pharma.bj', 'Saint-Michel, Cotonou', 2000000, 0),
('cli00005-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'CLI-005', 'HÔTEL DU LAC COTONOU', '3201333222111', '+229 21 33 44 55', 'hotel@dulac.bj', 'Plage, Cotonou', 4000000, 0)
ON CONFLICT DO NOTHING;

-- 7. 2 Fournisseurs de test
INSERT INTO suppliers (id, company_id, code, company_name, contact_person, ifu_number, phone, email, city, current_payable)
VALUES 
('sup00001-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'FOURN-001', 'IMPORT-EXPORT BÉNIN SÀRL', 'M. SOSSOU Bernard', '3201888999000', '+229 97 88 77 66', 'contact@importbenin.bj', 'Cotonou', 0),
('sup00002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'FOURN-002', 'GRANDS MOULINS DU BÉNIN SA', 'Direction Commerciale', '3201555666777', '+229 21 30 40 50', 'ventes@gmb.bj', 'Cotonou', 0)
ON CONFLICT DO NOTHING;
