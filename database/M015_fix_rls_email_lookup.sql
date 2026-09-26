-- ==============================================================================
-- GESTIO 229 — MIGRATION M015 : Correction RLS + Liaison auth_user_id
-- Problème : les profils avec auth_user_id = NULL sont invisibles après connexion
-- Solution : 
--   1. Mettre à jour les policies RLS pour permettre lookup par email
--   2. Réparer les profils existants avec auth_user_id = NULL
-- ==============================================================================
-- À EXÉCUTER DANS : Supabase → SQL Editor → New Query
-- ==============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 1 : RÉPARER LES PROFILS EXISTANTS (auth_user_id NULL)
-- Lie les profils user_profiles à leur compte auth.users via l'email
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE user_profiles up
SET 
  auth_user_id = au.id,
  updated_at   = NOW()
FROM auth.users au
WHERE LOWER(up.email) = LOWER(au.email)
  AND up.auth_user_id IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 2 : METTRE À JOUR LA RLS DE user_profiles
-- Ajouter la condition de lookup par email (via auth.users)
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Lecture propre user_profiles" ON user_profiles;
CREATE POLICY "Lecture propre user_profiles" ON user_profiles
  FOR SELECT USING (
    auth.uid() = auth_user_id
    OR auth.uid()::text = user_id::text
    OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

DROP POLICY IF EXISTS "Modification propre user_profiles" ON user_profiles;
CREATE POLICY "Modification propre user_profiles" ON user_profiles
  FOR UPDATE USING (
    auth.uid() = auth_user_id
    OR auth.uid()::text = user_id::text
    OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

DROP POLICY IF EXISTS "Création propre user_profiles" ON user_profiles;
CREATE POLICY "Création propre user_profiles" ON user_profiles
  FOR INSERT WITH CHECK (
    auth.uid() = auth_user_id
    OR auth.uid()::text = user_id::text
    OR auth.uid() IS NOT NULL
  );

DROP POLICY IF EXISTS "Suppression propre user_profiles" ON user_profiles;
CREATE POLICY "Suppression propre user_profiles" ON user_profiles
  FOR DELETE USING (
    auth.uid() = auth_user_id
    OR auth.uid()::text = user_id::text
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 3 : METTRE À JOUR LA RLS DE companies
-- Ajouter la condition de lookup par email
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Lecture propre companies" ON companies;
CREATE POLICY "Lecture propre companies" ON companies
  FOR SELECT USING (
    auth.uid()::text = user_id::text
    OR id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid())
    OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

DROP POLICY IF EXISTS "Modification propre companies" ON companies;
CREATE POLICY "Modification propre companies" ON companies
  FOR UPDATE USING (
    auth.uid()::text = user_id::text
    OR id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid())
    OR LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- VÉRIFICATION : afficher les profils réparés
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 
  up.email,
  up.full_name,
  up.role,
  up.auth_user_id,
  au.id AS auth_uid,
  CASE WHEN up.auth_user_id = au.id THEN '✅ Lié' ELSE '❌ Non lié' END AS statut
FROM user_profiles up
LEFT JOIN auth.users au ON LOWER(up.email) = LOWER(au.email)
ORDER BY up.created_at DESC;
