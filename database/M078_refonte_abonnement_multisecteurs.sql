-- =============================================================================
-- GESTIO 229 SaaS — Migration M078 : Refonte du Système d'Abonnement Multi-Secteurs
-- =============================================================================
-- Objectifs :
-- 1. Essai gratuit unique de 30 jours rattaché au compte (couvrant au maximum 3 secteurs).
-- 2. Suppression définitive de l'essai gratuit individuel de 30 jours par secteur (essai_individuel).
-- 3. Secteurs supplémentaires (> 3 en essai, ou ajoutés après expiration) placés en 'en_attente_paiement'.
-- 4. Tables dédiées pour :
--    - Paramètres de paiement manuel configurables par le Super Admin (platform_payment_settings)
--    - Demandes de paiement manuel & transactions automatiques (demandes_paiement_abonnement)
--    - Notifications d'abonnement dédupliquées (subscription_notifications)
-- 5. Migration sûre et réversible des comptes existants sans perte de données ni réinitialisation des dates.
-- =============================================================================

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. EXTENSION DES TABLES ABONNEMENTS_GLOBAL ET ABONNEMENTS_SECTEURS
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.abonnements_global
  ADD COLUMN IF NOT EXISTS max_secteurs_essai INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS essai_consomme BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS duree_mois INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mode_paiement VARCHAR(40),
  ADD COLUMN IF NOT EXISTS reference_dernier_paiement VARCHAR(120),
  ADD COLUMN IF NOT EXISTS date_dernier_paiement TIMESTAMPTZ;

ALTER TABLE public.abonnements_secteurs
  ADD COLUMN IF NOT EXISTS duree_mois INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS montant_fcfa NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mode_paiement VARCHAR(40),
  ADD COLUMN IF NOT EXISTS reference_paiement VARCHAR(120),
  ADD COLUMN IF NOT EXISTS activer_par VARCHAR(100);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. TABLE DES PARAMÈTRES DE PAIEMENT MANUEL (CONFIGURABLES PAR LE SUPER ADMIN)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.platform_payment_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(60) NOT NULL UNIQUE DEFAULT 'default_manual_payment',
    deposit_phone VARCHAR(60) NOT NULL DEFAULT '+229 01 97 00 00 00',
    beneficiary_name VARCHAR(150) NOT NULL DEFAULT 'GESTIO 229 SARL',
    payment_operator VARCHAR(100) NOT NULL DEFAULT 'MTN Mobile Money / Moov Money / Celtiis Cash',
    whatsapp_number VARCHAR(60) NOT NULL DEFAULT '+229 01 97 00 00 00',
    payment_instructions TEXT NOT NULL DEFAULT 'Effectuez le dépôt du montant exact sur le numéro indiqué, puis soumettez la référence de transaction et la capture d''écran de confirmation ci-dessous ou envoyez la preuve sur WhatsApp.',
    automatic_payment_enabled BOOLEAN NOT NULL DEFAULT false,
    updated_by VARCHAR(100) DEFAULT 'Super Admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.platform_payment_settings (
    setting_key,
    deposit_phone,
    beneficiary_name,
    payment_operator,
    whatsapp_number,
    payment_instructions,
    automatic_payment_enabled
) VALUES (
    'default_manual_payment',
    '+229 01 97 00 00 00',
    'GESTIO 229 SARL',
    'MTN Mobile Money / Moov Money / Celtiis Cash',
    '+229 01 97 00 00 00',
    '1. Effectuez le dépôt Mobile Money du montant total indiqué sur le numéro officiel ci-dessus.' || E'\n' ||
    '2. Vérifiez que le nom du bénéficiaire affiché correspond bien au titulaire indiqué.' || E'\n' ||
    '3. Joignez la capture d''écran du reçu et renseignez la référence de transaction pour validation par l''administration.',
    false
) ON CONFLICT (setting_key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. TABLE DES DEMANDES DE PAIEMENT D'ABONNEMENT (MANUEL & AUTOMATIQUE)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.demandes_paiement_abonnement (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    company_name VARCHAR(200),
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'all', -- 'all' ou slug spécifique (ex: 'quincaillerie')
    sectors_covered JSONB DEFAULT '[]'::jsonb,
    plan_slug VARCHAR(60) DEFAULT 'entreprise',
    duration_months INTEGER NOT NULL DEFAULT 1 CHECK (duration_months >= 1),
    unit_price_monthly NUMERIC(12,2) NOT NULL DEFAULT 10000,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    payment_mode VARCHAR(30) NOT NULL DEFAULT 'manuel', -- 'manuel' | 'automatique'
    payment_operator VARCHAR(80),
    payer_phone VARCHAR(60),
    transaction_reference VARCHAR(150),
    proof_url TEXT,
    proof_hash VARCHAR(128),
    notes TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'en_attente', -- 'en_attente' | 'valide' | 'rejete'
    expected_start_at TIMESTAMPTZ,
    expected_end_at TIMESTAMPTZ,
    reviewed_by VARCHAR(120),
    reviewed_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_demandes_paiement_company ON public.demandes_paiement_abonnement(company_id, status);
CREATE INDEX IF NOT EXISTS idx_demandes_paiement_status ON public.demandes_paiement_abonnement(status, created_at DESC);

-- Contrainte d'unicité partielle pour empêcher la double validation d'une même référence de transaction
CREATE UNIQUE INDEX IF NOT EXISTS uq_demandes_paiement_ref_valide
ON public.demandes_paiement_abonnement (UPPER(TRIM(transaction_reference)))
WHERE transaction_reference IS NOT NULL AND TRIM(transaction_reference) <> '' AND status = 'valide';

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. TABLE DES NOTIFICATIONS D'ABONNEMENT (AVEC DÉDUPLICATION)
-- ══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscription_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100),
    notification_key VARCHAR(180) NOT NULL, -- Clé unique pour éviter les envois en boucle
    type VARCHAR(60) NOT NULL, -- 'trial_started', 'trial_expiring', 'trial_expired', 'sector_added', 'payment_submitted', 'payment_validated', 'payment_rejected', 'subscription_activated'
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_sub_notification_company_key UNIQUE (company_id, notification_key)
);

