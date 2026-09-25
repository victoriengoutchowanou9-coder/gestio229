-- ==============================================================================
-- GESTIO 229 ERP - BASE DE DONNEES SQLITE MULTI-ACTIVITES (HUB & 15+ METIERS)
-- Slogan : Votre gestion, au standard du Benin
-- Regles : TABLES OPERATIONNELLES VIDES POUR VRAIES ENTREPRISES (PRODUCTION)
-- ==============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    legal_form TEXT DEFAULT 'SARL',
    ifu_number TEXT NOT NULL,
    rccm_number TEXT,
    regime_fiscal TEXT DEFAULT 'Regime Reel Simplifie (RRS)',
    address TEXT,
    city TEXT DEFAULT 'Cotonou',
    country TEXT DEFAULT 'Benin',
    phone TEXT,
    email TEXT,
    currency TEXT DEFAULT 'FCFA',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sectors (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    emoji TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT DEFAULT '#059669',
    badge TEXT,
    description TEXT,
    modules TEXT DEFAULT '["ventes", "stock", "caisse", "finances", "clients", "depenses", "rapports"]',
    specific_modules TEXT DEFAULT '[]',
    is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS company_activities (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL,
    sector_code TEXT NOT NULL,
    activity_name TEXT NOT NULL,
    pos_location TEXT NOT NULL,
    manager_name TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'SUSPENDUE', 'ARCHIVEE')),
    is_active INTEGER DEFAULT 1,
    color TEXT,
    archived_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS activity_daily_metrics (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    activity_id TEXT REFERENCES company_activities(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL,
    metric_date DATE NOT NULL,
    revenue REAL DEFAULT 0.0,
    cogs REAL DEFAULT 0.0,
    gross_margin REAL DEFAULT 0.0,
    expenses REAL DEFAULT 0.0,
    net_margin REAL DEFAULT 0.0,
    sales_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(activity_id, metric_date)
);

CREATE TABLE IF NOT EXISTS activity_monthly_metrics (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    activity_id TEXT REFERENCES company_activities(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL,
    metric_month TEXT NOT NULL,
    revenue REAL DEFAULT 0.0,
    cogs REAL DEFAULT 0.0,
    gross_margin REAL DEFAULT 0.0,
    expenses REAL DEFAULT 0.0,
    net_margin REAL DEFAULT 0.0,
    sales_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(activity_id, metric_month)
);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
    activity_id TEXT REFERENCES company_activities(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    barcode TEXT,
    name TEXT NOT NULL,
    category TEXT,
    unit TEXT DEFAULT 'Unite',
    cost_price REAL DEFAULT 0.0,
    selling_price REAL DEFAULT 0.0,
    stock_magasin REAL DEFAULT 0.0,
    stock_vente REAL DEFAULT 0.0,
    min_stock REAL DEFAULT 5.0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
    activity_id TEXT REFERENCES company_activities(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    ifu TEXT,
    phone TEXT,
    address TEXT,
    current_debt REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    ifu TEXT,
    phone TEXT,
    payable REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales_invoices (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
    activity_id TEXT REFERENCES company_activities(id) ON DELETE CASCADE,
    sector_code TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    customer_name TEXT DEFAULT 'Comptoir',
    subtotal REAL DEFAULT 0.0,
    tax_amount REAL DEFAULT 0.0,
    total_amount REAL NOT NULL,
    cost_total REAL DEFAULT 0.0,
    payment_mode TEXT DEFAULT 'Especes',
    sale_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_avoir INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
    activity_id TEXT REFERENCES company_activities(id) ON DELETE CASCADE,
    sector_code TEXT NOT NULL,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    motif TEXT,
    beneficiary TEXT,
    payment_method TEXT DEFAULT 'Especes',
    expense_date DATE DEFAULT CURRENT_DATE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR REPLACE INTO sectors (id, code, slug, name, category, emoji, icon, color, badge, description)
VALUES
('s1', 'POISSONNERIE', 'poissonnerie', 'Poissonnerie & Surgeles', 'Alimentation & Frais', '🐟', 'Fish', '#06b6d4', 'Surgeles & Frais', 'Chambres froides (-18°C), pesee kg, cartons et alertes avaries.'),
('s2', 'QUINCAILLERIE', 'quincaillerie', 'Quincaillerie & Materiaux BTP', 'BTP & Construction', '🔨', 'Hammer', '#f59e0b', 'Materiaux BTP', 'Ciment, fer a beton, facturation au metre/tonne et suivi chantiers.'),
('s3', 'BOUTIQUE', 'boutique', 'Boutique & Commerce general', 'Commerce Detail', '🏪', 'Store', '#3b82f6', 'Commerce Detail', 'Vente comptoir, variantes taille/couleur, remises et approvisionnement.'),
('s4', 'BRASSERIE', 'brasserie', 'Brasserie & Depot Boissons', 'Boissons & Restauration', '🍾', 'Wine', '#eab308', 'Depot Boissons', 'Gestion des casiers pleins/vides Sobebra et consignes emballages.'),
('s5', 'STATION', 'station', 'Station-Service & Hydrocarbures', 'Energie & Carburants', '⛽', 'Fuel', '#f97316', 'Hydrocarbures', 'Jaugeage cuves (Super, Gazole), index pompes et quarts pompistes.'),
('s6', 'SUPERMARCHE', 'supermarche', 'Supermarche & Superette', 'Grande Distribution', '🛒', 'ShoppingCart', '#10b981', 'Grande Distribution', 'Code-barres POS rapide, tetes de gondoles et demarques DLC.'),
('s7', 'IMPRESSION', 'impression', 'Imprimerie & Print', 'Industrie Graphique', '🖨️', 'Printer', '#ec4899', 'Imprimerie & Graphisme', 'Calculette BAT, formats et grammages papiers, suivi atelier.'),
('s8', 'EVENEMENTIEL', 'evenementiel', 'Evenementiel & Prestations', 'Services & Fetes', '🎉', 'PartyPopper', '#8b5cf6', 'Prestations & Fetes', 'Reservations dates, traiteur, location baches/chaises et acomptes.'),
('s9', 'HOTEL', 'hotel', 'Hotel & Residences Hotelieres', 'Hotellerie', '🏨', 'Building2', '#6366f1', 'Hebergement', 'Planning chambres, nuitees, check-in/out et facturation sejour.'),
('s10', 'PHARMACIE', 'pharmacie', 'Pharmacie & Parapharmacie', 'Sante', '💊', 'Pill', '#14b8a6', 'Sante & Medicaments', 'Ordonnances, numeros de lots, dates peremption et CAMU/UBIPHAR.'),
('s11', 'ECOLE', 'ecole', 'Ecole & Etablissement Scolaire', 'Education', '🎓', 'GraduationCap', '#3b82f6', 'Education', 'Classes, inscriptions eleves, tranches scolarite et recus.'),
('s12', 'GARAGE', 'garage', 'Atelier Garage & Mecanique', 'Automobile', '🚗', 'Wrench', '#64748b', 'Mecanique Auto', 'Ordres de reparation OR, vehicules immatricules et pieces detachees.'),
('s13', 'LOCATION', 'location', 'Gestion de location & Immobilier', 'Immobilier', '🏠', 'Home', '#a855f7', 'Immobilier & Baux', 'Baux locatifs, etats des lieux, quittances de loyer et impayes.'),
('s14', 'MICROFINANCE', 'microfinance', 'Microfinance & Credit', 'Services Financiers', '🏦', 'Landmark', '#059669', 'Finance Inclusive', 'Comptes epargne membres, demandes de credit et echeanciers.'),
('s15', 'TONTINE', 'tontine', 'Tontine & Epargne Journaliere', 'Finance Populaire', '🔄', 'Repeat', '#0284c7', 'Tontine Traditionnelle', 'Cycles tontine, pointage journalier collecteurs et attributions.');
