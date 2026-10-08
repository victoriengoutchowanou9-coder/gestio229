-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M044 : ISOLATION STRICTE MULTI-SECTEURS
-- RÈGLE ABSOLUE : CHAQUE SECTEUR AVEC SES PRODUITS, STOCKS, CAISSE ET CLIENTS
-- SEULE EXCEPTION : COMPTABILITÉ SYSCOHADA (CONSOLIDÉE / GLOBALE)
-- =============================================================================

-- 1. COLONNES secteur_id PARTOUT (compatibilité tables françaises et anglaises)
DO $$
BEGIN
  -- Table secteurs
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'secteurs') THEN
    CREATE TABLE public.secteurs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      nom TEXT NOT NULL,
      slug TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(company_id, slug)
    );
  END IF;

  -- Table products / produits
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'products') THEN
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS secteur_id UUID;
    ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'produits') THEN
    ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS secteur_id UUID;
    ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);
  END IF;

  -- Table stock_magasin
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_magasin') THEN
    ALTER TABLE public.stock_magasin ADD COLUMN IF NOT EXISTS secteur_id UUID;
    ALTER TABLE public.stock_magasin ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);
  ELSE
    CREATE TABLE IF NOT EXISTS public.stock_magasin (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      secteur_id UUID,
      sector_slug VARCHAR(100),
      produit_id UUID,
      product_id UUID,
      quantite NUMERIC DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;

  -- Table stock_vente
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_vente') THEN
    ALTER TABLE public.stock_vente ADD COLUMN IF NOT EXISTS secteur_id UUID;
    ALTER TABLE public.stock_vente ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100);
    ALTER TABLE public.stock_vente ADD COLUMN IF NOT EXISTS caisse_id UUID;
  ELSE
    CREATE TABLE IF NOT EXISTS public.stock_vente (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      secteur_id UUID,
      sector_slug VARCHAR(100),
      caisse_id UUID,
      produit_id UUID,
      product_id UUID,
      quantite NUMERIC DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;

  -- Table sessions_caisse
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sessions_caisse') THEN
    ALTER TABLE public.sessions_caisse ADD COLUMN IF NOT EXISTS secteur_id UUID;
  END IF;

  -- Table fonds_actuels
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fonds_actuels') THEN
    ALTER TABLE public.fonds_actuels ADD COLUMN IF NOT EXISTS secteur_id UUID;
  END IF;

  -- Table depenses / expenses
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'depenses') THEN
    ALTER TABLE public.depenses ADD COLUMN IF NOT EXISTS secteur_id UUID;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'expenses') THEN
    ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS secteur_id UUID;
  END IF;

  -- Table factures / sales_orders
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'factures') THEN
    ALTER TABLE public.factures ADD COLUMN IF NOT EXISTS secteur_id UUID;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sales_orders') THEN
    ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS secteur_id UUID;
  END IF;

  -- Table clients / customers
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients') THEN
    ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS secteur_id UUID;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS secteur_id UUID;
  END IF;

  -- Table mouvements_stock
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mouvements_stock') THEN
    CREATE TABLE public.mouvements_stock (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      company_id UUID NOT NULL,
      secteur_id UUID,
      sector_slug VARCHAR(100),
      produit_id UUID,
      type TEXT NOT NULL,
      qte NUMERIC NOT NULL,
      source TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END $$;

-- 2. CORRECTION DES PRODUITS EXISTANTS PAR SECTEUR
-- Brasserie : CASTEL, FLAG
UPDATE public.products 
SET sector_slug = 'brasserie'
WHERE (nom ILIKE '%castel%' OR nom ILIKE '%flag%' OR code IN ('PRD-007','PRD-005','PRD-006','PRD-004'))
  AND (sector_slug IS NULL OR sector_slug = '' OR sector_slug = 'boutique');

-- Poissonnerie : Cuisse Rapide, HM, Tilapia, Poisson
UPDATE public.products 
SET sector_slug = 'poissonnerie'
WHERE (nom ILIKE '%cuisse%' OR nom ILIKE '%hm 16%' OR nom ILIKE '%hm 20%' OR nom ILIKE '%poisson%' OR nom ILIKE '%tilapia%' OR code IN ('PRD-003','PRD-001','PRD-002'))
  AND (sector_slug IS NULL OR sector_slug = '' OR sector_slug = 'boutique');

-- Synchronisation de secteur_id sur products si table secteurs existe
UPDATE public.products p
SET secteur_id = s.id
FROM public.secteurs s
WHERE p.company_id = s.company_id 
  AND p.sector_slug = s.slug
  AND p.secteur_id IS NULL;

-- 3. INDEX POUR ACCÉLÉRER L'ISOLATION STRICTE
CREATE INDEX IF NOT EXISTS idx_products_company_sector ON public.products(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_products_company_secteur_id ON public.products(company_id, secteur_id);
CREATE INDEX IF NOT EXISTS idx_stock_magasin_isolation ON public.stock_magasin(company_id, secteur_id);
CREATE INDEX IF NOT EXISTS idx_stock_vente_isolation ON public.stock_vente(company_id, secteur_id);

-- 4. FONCTION SQL : fn_destockage_vente_secteur
CREATE OR REPLACE FUNCTION fn_destockage_vente_secteur(
  p_company_id UUID,
  p_secteur_id UUID,
  p_caisse_id UUID,
  p_produit_id UUID,
  p_qte NUMERIC
) RETURNS JSON AS $$
DECLARE
  v_stock NUMERIC := 0;
BEGIN
  -- 1. Chercher dans stock_vente
  SELECT quantite INTO v_stock FROM public.stock_vente 
  WHERE company_id = p_company_id 
    AND (secteur_id = p_secteur_id OR secteur_id IS NULL)
    AND (caisse_id = p_caisse_id OR caisse_id IS NULL)
    AND (produit_id = p_produit_id OR product_id = p_produit_id)
  LIMIT 1;

  IF v_stock IS NOT NULL AND v_stock >= p_qte THEN
    UPDATE public.stock_vente 
    SET quantite = quantite - p_qte, updated_at = NOW()
    WHERE company_id = p_company_id 
      AND (secteur_id = p_secteur_id OR secteur_id IS NULL)
      AND (caisse_id = p_caisse_id OR caisse_id IS NULL)
      AND (produit_id = p_produit_id OR product_id = p_produit_id);
  END IF;

  -- 2. Décrémenter également dans products (stock_vente colonne directe)
  UPDATE public.products
  SET stock_vente = GREATEST(0, COALESCE(stock_vente, 0) - p_qte),
      updated_at = NOW()
  WHERE id = p_produit_id AND company_id = p_company_id;

  -- 3. Traçabilité mouvements_stock
  INSERT INTO public.mouvements_stock (company_id, secteur_id, produit_id, type, qte, source)
  VALUES (p_company_id, p_secteur_id, p_produit_id, 'SORTIE', p_qte, 'VENTE_POS');

  RETURN json_build_object('success', true, 'qte_deduite', p_qte);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
