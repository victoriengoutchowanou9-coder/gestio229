-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M085 : SYNCHRONISATION SCHÉMA FISCALITÉ & e-MECeF
-- =============================================================================
-- Ajoute les colonnes manquantes dans la table companies afin de synchroniser
-- le schéma Supabase PostgREST avec le module Configuration Entreprise -> Fiscalité & e-MECeF.
-- Migration 100% additive, non destructrice, idempotente (IF NOT EXISTS).
-- =============================================================================

BEGIN;

-- 1. Table companies : colonnes fiscalité & e-MECeF DGI Bénin
ALTER TABLE IF EXISTS public.companies
    ADD COLUMN IF NOT EXISTS e_mecef_active BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS e_mecef_connected BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS e_mecef_nim VARCHAR(100) DEFAULT 'BENIN-DGI-EMEF-2026-001',
    ADD COLUMN IF NOT EXISTS e_mecef_token TEXT,
    ADD COLUMN IF NOT EXISTS e_mecef_api_url TEXT,
    ADD COLUMN IF NOT EXISTS auto_send_closure_pdf BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS closure_email_1 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS closure_email_2 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS closure_email_3 VARCHAR(255),
    ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- 2. Index pour requêtes sur e_mecef_active et tenant_id
CREATE INDEX IF NOT EXISTS idx_companies_emecef_active 
    ON public.companies(id, e_mecef_active);

-- 3. Rechargement du cache de schéma PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
