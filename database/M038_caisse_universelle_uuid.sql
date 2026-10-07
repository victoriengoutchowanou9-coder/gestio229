-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M038 : CAISSES UNIVERSELLES & RÉPARATION GLOBALE UUID
-- =============================================================================
-- 1. Table `caisses` : schéma universel avec clés UUID strictes
-- 2. Nettoyage de toutes les éventuelles caisses avec ID texte dummy
-- 3. Auto-génération de caisses pour toutes les entreprises et secteurs manquants
-- =============================================================================

-- 1. STRUCTURE BDD — TABLE `caisses`
CREATE TABLE IF NOT EXISTS public.caisses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sector_key TEXT NOT NULL DEFAULT 'boutique',
  name TEXT NOT NULL DEFAULT 'Caisse Principale',
  solde_actuel NUMERIC DEFAULT 0,
  is_open BOOLEAN DEFAULT false,
  opened_at TIMESTAMPTZ,
  opened_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, sector_key, name)
);

-- Colonnes de compatibilité et alignement des schémas
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS sector_key TEXT DEFAULT 'boutique';
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS secteur_slug VARCHAR(100) DEFAULT 'boutique';
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Caisse Principale';
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS nom VARCHAR(255) DEFAULT 'Caisse Principale';
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS code VARCHAR(100);
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS solde_actuel NUMERIC DEFAULT 0;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS is_open BOOLEAN DEFAULT false;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS statut VARCHAR(30) DEFAULT 'fermee';
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS date_ouverture TIMESTAMPTZ;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS date_fermeture TIMESTAMPTZ;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS fond_ouverture_especes NUMERIC DEFAULT 0;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS fond_ouverture_momo NUMERIC DEFAULT 0;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS solde_especes_final NUMERIC DEFAULT 0;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS solde_momo_final NUMERIC DEFAULT 0;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS opened_by UUID REFERENCES auth.users(id);
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS ouvert_par UUID;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS ferme_par UUID;
ALTER TABLE public.caisses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Synchronisation bidirectionnelle des colonnes
UPDATE public.caisses SET sector_key = COALESCE(sector_key, sector_slug, secteur_slug, 'boutique');
UPDATE public.caisses SET sector_slug = COALESCE(sector_slug, sector_key, 'boutique');
UPDATE public.caisses SET secteur_slug = COALESCE(secteur_slug, sector_slug, sector_key, 'boutique');
UPDATE public.caisses SET name = COALESCE(name, nom, 'Caisse Principale');
UPDATE public.caisses SET nom = COALESCE(nom, name, 'Caisse Principale');
UPDATE public.caisses SET is_open = (statut = 'ouverte');
UPDATE public.caisses SET statut = CASE WHEN is_open = true THEN 'ouverte' ELSE 'fermee' END;
UPDATE public.caisses SET opened_at = date_ouverture;
UPDATE public.caisses SET date_ouverture = opened_at;
UPDATE public.caisses SET solde_actuel = COALESCE(solde_actuel, solde_especes_final, fond_ouverture_especes, 0);

-- Table des sessions de caisse (isolation par vrai UUID)
CREATE TABLE IF NOT EXISTS public.caisse_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    caisse_id UUID REFERENCES public.caisses(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) DEFAULT 'boutique',
    secteur_slug VARCHAR(100) DEFAULT 'boutique',
    ouvert_par UUID,
    ouvert_par_nom VARCHAR(255),
    date_ouverture TIMESTAMPTZ DEFAULT now(),
    date_fermeture TIMESTAMPTZ,
    statut VARCHAR(30) DEFAULT 'ouverte',
    fond_ouverture_especes NUMERIC(15, 2) DEFAULT 0,
    fond_actuel_especes NUMERIC(15, 2) DEFAULT 0,
    fond_actuel_momo NUMERIC(15, 2) DEFAULT 0,
    especes_du_jour NUMERIC(15, 2) DEFAULT 0,
    momo_du_jour NUMERIC(15, 2) DEFAULT 0,
    ca_du_jour NUMERIC(15, 2) DEFAULT 0,
    especes_theorique NUMERIC(15, 2) DEFAULT 0,
    especes_comptees NUMERIC(15, 2) DEFAULT 0,
    ecart NUMERIC(15, 2) DEFAULT 0,
    cloture_par VARCHAR(255),
    notes_fermeture TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Table des mouvements de caisse
CREATE TABLE IF NOT EXISTS public.caisse_mouvements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    caisse_id UUID REFERENCES public.caisses(id) ON DELETE CASCADE,
    caisse_session_id UUID,
    sector_slug VARCHAR(100) DEFAULT 'boutique',
    secteur_slug VARCHAR(100) DEFAULT 'boutique',
    type VARCHAR(50) NOT NULL,
    sens VARCHAR(20) NOT NULL,
    montant_especes NUMERIC(15, 2) DEFAULT 0,
    montant_momo NUMERIC(15, 2) DEFAULT 0,
    montant_total NUMERIC(15, 2) DEFAULT 0,
    source_module VARCHAR(50),
    source_id TEXT,
    motif TEXT,
    user_id UUID,
    user_name VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. SUPPRESSION DES FAUSSES CAISSES TEXTE (Règle d'or)
DELETE FROM public.caisses WHERE id::text LIKE 'caisse-%' OR company_id::text LIKE 'caisse-%';

-- 3. RÉPARATION / CRÉATION AUTOMATIQUE DES CAISSES MANQUANTES POUR TOUTES LES ENTREPRISES
INSERT INTO public.caisses (company_id, sector_key, sector_slug, secteur_slug, name, nom, is_open, statut, solde_actuel, fond_ouverture_especes)
SELECT 
    c.id, 
    cs.sector_key, 
    cs.sector_key, 
    cs.sector_key, 
    'Caisse Principale ' || UPPER(cs.sector_key), 
    'Caisse Principale ' || UPPER(cs.sector_key), 
    false, 
    'fermee', 
    0, 
    0
FROM public.companies c
JOIN public.company_sectors cs ON cs.company_id = c.id
WHERE NOT EXISTS (
    SELECT 1 FROM public.caisses ca 
    WHERE ca.company_id = c.id 
      AND (ca.sector_key = cs.sector_key OR ca.sector_slug = cs.sector_key OR ca.secteur_slug = cs.sector_key)
)
ON CONFLICT DO NOTHING;
