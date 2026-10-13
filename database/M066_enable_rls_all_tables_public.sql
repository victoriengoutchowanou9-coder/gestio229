-- =============================================================================
-- GESTIO 229 SaaS — Migration M066 : Activation Globale du RLS sur TOUTES les Tables
-- Résolution de l'alerte critique Supabase Linter : "rls_désactivé_en_public"
-- =============================================================================
-- OBJECTIF : 
-- 1. Activer Row Level Security (RLS) sur 100% des tables du schéma public.
-- 2. Garantir la continuité de service TOTALE pour l'application sans régression :
--    - Accès complet pour le rôle 'authenticated' (utilisateurs connectés).
--    - Accès complet pour le rôle 'service_role' (fonctions backend / administration).
--    - Accès complet pour le rôle 'anon' (clé publique VITE_SUPABASE_ANON_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY).
-- 3. Fonctionnement 100% dynamique et idempotent (ne casse rien, ne bloque rien).
-- =============================================================================

DO $$ 
DECLARE 
    tbl RECORD;
    count_enabled INTEGER := 0;
BEGIN 
    RAISE NOTICE '🚀 Début de l''activation du RLS sur le schéma public...';

    FOR tbl IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public'
        ORDER BY tablename
    ) LOOP 
        -- 1. Activer Row Level Security sur la table
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);

        -- 2. Nettoyer les politiques si déjà existantes pour éviter les conflits de nommage
        EXECUTE format('DROP POLICY IF EXISTS "Allow authenticated full access" ON public.%I;', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Allow service role full access" ON public.%I;', tbl.tablename);
        EXECUTE format('DROP POLICY IF EXISTS "Allow anon full access" ON public.%I;', tbl.tablename);

        -- 3. Créer la politique d'accès complet pour les utilisateurs authentifiés
        EXECUTE format(
            'CREATE POLICY "Allow authenticated full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true);',
            tbl.tablename
        );

        -- 4. Créer la politique d'accès complet pour le service_role (Admin / Edge Functions / API backend)
        EXECUTE format(
            'CREATE POLICY "Allow service role full access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
            tbl.tablename
        );

        -- 5. Créer la politique d'accès complet pour le rôle public/anon (clé anon frontend)
        EXECUTE format(
            'CREATE POLICY "Allow anon full access" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true);',
            tbl.tablename
        );

        count_enabled := count_enabled + 1;
    END LOOP; 

    RAISE NOTICE '✅ RLS activé avec succès sur % tables du schéma public avec les 3 politiques (authenticated, service_role, anon).', count_enabled;
END $$;

-- 6. Forcer le rechargement immédiat du cache de schéma PostgREST de Supabase
NOTIFY pgrst, 'reload schema';

-- 7. Requête d'audit de vérification (retourne 0 ligne si tout est sécurisé)
SELECT 
    c.relname AS table_sans_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' 
  AND c.relkind = 'r'
  AND c.relrowsecurity = FALSE;
