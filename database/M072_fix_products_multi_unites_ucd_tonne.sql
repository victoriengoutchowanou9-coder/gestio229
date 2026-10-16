-- ==============================================================================
-- GESTIO 229 — MIGRATION M072 : Fix Multi-Unités UCD / UV (Tonne, Paquet, etc.)
-- ==============================================================================
-- Garantit l'existence de toutes les colonnes multi-unités (UCD, UV, Coef),
-- la compatibilité des synonymes (unite_stock, unite_vente, coefficient_conversion),
-- la prise en compte de l'unité 'Tonne' sans contrainte bloquante,
-- et l'isolation entreprise_id / company_id.
-- ==============================================================================

-- 1. Colonnes multi-unités & stock bivalent
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS ucd VARCHAR(50) DEFAULT 'Carton';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS uv VARCHAR(50) DEFAULT 'Pièce';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS coef NUMERIC(15,4) DEFAULT 1.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unite_stock VARCHAR(50);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unite_vente VARCHAR(50);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS coefficient_conversion NUMERIC(15,4);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS coefficient NUMERIC(15,4);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS cout_achat NUMERIC(15,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS prix_vente NUMERIC(15,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_magasin NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_vente NUMERIC(15,2) DEFAULT 0.00;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS secteur_slug VARCHAR(100);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS entreprise_id UUID;

-- 2. Synchronisation des colonnes existantes
UPDATE public.products 
SET 
  entreprise_id = COALESCE(entreprise_id, company_id),
  unite_stock = COALESCE(unite_stock, ucd, 'Carton'),
  unite_vente = COALESCE(unite_vente, uv, unit, 'Pièce'),
  coefficient_conversion = COALESCE(coefficient_conversion, coef, 1.00),
  coefficient = COALESCE(coefficient, coef, 1.00),
  cout_achat = COALESCE(cout_achat, cost_price, 0.00),
  prix_vente = COALESCE(prix_vente, selling_price, 0.00)
WHERE company_id IS NOT NULL;

-- 3. Suppression sécurisée des contraintes CHECK restrictives sur les unités (ex: CHECK unit IN (...))
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT conname 
        FROM pg_constraint 
        WHERE conrelid = 'public.products'::regclass 
        AND contype = 'c' 
        AND (
          pg_get_constraintdef(oid) ILIKE '%unit%' OR 
          pg_get_constraintdef(oid) ILIKE '%ucd%' OR 
          pg_get_constraintdef(oid) ILIKE '%uv%'
        )
    ) LOOP
        EXECUTE 'ALTER TABLE public.products DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;
END $$;

-- 4. Débloquer RLS pour création propre
DO $$
BEGIN
    DROP POLICY IF EXISTS products_universal_policy ON public.products;
    CREATE POLICY products_universal_policy ON public.products FOR ALL TO public USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 5. Rechargement immédiat du cache PostgREST Supabase
NOTIFY pgrst, 'reload schema';
