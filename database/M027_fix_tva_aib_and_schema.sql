-- ==============================================================================
-- M027 : FIX FISCALITÉ TVA & AIB + HARMONISATION SCHEMA SECTOR_META
-- 1. Ajouter colonnes AIB explicites sur products
-- 2. Ajouter sector_meta (JSONB) sur sales_orders, sales_order_items, expenses, stock_movements
-- 3. Recharger le schéma PostgREST
-- ==============================================================================

-- 1. Colonnes AIB sur products si absentes
ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS is_aib_subject BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS aib_rate       NUMERIC(5,2) DEFAULT 0.00;

-- Mettre à jour is_aib_subject et aib_rate depuis sector_meta pour les produits existants
UPDATE public.products
SET
    is_aib_subject = COALESCE((sector_meta->>'is_aib_subject')::boolean, false),
    aib_rate = COALESCE((sector_meta->>'aib_rate')::numeric, 0.00)
WHERE sector_meta IS NOT NULL;

-- 2. Harmonisation sector_meta sur les tables de gestion pour éviter toute erreur de cache
ALTER TABLE public.sales_orders
    ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.sales_order_items
    ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.expenses
    ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.stock_movements
    ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.cash_sessions
    ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.caisses
    ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;

-- 3. Rechargement du cache de schéma PostgREST
NOTIFY pgrst, 'reload schema';
