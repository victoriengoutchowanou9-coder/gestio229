-- =============================================================================
-- GESTIO 229 ERP — Migration M083 : Garantie d'Essai Gratuit & Synchronisation Clients Futurs
-- Protection absolue contre les désynchronisations de statut d'essai
-- =============================================================================

-- 1. Trigger automatique pour les futures entreprises : attribution systématique de 30 jours
CREATE OR REPLACE FUNCTION public.fn_companies_trial_auto_init()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Si une nouvelle entreprise est créée avec un statut trial sans date d'expiration
    IF NEW.subscription_status = 'trial' AND NEW.subscription_expires_at IS NULL THEN
        NEW.subscription_expires_at := COALESCE(NEW.created_at, NOW()) + INTERVAL '30 days';
    END IF;

    -- Par défaut à la création, garantir le statut 'trial' si non défini
    IF NEW.subscription_status IS NULL THEN
        NEW.subscription_status := 'trial';
        NEW.subscription_expires_at := COALESCE(NEW.created_at, NOW()) + INTERVAL '30 days';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_trial_auto_init ON public.companies;
CREATE TRIGGER trg_companies_trial_auto_init
BEFORE INSERT OR UPDATE OF subscription_status, subscription_expires_at ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.fn_companies_trial_auto_init();

-- 2. Fonction de synchronisation renforcée pour la gestion des essais et abonnements
CREATE OR REPLACE FUNCTION public.fn_sync_abonnements_secteurs_fin_essai()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rows_affected INTEGER := 0;
BEGIN
    -- 2.1 Expirer les abonnements globaux dont la date de fin est dépassée
    UPDATE public.abonnements_global
    SET statut_global = 'expire',
        updated_at = NOW()
    WHERE statut_global IN ('essai', 'actif')
      AND date_fin_global < NOW();

    -- 2.2 Expirer les abonnements sectoriels spécifiques autonomes dont la date de fin est dépassée
    UPDATE public.abonnements_secteurs
    SET statut_specifique = 'expire',
        updated_at = NOW()
    WHERE statut_specifique IN ('actif', 'essai_gratuit')
      AND rattache_au_global = false
      AND date_fin_specifique IS NOT NULL
      AND date_fin_specifique < NOW();

    -- 2.3 Réconciliation automatique bidirectionnelle companies <-> abonnements_global :
    -- Si abonnements_global est en cours d'essai valide, companies.subscription_status DOIT être 'trial'
    UPDATE public.companies c
    SET subscription_status = 'trial',
        subscription_expires_at = ag.date_fin_global,
        updated_at = NOW()
    FROM public.abonnements_global ag
    WHERE ag.entreprise_id = c.id
      AND ag.statut_global = 'essai'
      AND ag.date_fin_global >= NOW()
      AND c.subscription_status NOT IN ('active', 'trial');

    -- Si abonnements_global est actif et valide, companies.subscription_status DOIT être 'active'
    UPDATE public.companies c
    SET subscription_status = 'active',
        subscription_expires_at = ag.date_fin_global,
        updated_at = NOW()
    FROM public.abonnements_global ag
    WHERE ag.entreprise_id = c.id
      AND ag.statut_global = 'actif'
      AND ag.date_fin_global >= NOW()
      AND c.subscription_status <> 'active';

    -- Si abonnements_global est expiré, synchroniser le statut entreprise si non suspendu
    UPDATE public.companies c
    SET subscription_status = 'expired',
        updated_at = NOW()
    FROM public.abonnements_global ag
    WHERE ag.entreprise_id = c.id
      AND ag.statut_global = 'expire'
      AND c.subscription_status NOT IN ('suspended', 'deleted', 'expired');

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RETURN v_rows_affected;
END;
$$;

-- 3. Exécution immédiate de la synchronisation pour harmoniser la base existante
SELECT public.fn_sync_abonnements_secteurs_fin_essai();
