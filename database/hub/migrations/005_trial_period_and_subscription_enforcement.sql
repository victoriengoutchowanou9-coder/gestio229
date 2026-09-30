-- =============================================================================
-- GESTIO 229 SaaS — Migration 005 : Période d'Essai Gratuit de 1 Mois (30 jours)
-- Contrôle et Vérification Côté Serveur / PostgreSQL
-- =============================================================================

-- 1. Fonction RPC pour vérifier et expirer automatiquement les entreprises en essai
CREATE OR REPLACE FUNCTION public.check_and_update_trial_status(p_company_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_updated_count INT := 0;
    v_company RECORD;
    v_result JSONB;
BEGIN
    IF p_company_id IS NOT NULL THEN
        -- Vérification pour une entreprise spécifique
        SELECT id, created_at, subscription_status, subscription_plan
        INTO v_company
        FROM public.companies
        WHERE id = p_company_id;

        IF FOUND THEN
            IF v_company.subscription_status = 'trial' AND now() > (v_company.created_at + INTERVAL '30 days') THEN
                UPDATE public.companies
                SET subscription_status = 'expired',
                    updated_at = now()
                WHERE id = p_company_id;
                v_updated_count := 1;
            END IF;
        END IF;
    ELSE
        -- Vérification globale de toutes les entreprises en essai dont les 30 jours sont écoulés
        WITH expired_companies AS (
            UPDATE public.companies
            SET subscription_status = 'expired',
                updated_at = now()
            WHERE subscription_status = 'trial'
              AND now() > (created_at + INTERVAL '30 days')
            RETURNING id
        )
        SELECT COUNT(*) INTO v_updated_count FROM expired_companies;
    END IF;

    v_result := jsonb_build_object(
        'success', true,
        'expired_companies_updated', v_updated_count,
        'checked_at', now()
    );

    RETURN v_result;
END;
$$;

-- 2. Fonction RPC pour obtenir le statut exact d'abonnement côté serveur
CREATE OR REPLACE FUNCTION public.get_server_subscription_status(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company RECORD;
    v_created_at TIMESTAMPTZ;
    v_trial_ends_at TIMESTAMPTZ;
    v_now TIMESTAMPTZ := now();
    v_is_trial BOOLEAN := false;
    v_is_expired BOOLEAN := false;
    v_is_active BOOLEAN := false;
    v_is_suspended BOOLEAN := false;
    v_days_remaining INT := 0;
BEGIN
    SELECT * INTO v_company
    FROM public.companies
    WHERE id = p_company_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'found', false,
            'message', 'Entreprise introuvable'
        );
    END IF;

    v_created_at := COALESCE(v_company.created_at, v_now);
    v_trial_ends_at := v_created_at + INTERVAL '30 days';

    IF v_company.subscription_status = 'active' THEN
        v_is_active := true;
    ELSIF v_company.subscription_status = 'suspended' THEN
        v_is_suspended := true;
    ELSIF v_company.subscription_status = 'expired' OR (v_company.subscription_status = 'trial' AND v_now > v_trial_ends_at) THEN
        v_is_expired := true;
        -- Auto-mise à jour si encore marqué 'trial' en base
        IF v_company.subscription_status = 'trial' THEN
            UPDATE public.companies
            SET subscription_status = 'expired',
                updated_at = v_now
            WHERE id = p_company_id;
        END IF;
    ELSIF v_company.subscription_status = 'trial' AND v_now <= v_trial_ends_at THEN
        v_is_trial := true;
        v_days_remaining := GREATEST(0, EXTRACT(DAY FROM (v_trial_ends_at - v_now))::INT);
    END IF;

    RETURN jsonb_build_object(
        'found', true,
        'company_id', v_company.id,
        'company_name', v_company.name,
        'status', CASE 
            WHEN v_is_active THEN 'active'
            WHEN v_is_suspended THEN 'suspended'
            WHEN v_is_expired THEN 'expired'
            ELSE 'trial'
        END,
        'is_trial', v_is_trial,
        'is_expired', v_is_expired,
        'is_active', v_is_active,
        'is_suspended', v_is_suspended,
        'days_remaining', v_days_remaining,
        'created_at', v_created_at,
        'trial_ends_at', v_trial_ends_at,
        'subscription_plan', COALESCE(v_company.subscription_plan, v_company.plan, 'multiservices')
    );
END;
$$;

-- 3. Fonction RPC pour valider les droits d'accès à un module côté serveur
CREATE OR REPLACE FUNCTION public.check_server_module_access(
    p_company_id UUID,
    p_module_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub JSONB;
    v_status TEXT;
    v_plan TEXT;
    v_allowed BOOLEAN := false;
    v_reason TEXT := NULL;
    v_advanced_modules TEXT[] := ARRAY['finances', 'rapports', 'syscohada', 'inventaire'];
BEGIN
    -- L'accès à la page d'abonnement est toujours garanti
    IF p_module_id = 'abonnement' THEN
        RETURN jsonb_build_object('allowed', true, 'reason', NULL);
    END IF;

    v_sub := public.get_server_subscription_status(p_company_id);
    IF NOT (v_sub->>'found')::BOOLEAN THEN
        RETURN jsonb_build_object('allowed', false, 'reason', 'not_found', 'message', 'Entreprise introuvable.');
    END IF;

    v_status := v_sub->>'status';
    v_plan := LOWER(COALESCE(v_sub->>'subscription_plan', ''));

    IF v_status = 'expired' THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'expired',
            'message', 'Votre période d''essai gratuit de 30 jours est expirée. Veuillez activer votre abonnement.'
        );
    ELSIF v_status = 'suspended' THEN
        RETURN jsonb_build_object(
            'allowed', false,
            'reason', 'suspended',
            'message', 'Votre compte est suspendu. Veuillez régulariser votre abonnement.'
        );
    ELSIF v_status = 'trial' THEN
        -- Durant les 30 jours d'essai : 100% des modules sont accessibles sans restriction
        RETURN jsonb_build_object('allowed', true, 'reason', 'trial_active');
    ELSIF v_status = 'active' THEN
        IF (v_plan = 'starter' OR v_plan = 'solo') AND p_module_id = ANY(v_advanced_modules) THEN
            RETURN jsonb_build_object(
                'allowed', false,
                'reason', 'starter_restriction',
                'message', 'Ce module est réservé au Plan Entreprise.'
            );
        END IF;
        RETURN jsonb_build_object('allowed', true, 'reason', 'subscription_active');
    END IF;

    RETURN jsonb_build_object('allowed', true, 'reason', 'default');
END;
$$;

-- Accorder les droits d'exécution aux rôles connectés et anonymes (pour auto-check)
GRANT EXECUTE ON FUNCTION public.check_and_update_trial_status(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_server_subscription_status(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.check_server_module_access(UUID, TEXT) TO authenticated, anon, service_role;
