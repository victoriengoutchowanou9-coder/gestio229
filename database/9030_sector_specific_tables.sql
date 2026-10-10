-- =============================================================================
-- GESTIO 229 — SCRIPT GLOBAL TABLES SPÉCIFIQUES MULTI-SECTEURS
-- Fichier : database/9030_sector_specific_tables.sql
-- =============================================================================

-- Table : poissonnerie_avaries
CREATE TABLE IF NOT EXISTS public.poissonnerie_avaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  secteur_id UUID,
  sector_slug TEXT DEFAULT 'poissonnerie',
  caisse_id UUID,
  date_avarie DATE DEFAULT CURRENT_DATE,
  produit_id UUID,
  produit_nom TEXT NOT NULL,
  quantite_kg NUMERIC(10,2) NOT NULL DEFAULT 0,
  cause TEXT,
  description TEXT,
  perte_fcfa NUMERIC(12,2) DEFAULT 0,
  temperature_relevee NUMERIC(5,2),
  lot_numero TEXT,
  fournisseur_id UUID,
  photo_url TEXT,
  reference TEXT DEFAULT concat('AVR-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
  chambre_froide TEXT,
  motif_avarie TEXT DEFAULT 'DLC',
  valeur_estimee NUMERIC(12,2) DEFAULT 0,
  action_prise TEXT DEFAULT 'En_Attente',
  date_constat DATE DEFAULT CURRENT_DATE,
  agent_constat TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Colonnes de compatibilité
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES companies(id) ON DELETE CASCADE;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS secteur_id UUID;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'poissonnerie';
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS caisse_id UUID;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS date_avarie DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS produit_id UUID;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS produit_nom TEXT;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS quantite_kg NUMERIC(10,2) DEFAULT 0;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS cause TEXT;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS perte_fcfa NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS temperature_relevee NUMERIC(5,2);
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS lot_numero TEXT;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS fournisseur_id UUID;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS chambre_froide TEXT;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS motif_avarie TEXT DEFAULT 'DLC';
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS valeur_estimee NUMERIC(12,2) DEFAULT 0;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS action_prise TEXT DEFAULT 'En_Attente';
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS date_constat DATE DEFAULT CURRENT_DATE;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS agent_constat TEXT;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.poissonnerie_avaries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_poissonnerie_avaries_secteur ON public.poissonnerie_avaries(secteur_id);
CREATE INDEX IF NOT EXISTS idx_poissonnerie_avaries_company ON public.poissonnerie_avaries(company_id);
CREATE INDEX IF NOT EXISTS idx_poissonnerie_avaries_sector_slug ON public.poissonnerie_avaries(sector_slug);

ALTER TABLE public.poissonnerie_avaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all" ON public.poissonnerie_avaries;
CREATE POLICY "allow_all" ON public.poissonnerie_avaries FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "company_isolation" ON public.poissonnerie_avaries;
CREATE POLICY "company_isolation" ON public.poissonnerie_avaries FOR ALL USING (true) WITH CHECK (true);
