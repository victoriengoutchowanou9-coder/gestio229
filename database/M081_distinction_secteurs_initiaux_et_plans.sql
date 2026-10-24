-- =============================================================================
-- GESTIO 229 ERP — MIGRATION M081 (2026-10-24)
-- DISTINCTION DES SECTEURS INITIAUX, NOUVEAUX SECTEURS ET CONSERVATION DES PLANS
-- =============================================================================
-- Règle 2 : Distinguer les secteurs initiaux des nouveaux secteurs ajoutés
-- Règle 3 : Gestion des 3 premiers secteurs gratuits lors de l'inscription
-- Règle 4 : Conservation durable du plan choisi à l'inscription (Starter vs Complet)
-- Règle 5 : Choix individuel Starter (5 000 F) ou Complet (10 000 F) pour secteurs ajoutés
-- Règle 8 : Conservation des dates, statuts et montants sans écrasement
-- =============================================================================

BEGIN;

-- 1. Enrichissement de la table companies pour la mémorisation des plans et métadonnées d'inscription
ALTER TABLE IF EXISTS public.companies
  ADD COLUMN IF NOT EXISTS initial_plan VARCHAR(50) DEFAULT 'entreprise',
  ADD COLUMN IF NOT EXISTS initial_sectors JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS added_sectors JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS added_sectors_plans JSONB DEFAULT '{}'::jsonb;

-- 2. Enrichissement de la table abonnements_secteurs pour le suivi unitaire par secteur
ALTER TABLE IF EXISTS public.abonnements_secteurs
  ADD COLUMN IF NOT EXISTS is_initial_sector BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS plan_secteur VARCHAR(50) DEFAULT 'entreprise',
  ADD COLUMN IF NOT EXISTS is_gratuit BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS date_debut_gratuit TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS date_fin_gratuit TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS date_ajout TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS montant_mensuel NUMERIC(15,2) DEFAULT 10000;

-- 3. Rétro-compatibilité : Initialiser les secteurs existants comme secteurs initiaux
UPDATE public.abonnements_secteurs
SET is_initial_sector = true
WHERE is_initial_sector IS NULL;

-- 4. Recharger le schéma PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
