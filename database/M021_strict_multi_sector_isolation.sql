-- ==============================================================================
-- GESTIO 229 SAAS — MIGRATION M021 : ISOLATION STRICTE MULTI-SECTEURS (19 SOUS-LOGICIELS)
-- ==============================================================================
-- Stack : PostgreSQL / Supabase
-- Règle absolue : (company_id + sector_slug) = clé d'isolation unique et obligatoire.
-- Aucune fuite inter-secteurs autorisée, même au sein de la même entreprise.
-- ==============================================================================

-- 1. EXTENSIONS REQUISES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLE RÉFÉRENTIELLE sectors (19 SECTEURS OFFICIELS FIXES)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS sectors (
    slug VARCHAR(100) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(100) DEFAULT 'Général',
    emoji VARCHAR(20) DEFAULT '🏢',
    icon VARCHAR(50) DEFAULT 'Store',
    color VARCHAR(20) DEFAULT '#059669',
    badge VARCHAR(100) DEFAULT 'Sous-Logiciel',
    description TEXT,
    modules JSONB DEFAULT '["dashboard","ventes","stock","caisse","finances","clients","fournisseurs","depenses","rapports","syscohada","configuration","utilisateurs","audit","abonnement"]'::jsonb,
    specific_modules JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Si la table existait avec id UUID, assurer la compatibilité slug PK / UNIQUE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sectors' AND column_name = 'slug'
    ) THEN
        -- S'assurer que slug est unique et non nul
        ALTER TABLE sectors ALTER COLUMN slug SET NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sectors_slug_unique ON sectors(slug);
    END IF;
END $$;

-- Insertion ou mise à jour idempotente des 19 secteurs officiels
INSERT INTO sectors (slug, name, category, emoji, icon, color, badge, description, sort_order)
VALUES
    ('boutique', 'Boutique & Magasin', 'Commerce Détail', '🏪', 'Store', '#3b82f6', 'Commerce & Détail', 'Vente au détail, prêt-à-porter, alimentation générale, bazar et accessoires.', 1),
    ('quincaillerie', 'Quincaillerie & Matériaux', 'BTP & Construction', '🔨', 'Hammer', '#f59e0b', 'Matériaux BTP', 'Ciment, fer à béton, outillage, plomberie, électricité, vente gros/détail.', 2),
    ('poissonnerie', 'Poissonnerie & Produits Frais', 'Alimentation & Frais', '🐟', 'Fish', '#06b6d4', 'Surgelés & Frais', 'Poissons congelés, viandes, volailles, cartons, pesées et chambres froides.', 3),
    ('restaurant', 'Bar, Restaurant, Maquis & Fast Food', 'Restauration', '🍽️', 'UtensilsCrossed', '#ef4444', 'CHR & Fast Food', 'Gestion des tables, commandes cuisine, menus du jour, livraisons et boissons.', 4),
    ('supermarche', 'Supermarché & Supérette', 'Grande Distribution', '🛒', 'ShoppingBasket', '#10b981', 'Grande Distribution', 'Multiples rayons, douchette code-barres rapide, gestion des DLC et promotions.', 5),
    ('pharmacie', 'Pharmacie & Dépôt Médical', 'Santé', '💊', 'Pill', '#8b5cf6', 'Santé & Médicaments', 'Gestion des ordonnances, numéros de lot, dates de péremption et alertes santé.', 6),
    ('station-service', 'Station-Service & Hydrocarbures', 'Énergie & Carburants', '⛽', 'Fuel', '#f97316', 'Hydrocarbures', 'Index pompes, cuves, clôtures de postes pompistes, fûts et lubrifiants.', 7),
    ('hotel', 'Hôtel, Résidence & Auberge', 'Hôtellerie', '🏨', 'BedDouble', '#6366f1', 'Hébergement', 'Planning des chambres, réservations, check-in/out, room-service et nuitées.', 8),
    ('ecole', 'École & Centre de Formation', 'Éducation', '🎓', 'GraduationCap', '#84cc16', 'Éducation', 'Frais de scolarité, effectifs élèves, tranches de paiement et reçus officiels.', 9),
    ('immobilier', 'Gestion Locative & Immobilier', 'Immobilier', '🏠', 'Home', '#a855f7', 'Immobilier & Baux', 'Contrats de bail, suivi des loyers mensuels, quittances et relances impayés.', 10),
    ('garage', 'Atelier, Garage & Mécanique', 'Automobile', '🚗', 'Car', '#64748b', 'Mécanique Auto', 'Ordres de réparation, pièces détachées, devis mécanique et main d’œuvre.', 11),
    ('imprimerie', 'Imprimerie & Sérigraphie', 'Industrie Graphique', '🖨️', 'Printer', '#ec4899', 'Imprimerie & BAT', 'Devis sur mesure, suivi des BAT, tirages offset/numérique et sous-traitance.', 12),
    ('brasserie', 'Brasserie & Dépôt de Boissons', 'Boissons', '🍾', 'Wine', '#eab308', 'Dépôt Boissons', 'Gestion des casiers consignés, bouteilles pleines/vides et grossistes.', 13),
    ('microfinance', 'Microfinance & Tontine', 'Services Financiers', '🏦', 'Banknote', '#14b8a6', 'Finance & Tontine', 'Cotisations journalières, carnets de tontine, crédits et épargne solidaire.', 14),
    ('agrobusiness', 'Agro-Business & Élevage', 'Agriculture & Élevage', '🌱', 'Sprout', '#22c55e', 'Agro-Business', 'Production agricole, intrants, provendes, cheptel, récoltes et ventes en gros.', 15),
    ('cosmetiques', 'Cosmétiques & Salons de Beauté', 'Beauté & Bien-être', '✨', 'Sparkles', '#f43f5e', 'Beauté & Soins', 'Prestations de soins, produits de beauté, coiffure et forfaits esthétiques.', 16),
    ('mercerie', 'Mercerie & Couture', 'Mode & Couture', '✂️', 'Scissors', '#db2777', 'Mercerie & Couture', 'Tissus au mètre, boutons, fermetures, commandes sur-mesure et retouches.', 17),
    ('boulangerie', 'Boulangerie & Pâtisserie', 'Artisanat Alimentaire', '🥐', 'Croissant', '#d97706', 'Boulangerie & Pâtisserie', 'Pains, viennoiseries, pâtisseries, gestion des fournées et invendus.', 18),
    ('transport', 'Transport & Logistique', 'Transport & Logistique', '🚚', 'Truck', '#2563eb', 'Transport & Fret', 'Flotte de véhicules, suivi des trajets, bordereaux de livraison et fret.', 19)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    category = EXCLUDED.category,
    emoji = EXCLUDED.emoji,
    icon = EXCLUDED.icon,
    color = EXCLUDED.color,
    badge = EXCLUDED.badge,
    description = EXCLUDED.description,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- ==============================================================================
