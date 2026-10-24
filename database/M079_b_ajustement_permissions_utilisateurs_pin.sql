-- =============================================================================
-- GESTIO 229 ERP — AJUSTEMENT FINAL COMPATIBILITÉ UTILISATEURS PIN & DATA API
-- Assure l'accès complet pour les utilisateurs internes (vendeurs/caissiers PIN)
-- tout en maintenant l'isolation RLS multi-tenant absolue (is_valid_tenant_company)
-- =============================================================================

BEGIN;

-- 1. Accorder les droits d'exécution API au rôle anon pour les utilisateurs PIN
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO anon;

-- 2. Configuration par défaut pour les futures tables (Supabase 30 Octobre 2026)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON ROUTINES TO anon, authenticated;

-- 3. Rechargement immédiat du cache de l'API PostgREST
NOTIFY pgrst, 'reload schema';

COMMIT;
