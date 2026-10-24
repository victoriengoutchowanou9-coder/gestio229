-- =============================================================================
-- GESTIO 229 ERP — MIGRATION M080 (2026-10-24)
-- ENRICHISSEMENT DE LA TABLE DEMANDES_PAIEMENT_ABONNEMENT
-- Harmonisation des colonnes de suivi des demandes d'activation manuelle
-- =============================================================================

BEGIN;

ALTER TABLE IF EXISTS public.demandes_paiement_abonnement
  ADD COLUMN IF NOT EXISTS company_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS sector_slug VARCHAR(100) DEFAULT 'all',
  ADD COLUMN IF NOT EXISTS sectors_covered JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS duration_months INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_price_monthly NUMERIC(15,2) DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(15,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'manuel',
  ADD COLUMN IF NOT EXISTS payment_operator VARCHAR(100) DEFAULT 'Mobile Money',
  ADD COLUMN IF NOT EXISTS payer_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS transaction_reference VARCHAR(150),
  ADD COLUMN IF NOT EXISTS proof_url TEXT,
  ADD COLUMN IF NOT EXISTS proof_hash TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'en_attente',
  ADD COLUMN IF NOT EXISTS reviewed_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS expected_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expected_end_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- RLS & Droits
ALTER TABLE IF EXISTS public.demandes_paiement_abonnement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS demandes_paiement_all_policy ON public.demandes_paiement_abonnement;
CREATE POLICY demandes_paiement_all_policy ON public.demandes_paiement_abonnement
  FOR ALL TO authenticated, anon
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';

COMMIT;