-- 3. TABLE company_sectors (LIAISON STRICTE ENTREPRISE ↔ SECTEURS SOUSCRITS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS company_sectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    subscribed_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, sector_slug)
);

CREATE INDEX IF NOT EXISTS idx_company_sectors_lookup ON company_sectors(company_id, sector_slug);

-- Migration automatique des souscriptions depuis companies.sectors et company_activities
DO $$
BEGIN
    -- Remplissage depuis company_activities si la table existe
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'company_activities') THEN
        INSERT INTO company_sectors (company_id, sector_slug)
        SELECT DISTINCT company_id, LOWER(TRIM(REPLACE(sector_slug, 'sec-', '')))
        FROM company_activities
        WHERE sector_slug IS NOT NULL AND TRIM(sector_slug) <> ''
        ON CONFLICT (company_id, sector_slug) DO NOTHING;
    END IF;
END $$;

-- ==============================================================================
-- 4. STANDARDISATION DES COLONNES SUR TOUTES LES TABLES MÉTIER
-- ==============================================================================
-- Règle : company_id UUID NOT NULL + sector_slug TEXT NOT NULL
-- Index composite obligatoire : (company_id, sector_slug)
-- ==============================================================================

-- 4.1. Table customers (Clients)
ALTER TABLE customers 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug TEXT;

