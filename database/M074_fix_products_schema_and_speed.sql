-- ==============================================================================
-- GESTIO 229 ERP - MIGRATION M074
-- Fix Produits Multi-Unités & Création Systématique des Tables de Stock & Lignes BC
-- Élimination Définitive des erreurs de colonnes (PGRST204) et tables manquantes (PGRST205)
-- ==============================================================================

-- 1. EXTENSIONS & SCHEMA PRODUCTS
-- Garantir que toutes les colonnes multi-unités et synonymes existent sur la table products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_magasin NUMERIC(15,3) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_vente NUMERIC(15,3) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ucd TEXT DEFAULT 'Tonne';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS uv TEXT DEFAULT 'Paquet';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS coef NUMERIC(15,3) DEFAULT 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS coefficient_conversion NUMERIC(15,3) DEFAULT 1;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cout_achat NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS prix_vente NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS nom TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unite TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS entreprise_id UUID;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS secteur TEXT;

-- 2. TABLE : stock_magasin (Stock Magasin UCD centralisé)
CREATE TABLE IF NOT EXISTS public.stock_magasin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    produit_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    produit TEXT,
    stock_ucd NUMERIC(15,3) DEFAULT 0,
    quantite NUMERIC(15,3) DEFAULT 0,
    ucd TEXT DEFAULT 'UCD',
    unite TEXT DEFAULT 'UCD',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_stock_magasin_produit UNIQUE (produit_id)
);

ALTER TABLE public.stock_magasin ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.stock_magasin ADD COLUMN IF NOT EXISTS produit_id UUID;
ALTER TABLE public.stock_magasin ADD COLUMN IF NOT EXISTS produit TEXT;
ALTER TABLE public.stock_magasin ADD COLUMN IF NOT EXISTS stock_ucd NUMERIC(15,3) DEFAULT 0;
ALTER TABLE public.stock_magasin ADD COLUMN IF NOT EXISTS quantite NUMERIC(15,3) DEFAULT 0;
ALTER TABLE public.stock_magasin ADD COLUMN IF NOT EXISTS ucd TEXT DEFAULT 'UCD';
ALTER TABLE public.stock_magasin ADD COLUMN IF NOT EXISTS unite TEXT DEFAULT 'UCD';

CREATE INDEX IF NOT EXISTS idx_stock_magasin_company ON public.stock_magasin(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_magasin_produit ON public.stock_magasin(produit_id);

-- 3. TABLE : stocks_magazin (Historique et réceptions physiques magasin)
CREATE TABLE IF NOT EXISTS public.stocks_magazin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    produit_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    produit TEXT NOT NULL DEFAULT 'Produit',
    quantite NUMERIC(15,3) NOT NULL DEFAULT 0,
    stock_ucd NUMERIC(15,3) DEFAULT 0,
    unite TEXT DEFAULT 'UCD',
    ucd TEXT DEFAULT 'UCD',
    reference_bl TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS produit_id UUID;
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS produit TEXT DEFAULT 'Produit';
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS quantite NUMERIC(15,3) DEFAULT 0;
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS stock_ucd NUMERIC(15,3) DEFAULT 0;
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS unite TEXT DEFAULT 'UCD';
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS ucd TEXT DEFAULT 'UCD';
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS reference_bl TEXT;
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_stocks_magazin_company ON public.stocks_magazin(company_id);
CREATE INDEX IF NOT EXISTS idx_stocks_magazin_produit ON public.stocks_magazin(produit_id);

-- 4. TABLE : stock_movements (Traçabilité complète des mouvements de stock)
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL DEFAULT 'INITIAL', -- INITIAL, IN, OUT, TRANSFER, ADJUSTMENT
    quantity NUMERIC(15,3) NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'UCD',
    reference_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS product_id UUID;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS movement_type TEXT DEFAULT 'INITIAL';
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS quantity NUMERIC(15,3) DEFAULT 0;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'UCD';
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reference_id TEXT;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_stock_movements_prod ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_comp ON public.stock_movements(company_id);

-- 5. TABLES : bons_commande_lignes & bc_lignes (Lignes de bons de commande)
CREATE TABLE IF NOT EXISTS public.bons_commande_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    bc_id TEXT NOT NULL,
    bon_commande_id UUID,
    produit_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    article TEXT NOT NULL DEFAULT 'Article',
    designation TEXT,
    nom_produit TEXT,
    code_produit TEXT,
    quantite NUMERIC(15,3) NOT NULL DEFAULT 1,
    quantite_ucd NUMERIC(15,3) NOT NULL DEFAULT 1,
    quantite_recue NUMERIC(15,3) DEFAULT 0,
    qte_commande NUMERIC(15,3) DEFAULT 1,
    qte_recue NUMERIC(15,3) DEFAULT 0,
    unite_commande TEXT DEFAULT 'UCD',
    unite_ucd TEXT DEFAULT 'UCD',
    ucd TEXT DEFAULT 'UCD',
    coefficient_conversion NUMERIC(15,3) DEFAULT 1,
    prix_unitaire NUMERIC(15,2) DEFAULT 0,
    pu_ttc NUMERIC(15,2) DEFAULT 0,
    total_ht NUMERIC(15,2) DEFAULT 0,
    total_ttc NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bc_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    bc_id TEXT NOT NULL,
    bon_commande_id UUID,
    produit_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    article TEXT NOT NULL DEFAULT 'Article',
    quantite NUMERIC(15,3) NOT NULL DEFAULT 1,
    quantite_ucd NUMERIC(15,3) NOT NULL DEFAULT 1,
    quantite_recue NUMERIC(15,3) DEFAULT 0,
    unite_commande TEXT DEFAULT 'UCD',
    unite_ucd TEXT DEFAULT 'UCD',
    ucd TEXT DEFAULT 'UCD',
    coefficient_conversion NUMERIC(15,3) DEFAULT 1,
    prix_unitaire NUMERIC(15,2) DEFAULT 0,
    total_ttc NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir colonnes bc_lignes
ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS quantite NUMERIC(15,3) DEFAULT 1;
ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS quantite_ucd NUMERIC(15,3) DEFAULT 1;
ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS quantite_recue NUMERIC(15,3) DEFAULT 0;
ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS unite_commande TEXT DEFAULT 'UCD';
ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS unite_ucd TEXT DEFAULT 'UCD';
ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS ucd TEXT DEFAULT 'UCD';
ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS coefficient_conversion NUMERIC(15,3) DEFAULT 1;
ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS article TEXT DEFAULT 'Article';

-- 6. POLITIQUES RLS PERMISSIVES
ALTER TABLE public.stock_magasin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_stock_magasin" ON public.stock_magasin;
CREATE POLICY "allow_all_stock_magasin" ON public.stock_magasin FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.stocks_magazin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_stocks_magazin" ON public.stocks_magazin;
CREATE POLICY "allow_all_stocks_magazin" ON public.stocks_magazin FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_stock_movements" ON public.stock_movements;
CREATE POLICY "allow_all_stock_movements" ON public.stock_movements FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.bons_commande_lignes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_bons_commande_lignes" ON public.bons_commande_lignes;
CREATE POLICY "allow_all_bons_commande_lignes" ON public.bons_commande_lignes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.bc_lignes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_bc_lignes" ON public.bc_lignes;
CREATE POLICY "allow_all_bc_lignes" ON public.bc_lignes FOR ALL USING (true) WITH CHECK (true);

-- 7. RECHARGER LE CACHE POSTGREST
NOTIFY pgrst, 'reload schema';