CREATE INDEX IF NOT EXISTS idx_sub_notifications_company ON public.subscription_notifications(company_id, is_read, created_at DESC);

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. SUPPRESSION DE L'ANCIENNE FONCTION D'ESSAI INDIVIDUEL & NOUVELLE FONCTION DE SYNCHRONISATION
-- ══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_sync_abonnements_secteurs_fin_essai()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rows_affected INTEGER := 0;
BEGIN
    -- Expirer les abonnements globaux dont la date de fin est dépassée
    UPDATE public.abonnements_global
    SET statut_global = 'expire',
        updated_at = NOW()
    WHERE statut_global IN ('essai', 'actif')
      AND date_fin_global < NOW();

    -- Expirer les abonnements sectoriels spécifiques dont la date de fin est dépassée
    UPDATE public.abonnements_secteurs
    SET statut_specifique = 'expire',
        updated_at = NOW()
    WHERE statut_specifique IN ('actif', 'essai_gratuit')
      AND rattache_au_global = false
      AND date_fin_specifique IS NOT NULL
      AND date_fin_specifique < NOW();

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    RETURN v_rows_affected;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. MIGRATION SÛRE DES COMPTES EXISTANTS (SECTION 15)
-- ══════════════════════════════════════════════════════════════════════════════
-- 6.1 Synchroniser statut_global avec companies.subscription_status sans perdre les dates existantes
UPDATE public.abonnements_global ag
SET statut_global = CASE
    WHEN c.subscription_status = 'active' THEN 'actif'
    WHEN c.subscription_status = 'suspended' THEN 'suspendu'
    WHEN c.subscription_status IN ('expired', 'deleted') THEN 'expire'
    WHEN ag.date_fin_global < NOW() AND ag.statut_global = 'essai' THEN 'expire'
    ELSE ag.statut_global
END,
updated_at = NOW()
FROM public.companies c
WHERE ag.entreprise_id = c.id;

-- 6.2 Convertir les anciens 'essai_individuel' (aboli par la Section 3) :
-- Si le compte a <= 3 secteurs et que l'abonnement global est actif ou en essai valide -> 'rattache_global'
-- Sinon -> 'en_attente_paiement'
WITH ranked_sectors AS (
    SELECT
        s.id,
        s.entreprise_id,
        s.statut_specifique,
        g.statut_global,
        ROW_NUMBER() OVER (PARTITION BY s.entreprise_id ORDER BY s.created_at ASC, s.id ASC) AS rn
    FROM public.abonnements_secteurs s
    LEFT JOIN public.abonnements_global g ON g.entreprise_id = s.entreprise_id
)
UPDATE public.abonnements_secteurs target
SET statut_specifique = CASE
        WHEN rs.statut_global = 'actif' THEN 'rattache_global'
        WHEN rs.statut_global = 'essai' AND rs.rn <= 3 THEN 'rattache_global'
        ELSE 'en_attente_paiement'
    END,
    rattache_au_global = CASE
        WHEN rs.statut_global = 'actif' THEN true
        WHEN rs.statut_global = 'essai' AND rs.rn <= 3 THEN true
        ELSE false
    END,
    is_premiere_activation = false,
    updated_at = NOW()
FROM ranked_sectors rs
WHERE target.id = rs.id
  AND (target.statut_specifique = 'essai_individuel' OR (rs.statut_global = 'essai' AND rs.rn > 3));

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. POLITIQUES RLS
-- ══════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.platform_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demandes_paiement_abonnement ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_payment_settings_policy" ON public.platform_payment_settings;
CREATE POLICY "platform_payment_settings_policy" ON public.platform_payment_settings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "demandes_paiement_abonnement_policy" ON public.demandes_paiement_abonnement;
CREATE POLICY "demandes_paiement_abonnement_policy" ON public.demandes_paiement_abonnement FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "subscription_notifications_policy" ON public.subscription_notifications;
CREATE POLICY "subscription_notifications_policy" ON public.subscription_notifications FOR ALL USING (true) WITH CHECK (true);

COMMIT;