UPDATE customers SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';
UPDATE customers SET sector_slug = LOWER(TRIM(REPLACE(sector_slug, 'sec-', '')));
ALTER TABLE customers ALTER COLUMN sector_slug SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_isolation ON customers(company_id, sector_slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_unique_code ON customers(company_id, sector_slug, code);

-- 4.2. Table suppliers (Fournisseurs)
ALTER TABLE suppliers 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug TEXT;

UPDATE suppliers SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';
UPDATE suppliers SET sector_slug = LOWER(TRIM(REPLACE(sector_slug, 'sec-', '')));
ALTER TABLE suppliers ALTER COLUMN sector_slug SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppliers_isolation ON suppliers(company_id, sector_slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_unique_code ON suppliers(company_id, sector_slug, code);

-- 4.3. Table products (Produits)
ALTER TABLE products 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug TEXT;

UPDATE products SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';
UPDATE products SET sector_slug = LOWER(TRIM(REPLACE(sector_slug, 'sec-', '')));
ALTER TABLE products ALTER COLUMN sector_slug SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_isolation ON products(company_id, sector_slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_unique_code ON products(company_id, sector_slug, code);

-- 4.4. Table sales_orders (Ventes & Factures)
ALTER TABLE sales_orders 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'COMPLET';

UPDATE sales_orders SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';
UPDATE sales_orders SET sector_slug = LOWER(TRIM(REPLACE(sector_slug, 'sec-', '')));
ALTER TABLE sales_orders ALTER COLUMN sector_slug SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_orders_isolation ON sales_orders(company_id, sector_slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_orders_unique_code ON sales_orders(company_id, sector_slug, order_number);

-- 4.5. Table purchase_orders (Achats & Commandes)
ALTER TABLE purchase_orders 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug TEXT;

UPDATE purchase_orders SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';
UPDATE purchase_orders SET sector_slug = LOWER(TRIM(REPLACE(sector_slug, 'sec-', '')));
ALTER TABLE purchase_orders ALTER COLUMN sector_slug SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_orders_isolation ON purchase_orders(company_id, sector_slug);

-- 4.6. Table expenses (Dépenses)
ALTER TABLE expenses 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug TEXT;

UPDATE expenses SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';
UPDATE expenses SET sector_slug = LOWER(TRIM(REPLACE(sector_slug, 'sec-', '')));
ALTER TABLE expenses ALTER COLUMN sector_slug SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_isolation ON expenses(company_id, sector_slug);

-- 4.7. Table stock_movements (Mouvements de stock)
ALTER TABLE stock_movements 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug TEXT;

UPDATE stock_movements SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';
UPDATE stock_movements SET sector_slug = LOWER(TRIM(REPLACE(sector_slug, 'sec-', '')));
ALTER TABLE stock_movements ALTER COLUMN sector_slug SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_isolation ON stock_movements(company_id, sector_slug);

-- 4.8. Table cash_registers & cash_sessions (Caisses & Journal de caisse)
ALTER TABLE cash_registers 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug TEXT;

UPDATE cash_registers SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';
UPDATE cash_registers SET sector_slug = LOWER(TRIM(REPLACE(sector_slug, 'sec-', '')));
ALTER TABLE cash_registers ALTER COLUMN sector_slug SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cash_registers_isolation ON cash_registers(company_id, sector_slug);

ALTER TABLE cash_sessions 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug TEXT;

UPDATE cash_sessions SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';
UPDATE cash_sessions SET sector_slug = LOWER(TRIM(REPLACE(sector_slug, 'sec-', '')));
ALTER TABLE cash_sessions ALTER COLUMN sector_slug SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cash_sessions_isolation ON cash_sessions(company_id, sector_slug);

-- 4.9. Table user_profiles (Utilisateurs internes & Rôles)
ALTER TABLE user_profiles 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug TEXT;

UPDATE user_profiles SET sector_slug = LOWER(TRIM(REPLACE(COALESCE(sector_id, 'boutique'), 'sec-', '')));
CREATE INDEX IF NOT EXISTS idx_user_profiles_isolation ON user_profiles(company_id, sector_slug);

-- 4.10. Table staff_members (Employés & Salariés)
CREATE TABLE IF NOT EXISTS staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    full_name VARCHAR(255) NOT NULL,
    job_title VARCHAR(150) NOT NULL,
    phone VARCHAR(50),
    cnss_number VARCHAR(100),
    base_salary NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    transport_allowance NUMERIC(15,2) DEFAULT 0.00,
    housing_allowance NUMERIC(15,2) DEFAULT 0.00,
    bonus NUMERIC(15,2) DEFAULT 0.00,
    advance_payment NUMERIC(15,2) DEFAULT 0.00,
    hire_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE staff_members 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug TEXT;

UPDATE staff_members SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';
UPDATE staff_members SET sector_slug = LOWER(TRIM(REPLACE(sector_slug, 'sec-', '')));
ALTER TABLE staff_members ALTER COLUMN sector_slug SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_members_isolation ON staff_members(company_id, sector_slug);

-- 4.11. Table customer_repayments (Règlements de créances & dettes)
CREATE TABLE IF NOT EXISTS customer_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    customer_name VARCHAR(255),
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    amount NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'especes',
    reference VARCHAR(100),
    previous_debt NUMERIC(15,2) DEFAULT 0.00,
    remaining_debt NUMERIC(15,2) DEFAULT 0.00,
    notes TEXT,
    received_by VARCHAR(150),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE customer_repayments 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug TEXT;

UPDATE customer_repayments SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';
UPDATE customer_repayments SET sector_slug = LOWER(TRIM(REPLACE(sector_slug, 'sec-', '')));
ALTER TABLE customer_repayments ALTER COLUMN sector_slug SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_repayments_isolation ON customer_repayments(company_id, sector_slug);

-- 4.12. Table audit_logs
ALTER TABLE audit_logs 
    ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug TEXT;

UPDATE audit_logs SET sector_slug = 'boutique' WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';
UPDATE audit_logs SET sector_slug = LOWER(TRIM(REPLACE(sector_slug, 'sec-', '')));
CREATE INDEX IF NOT EXISTS idx_audit_logs_isolation ON audit_logs(company_id, sector_slug);

-- ==============================================================================
-- 5. VUES D'ALIAS FRANÇAISES POUR COMPATIBILITÉ TOTALE
-- ==============================================================================
-- Permet aux requêtes ciblant "clients", "fournisseurs", "produits", "ventes", etc.
-- de fonctionner de manière transparente avec Supabase.
-- ==============================================================================
CREATE OR REPLACE VIEW clients AS SELECT * FROM customers;
CREATE OR REPLACE VIEW fournisseurs AS SELECT * FROM suppliers;
CREATE OR REPLACE VIEW produits AS SELECT * FROM products;
CREATE OR REPLACE VIEW ventes AS SELECT * FROM sales_orders;
CREATE OR REPLACE VIEW achats AS SELECT * FROM purchase_orders;
CREATE OR REPLACE VIEW depenses AS SELECT * FROM expenses;
CREATE OR REPLACE VIEW recettes AS SELECT * FROM cash_sessions;
CREATE OR REPLACE VIEW stock_mouvements AS SELECT * FROM stock_movements;
CREATE OR REPLACE VIEW caisse_journal AS SELECT * FROM cash_sessions;
CREATE OR REPLACE VIEW dettes AS SELECT * FROM customer_repayments;
CREATE OR REPLACE VIEW creances AS SELECT * FROM customers;
CREATE OR REPLACE VIEW internal_users AS SELECT * FROM user_profiles;
CREATE OR REPLACE VIEW employes AS SELECT * FROM staff_members;

-- ==============================================================================
-- 6. FONCTION SQL get_next_code(p_company_id, p_sector_slug, p_prefix)
-- ==============================================================================
-- Génération séquentielle stricte PAR (company_id, sector_slug).
-- Exemple : CLI-001 en Boutique ET CLI-001 en Poissonnerie pour la même entreprise.
-- Exemple : CLI-001 pour Sté A ET CLI-001 pour Sté B.
-- ==============================================================================
CREATE OR REPLACE FUNCTION get_next_code(
    p_company_id UUID,
    p_sector_slug TEXT,
    p_prefix TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_clean_slug TEXT := LOWER(TRIM(REPLACE(p_sector_slug, 'sec-', '')));
    v_clean_prefix TEXT := UPPER(TRIM(p_prefix));
    v_max_num INT := 0;
    v_next_num INT := 1;
    v_pattern TEXT;
BEGIN
    v_pattern := '^' || v_clean_prefix || '-([0-9]+)$';

    IF v_clean_prefix = 'CLI' THEN
        SELECT COALESCE(MAX((SUBSTRING(code FROM '[0-9]+$'))::INT), 0)
        INTO v_max_num
        FROM customers
        WHERE company_id = p_company_id
          AND sector_slug = v_clean_slug
          AND code ~ v_pattern;

    ELSIF v_clean_prefix = 'FOURN' THEN
        SELECT COALESCE(MAX((SUBSTRING(code FROM '[0-9]+$'))::INT), 0)
        INTO v_max_num
        FROM suppliers
        WHERE company_id = p_company_id
          AND sector_slug = v_clean_slug
          AND code ~ v_pattern;

    ELSIF v_clean_prefix = 'PROD' OR v_clean_prefix = 'PRD' THEN
        SELECT COALESCE(MAX((SUBSTRING(code FROM '[0-9]+$'))::INT), 0)
        INTO v_max_num
        FROM products
        WHERE company_id = p_company_id
          AND sector_slug = v_clean_slug
          AND code ~ ('^(' || v_clean_prefix || '|PROD|PRD)-([0-9]+)$');

    ELSIF v_clean_prefix = 'CMD' OR v_clean_prefix = 'FAC' OR v_clean_prefix = 'VTE' THEN
        SELECT COALESCE(MAX((SUBSTRING(order_number FROM '[0-9]+$'))::INT), 0)
        INTO v_max_num
        FROM sales_orders
        WHERE company_id = p_company_id
          AND sector_slug = v_clean_slug
          AND order_number ~ ('^(' || v_clean_prefix || '|CMD|FAC|VTE)-([0-9]+)$');

    ELSE
        -- Préfixe générique sur audit_logs ou générique
        v_max_num := 0;
    END IF;

    v_next_num := v_max_num + 1;
    RETURN v_clean_prefix || '-' || LPAD(v_next_num::TEXT, 3, '0');
END;
$$;

-- Notification du rechargement de schéma PostgREST / Supabase
NOTIFY pgrst, 'reload schema';
