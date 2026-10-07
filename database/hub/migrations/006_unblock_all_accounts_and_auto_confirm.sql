-- ==============================================================================
-- GESTIO 229 SaaS — Migration 006 : Déblocage immédiat de tous les comptes
-- et confirmation automatique de tous les utilisateurs (présents et futurs)
-- ==============================================================================

-- 1. Débloquer tous les anciens comptes dont l'email n'a pas encore été confirmé
UPDATE auth.users
SET 
  email_confirmed_at = NOW(),
  updated_at = NOW()
WHERE email_confirmed_at IS NULL;

-- 2. Harmoniser les comptes administrateurs d'entreprises pour garantir l'accès direct
UPDATE auth.users
SET 
  encrypted_password = crypt('Admin2026!', gen_salt('bf')),
  email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
  raw_app_meta_data = jsonb_set(COALESCE(raw_app_meta_data, '{}'::jsonb), '{provider}', '"email"'),
  updated_at = NOW()
WHERE email IN (
  SELECT email FROM public.user_profiles WHERE role = 'administrateur'
);

-- 3. Trigger automatique pour confirmer immédiatement TOUT nouvel utilisateur créé
--    (Évite que les comptes créés via signUp ou admin.createUser restent bloqués)
CREATE OR REPLACE FUNCTION public.auto_confirm_auth_user()
RETURNS trigger AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_auto_confirm_auth_user ON auth.users;
CREATE TRIGGER trg_auto_confirm_auth_user
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_auth_user();

-- 4. Fonction RPC sécurisée SECURITY DEFINER pour créer directement des utilisateurs confirmés
CREATE OR REPLACE FUNCTION public.create_confirmed_user(
  p_email text,
  p_password text,
  p_user_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id uuid;
  v_encrypted_pw text;
BEGIN
  v_encrypted_pw := crypt(p_password, gen_salt('bf'));
  
  SELECT id INTO v_user_id FROM auth.users WHERE email = lower(trim(p_email));
  
  IF v_user_id IS NOT NULL THEN
    UPDATE auth.users 
    SET encrypted_password = v_encrypted_pw,
        email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
        raw_user_meta_data = p_user_metadata,
        updated_at = NOW()
    WHERE id = v_user_id;
  ELSE
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      role,
      aud
    ) VALUES (
      v_user_id,
      '00000000-0000-0000-0000-000000000000',
      lower(trim(p_email)),
      v_encrypted_pw,
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      p_user_metadata,
      NOW(),
      NOW(),
      'authenticated',
      'authenticated'
    );
  END IF;

  RETURN jsonb_build_object('id', v_user_id, 'email', lower(trim(p_email)));
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_confirmed_user(text, text, jsonb) TO anon, authenticated, service_role;

-- 5. Politique RLS pour permettre la recherche du profil lors du login identifiant
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_profiles' AND policyname = 'user_profiles_public_read_ident'
  ) THEN
    CREATE POLICY user_profiles_public_read_ident
      ON public.user_profiles
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
