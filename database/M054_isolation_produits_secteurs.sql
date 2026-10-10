-- =============================================================================
-- GESTIO 229 SaaS — Migration M054 : Isolation Totale des Produits par Secteur
-- Correction de la fuite de stock entre Supermarché, Brasserie et Quincaillerie
-- =============================================================================

-- 1. Vérification et ajout sécurisé des colonnes de cloisonnement sectoriel
ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS sector_slug TEXT;
ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS secteur_slug TEXT;
ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS sector_meta JSONB DEFAULT '{}'::jsonb;

-- 2. Indexation pour performances instantanées des caisses POS
CREATE INDEX IF NOT EXISTS idx_products_company_sector ON products(company_id, sector_slug);

-- 3. Rétro-affectation stricte des produits de Brasserie orphelins (Beaufort, Castel, Béninoise, casiers, etc.)
UPDATE products
SET 
  sector_slug = 'brasserie',
  secteur_slug = 'brasserie',
  sector_meta = jsonb_set(
    COALESCE(sector_meta, '{}'::jsonb),
    '{sector_slug}',
    '"brasserie"'::jsonb,
    true
  )
WHERE 
  (sector_slug IS NULL OR sector_slug = '' OR sector_slug = 'boutique' OR sector_slug = 'general')
  AND (
    name ILIKE '%beaufort%'
    OR name ILIKE '%béninoise%'
    OR name ILIKE '%beninoise%'
    OR name ILIKE '%castel%'
    OR name ILIKE '%guinness%'
    OR name ILIKE '%sobebra%'
    OR name ILIKE '%youki%'
    OR name ILIKE '%casiers%'
    OR name ILIKE '%casier%'
    OR name ILIKE '%capsule%'
    OR name ILIKE '%c12t%'
    OR name ILIKE '%c20t%'
    OR name ILIKE '%c24t%'
    OR name ILIKE '%bière%'
    OR name ILIKE '%biere%'
    OR name ILIKE '%doppel%'
    OR name ILIKE '%racines%'
    OR name ILIKE '%chill%'
    OR name ILIKE '%panach%'
    OR name ILIKE '%heineken%'
    OR name ILIKE '%boisson%'
  );

-- 4. Rétro-affectation des matériaux BTP orphelins vers la Quincaillerie
UPDATE products
SET 
  sector_slug = 'quincaillerie',
  secteur_slug = 'quincaillerie',
  sector_meta = jsonb_set(
    COALESCE(sector_meta, '{}'::jsonb),
    '{sector_slug}',
    '"quincaillerie"'::jsonb,
    true
  )
WHERE 
  (sector_slug IS NULL OR sector_slug = '' OR sector_slug = 'boutique')
  AND (
    name ILIKE '%ciment%'
    OR name ILIKE '%fer à béton%'
    OR name ILIKE '%fer a beton%'
    OR name ILIKE '%béton%'
    OR name ILIKE '%beton%'
    OR name ILIKE '%tôle%'
    OR name ILIKE '%tole%'
    OR name ILIKE '%quincaillerie%'
    OR name ILIKE '%pointes%'
    OR name ILIKE '%brouette%'
  );

-- 5. Rétro-affectation des poissons / cartons surgelés orphelins vers la Poissonnerie
UPDATE products
SET 
  sector_slug = 'poissonnerie',
  secteur_slug = 'poissonnerie',
  sector_meta = jsonb_set(
    COALESCE(sector_meta, '{}'::jsonb),
    '{sector_slug}',
    '"poissonnerie"'::jsonb,
    true
  )
WHERE 
  (sector_slug IS NULL OR sector_slug = '' OR sector_slug = 'boutique')
  AND (
    name ILIKE '%tilapia%'
    OR name ILIKE '%chinchard%'
    OR name ILIKE '%hake%'
    OR name ILIKE '%hm 16%'
    OR name ILIKE '%cuisse de poulet%'
    OR name ILIKE '%poisson%'
  );

-- 6. Synchronisation si la table physique s'appelle 'produits'
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'produits') THEN
    ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS sector_slug TEXT;
    ALTER TABLE public.produits ADD COLUMN IF NOT EXISTS secteur_slug TEXT;

    UPDATE public.produits
    SET sector_slug = 'brasserie', secteur_slug = 'brasserie'
    WHERE (sector_slug IS NULL OR sector_slug = '' OR sector_slug = 'boutique')
      AND (
        nom ILIKE '%beaufort%'
        OR nom ILIKE '%béninoise%'
        OR nom ILIKE '%beninoise%'
        OR nom ILIKE '%castel%'
        OR nom ILIKE '%guinness%'
        OR nom ILIKE '%sobebra%'
        OR nom ILIKE '%youki%'
        OR nom ILIKE '%casiers%'
        OR nom ILIKE '%casier%'
      );
  END IF;
END $$;
