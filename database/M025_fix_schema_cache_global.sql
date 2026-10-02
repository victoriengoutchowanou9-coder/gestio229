-- ==============================================================================
-- M025 : FIX SCHEMA CACHE GLOBAL - GESTIO 229 ERP
-- Résout : "Could not find column 'X' in schema cache" sur customers, products,
--          suppliers, expenses, sales_orders, sales_order_items, stock_movements
-- Migration 100% additive (IF NOT EXISTS / IF NOT EXISTS) - idempotente
-- Date : Octobre 2026
-- ==============================================================================

-- ============================================================
-- 1. TABLE : customers
-- Colonnes manquantes détectées par analyse du frontend
-- ============================================================
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS notes          TEXT,
    ADD COLUMN IF NOT EXISTS credit_authorized BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS discount_eligible BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS discount_rate  NUMERIC(5,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS sector_slug    VARCHAR(100) DEFAULT 'boutique',
    ADD COLUMN IF NOT EXISTS sector_meta    JSONB DEFAULT '{}'::jsonb;

-- Rétro-remplissage sector_slug null
UPDATE public.customers
SET sector_slug = 'boutique'
WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';

CREATE INDEX IF NOT EXISTS idx_customers_company_sector
    ON public.customers(company_id, sector_slug);

-- ============================================================
-- 2. TABLE : suppliers
-- Colonnes manquantes détectées par analyse du frontend
-- ============================================================
ALTER TABLE public.suppliers
    ADD COLUMN IF NOT EXISTS notes          TEXT,
    ADD COLUMN IF NOT EXISTS sector_slug    VARCHAR(100) DEFAULT 'boutique',
    ADD COLUMN IF NOT EXISTS sector_meta    JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS current_debt   NUMERIC(15,2) DEFAULT 0.00;

-- Rétro-remplissage
UPDATE public.suppliers
SET sector_slug = 'boutique'
WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';

CREATE INDEX IF NOT EXISTS idx_suppliers_company_sector
    ON public.suppliers(company_id, sector_slug);

-- ============================================================
-- 3. TABLE : products
-- sector_slug ajouté par M020 mais parfois absent
-- ============================================================
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS sector_slug    VARCHAR(100) DEFAULT 'boutique';

UPDATE public.products
SET sector_slug = 'boutique'
WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';

CREATE INDEX IF NOT EXISTS idx_products_company_sector
    ON public.products(company_id, sector_slug);

-- ============================================================
-- 4. TABLE : expenses
-- sector_slug + title (alias de beneficiary) + expense_date
-- ============================================================
ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS sector_slug    VARCHAR(100) DEFAULT 'boutique',
    ADD COLUMN IF NOT EXISTS title          VARCHAR(255),
    ADD COLUMN IF NOT EXISTS expense_date   DATE DEFAULT CURRENT_DATE;

UPDATE public.expenses
SET sector_slug = 'boutique'
WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';

-- Rétro-remplir title depuis beneficiary
UPDATE public.expenses
SET title = beneficiary
WHERE title IS NULL AND beneficiary IS NOT NULL;

-- Rétro-remplir expense_date depuis created_at
UPDATE public.expenses
SET expense_date = created_at::DATE
WHERE expense_date IS NULL AND created_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_company_sector
    ON public.expenses(company_id, sector_slug);

-- ============================================================
-- 5. TABLE : sales_orders
-- Colonnes manquantes : sector_slug, payment_method, customer_name, status, notes
-- ============================================================
ALTER TABLE public.sales_orders
    ADD COLUMN IF NOT EXISTS sector_slug    VARCHAR(100) DEFAULT 'boutique',
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50),
    ADD COLUMN IF NOT EXISTS customer_name  VARCHAR(255),
    ADD COLUMN IF NOT EXISTS status         VARCHAR(50) DEFAULT 'COMPLET',
    ADD COLUMN IF NOT EXISTS notes          TEXT;

UPDATE public.sales_orders
SET sector_slug = 'boutique'
WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';

CREATE INDEX IF NOT EXISTS idx_sales_orders_company_sector
    ON public.sales_orders(company_id, sector_slug);

-- ============================================================
-- 6. TABLE : sales_order_items
-- company_id + sector_slug manquants (inserts directs via supabase.from())
-- ============================================================
ALTER TABLE public.sales_order_items
    ADD COLUMN IF NOT EXISTS company_id     UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS sector_slug    VARCHAR(100) DEFAULT 'boutique';

-- Rétro-remplir company_id depuis la commande parente
UPDATE public.sales_order_items soi
SET company_id = so.company_id,
    sector_slug = COALESCE(so.sector_slug, 'boutique')
FROM public.sales_orders so
WHERE soi.order_id = so.id
  AND soi.company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_soi_company_sector
    ON public.sales_order_items(company_id, sector_slug);

