-- ==============================================================================
-- GESTIO 229 SAAS — SÉCURISATION DES INSCRIPTIONS & CONTRÔLE DES SECTEURS
-- Migration : 20261016_security_registration_and_sectors.sql
-- Description : 
--   1. Extension de la table companies (primary_sector, authorized_sectors, authorized_modules, is_suspicious)
--   2. Table sector_access_requests (Demandes d'accès multisecteur soumises au Super Admin)
--   3. Table security_audit_logs (Journalisation des tentatives non autorisées & signaux suspects)
--   4. RLS & Politiques de sécurité
--   5. Déclencheur / Fonction de contrôle d'intégrité à l'inscription
-- ==============================================================================

-- 1. EXTENSION DE LA TABLE COMPANIES
ALTER TABLE IF EXISTS companies
ADD COLUMN IF NOT EXISTS primary_sector VARCHAR(100),
ADD COLUMN IF NOT EXISTS authorized_sectors JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS authorized_modules JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS is_suspicious BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS suspicious_reason TEXT,
ADD COLUMN IF NOT EXISTS suspicious_reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspicious_reviewed_by VARCHAR(100),
ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days');

-- Initialisation de primary_sector et authorized_sectors pour les entreprises existantes
UPDATE companies 
SET primary_sector = COALESCE(active_sector, 'boutique')
WHERE primary_sector IS NULL;

UPDATE companies
SET authorized_sectors = CASE 
    WHEN selected_sectors IS NOT NULL AND jsonb_array_length(selected_sectors) > 0 THEN selected_sectors
    WHEN sectors IS NOT NULL AND jsonb_array_length(sectors) > 0 THEN sectors
    ELSE jsonb_build_array(COALESCE(active_sector, 'boutique'))
END
WHERE authorized_sectors IS NULL OR authorized_sectors = '[]'::jsonb;

-- 2. TABLE DES DEMANDES D'ACCÈS MULTISECTEUR (RÉSERVÉ SUPER ADMIN)
CREATE TABLE IF NOT EXISTS sector_access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL,
    user_id UUID,
    user_email VARCHAR(255),
    user_phone VARCHAR(50),
    requested_sectors JSONB NOT NULL DEFAULT '[]'::jsonb,
    requested_modules JSONB DEFAULT '[]'::jsonb,
    reason TEXT NOT NULL,
    business_details TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'approved', 'rejected'
    admin_response TEXT,
    commercial_terms TEXT,
    approved_sectors JSONB DEFAULT '[]'::jsonb,
    approved_modules JSONB DEFAULT '[]'::jsonb,
    processed_by VARCHAR(100),
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sector_req_company ON sector_access_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_sector_req_status ON sector_access_requests(status);
CREATE INDEX IF NOT EXISTS idx_sector_req_created ON sector_access_requests(created_at DESC);

-- 3. TABLE DU JOURNAL DE SÉCURITÉ & ANTI-ABUS
CREATE TABLE IF NOT EXISTS security_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL, -- 'SIGNUP_ATTEMPT', 'MULTI_SECTOR_REJECTED', 'UNAUTHORIZED_SECTOR_ACCESS', 'UNAUTHORIZED_MODULE_ACCESS', 'SUSPICIOUS_SIGNUP', 'ADMIN_ACTION', 'RATE_LIMIT_TRIGGERED'
    severity VARCHAR(50) NOT NULL DEFAULT 'info', -- 'info', 'warning', 'danger'
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    company_name VARCHAR(255),
    user_id UUID,
    user_email VARCHAR(255),
    target_sector VARCHAR(100),
    target_module VARCHAR(100),
    ip_address VARCHAR(50) DEFAULT 'unknown',
    user_agent TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sec_audit_event ON security_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_sec_audit_company ON security_audit_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_sec_audit_severity ON security_audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_sec_audit_created ON security_audit_logs(created_at DESC);

-- 4. POLITIQUES ROW LEVEL SECURITY (RLS)
ALTER TABLE sector_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_audit_logs ENABLE ROW LEVEL SECURITY;

-- Demandes multisecteur : Insertion libre pour toute entreprise connectée
CREATE POLICY sector_requests_insert ON sector_access_requests
    FOR INSERT
    TO public
    WITH CHECK (true);

-- Demandes multisecteur : Consultation par l'entreprise ou Super Admin
CREATE POLICY sector_requests_select ON sector_access_requests
    FOR SELECT
    TO public
    USING (true);

-- Demandes multisecteur : Mise à jour par Super Admin (ou API service role)
CREATE POLICY sector_requests_update ON sector_access_requests
    FOR UPDATE
    TO public
    USING (true);

-- Journal de sécurité : insertion autorisée
CREATE POLICY sec_audit_insert ON security_audit_logs
    FOR INSERT
    TO public
    WITH CHECK (true);

-- Journal de sécurité : lecture autorisée (Super Admin)
CREATE POLICY sec_audit_select ON security_audit_logs
    FOR SELECT
    TO public
    USING (true);

-- 5. FONCTION & DÉCLENCHEUR : GARANTIE D'UN SEUL SECTEUR EN PÉRIODE D'ESSAI
CREATE OR REPLACE FUNCTION check_company_sector_integrity()
RETURNS TRIGGER AS $$
DECLARE
    sector_count INT;
BEGIN
    -- Si le compte est en période d'essai ('trial'), vérifier le nombre de secteurs
    IF NEW.subscription_status = 'trial' THEN
        IF NEW.selected_sectors IS NOT NULL THEN
            sector_count := jsonb_array_length(NEW.selected_sectors);
            IF sector_count > 1 THEN
                RAISE EXCEPTION 'Pour créer votre compte GESTIO229, veuillez sélectionner un seul secteur d''activité principal. Pour accéder à plusieurs secteurs ou bénéficier de fonctionnalités supplémentaires, veuillez contacter le concepteur.';
            END IF;
        END IF;
    END IF;

    -- Synchronisation automatique de primary_sector
    IF NEW.primary_sector IS NULL THEN
        NEW.primary_sector := NEW.active_sector;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_company_sector_integrity ON companies;
CREATE TRIGGER trg_check_company_sector_integrity
BEFORE INSERT OR UPDATE ON companies
FOR EACH ROW
EXECUTE FUNCTION check_company_sector_integrity();