-- ============================================================
-- 7. TABLE : stock_movements
-- Colonnes manquantes : reference_type, reference_number, previous_stock,
--                       new_stock, total_cost, sector_slug
-- ============================================================
ALTER TABLE public.stock_movements
    ADD COLUMN IF NOT EXISTS sector_slug      VARCHAR(100) DEFAULT 'boutique',
    ADD COLUMN IF NOT EXISTS reference_type   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS previous_stock   NUMERIC(15,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS new_stock        NUMERIC(15,2) DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS total_cost       NUMERIC(15,2) DEFAULT 0.00;

UPDATE public.stock_movements
SET sector_slug = 'boutique'
WHERE sector_slug IS NULL OR TRIM(sector_slug) = '';

CREATE INDEX IF NOT EXISTS idx_stock_mvt_company_sector
    ON public.stock_movements(company_id, sector_slug);

-- ============================================================
-- 8. TABLE : coffre_fort (nouvelle - Trésorerie consolidée)
-- Utilisée par supabaseTenant.ts getCoffreFort / debitCoffreFort
-- ============================================================
CREATE TABLE IF NOT EXISTS public.coffre_fort (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug      VARCHAR(100) NOT NULL DEFAULT 'boutique',
    solde_especes    NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    solde_momo_marchand NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    solde_banque     NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    created_at       TIMESTAMPTZ DEFAULT now(),
    updated_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, sector_slug)
);

CREATE INDEX IF NOT EXISTS idx_coffre_fort_company_sector
    ON public.coffre_fort(company_id, sector_slug);

-- ============================================================
-- 9. TABLE : caisse_mouvements (nouvelle - Flux de caisse isolés)
-- Utilisée dans POSPage.tsx pour tracer encaissements
-- ============================================================
CREATE TABLE IF NOT EXISTS public.caisse_mouvements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'boutique',
    caisse_id   UUID,             -- FK optionnel vers caisses.id
    type        VARCHAR(50) NOT NULL DEFAULT 'especes',  -- especes | momo | virement | cheque
    sens        VARCHAR(10) NOT NULL DEFAULT 'entree',   -- entree | sortie
    montant     NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    motif       TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caisse_mvt_company_sector
    ON public.caisse_mouvements(company_id, sector_slug, created_at DESC);

-- ============================================================
-- 10. TABLE : caisses (nouvelle - Sessions de caisse isolées par secteur)
-- Utilisée par supabaseTenant.ts getActiveCaisse
-- ============================================================
CREATE TABLE IF NOT EXISTS public.caisses (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug           VARCHAR(100) NOT NULL DEFAULT 'boutique',
    statut                VARCHAR(20) NOT NULL DEFAULT 'fermee',  -- ouverte | fermee
    date_ouverture        TIMESTAMPTZ DEFAULT now(),
    date_fermeture        TIMESTAMPTZ,
    fond_ouverture_especes NUMERIC(15,2) DEFAULT 0.00,
    fond_ouverture_momo   NUMERIC(15,2) DEFAULT 0.00,
    solde_especes_final   NUMERIC(15,2) DEFAULT 0.00,
    solde_momo_final      NUMERIC(15,2) DEFAULT 0.00,
    ouvert_par            UUID REFERENCES public.user_profiles(id),
    ferme_par             UUID REFERENCES public.user_profiles(id),
    created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caisses_company_sector_statut
    ON public.caisses(company_id, sector_slug, statut);

-- ============================================================
-- 11. RLS - Politiques permissives sur les nouvelles tables
-- (compatibles avec l'architecture existante du projet)
-- ============================================================
ALTER TABLE public.coffre_fort       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caisse_mouvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caisses           ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- coffre_fort
    DROP POLICY IF EXISTS "tenant_isolation_coffre_fort" ON public.coffre_fort;
    CREATE POLICY "tenant_isolation_coffre_fort" ON public.coffre_fort
        FOR ALL USING (true) WITH CHECK (true);

    -- caisse_mouvements
    DROP POLICY IF EXISTS "tenant_isolation_caisse_mouvements" ON public.caisse_mouvements;
    CREATE POLICY "tenant_isolation_caisse_mouvements" ON public.caisse_mouvements
        FOR ALL USING (true) WITH CHECK (true);

    -- caisses
    DROP POLICY IF EXISTS "tenant_isolation_caisses" ON public.caisses;
    CREATE POLICY "tenant_isolation_caisses" ON public.caisses
        FOR ALL USING (true) WITH CHECK (true);
END $$;

-- ============================================================
-- 12. NOTIFY PostgREST pour recharger le schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- FIN M025 - Toutes les colonnes manquantes ont été ajoutées
-- Résumé des colonnes ajoutées :
--   customers     : notes, credit_authorized, discount_eligible, discount_rate, sector_slug, sector_meta
--   suppliers     : notes, sector_slug, sector_meta, current_debt
--   products      : sector_slug
--   expenses      : sector_slug, title, expense_date
--   sales_orders  : sector_slug, payment_method, customer_name, status, notes
--   sales_order_items : company_id, sector_slug
--   stock_movements   : sector_slug, reference_type, reference_number, previous_stock, new_stock, total_cost
--   Nouvelles tables  : coffre_fort, caisse_mouvements, caisses
-- ==============================================================================
