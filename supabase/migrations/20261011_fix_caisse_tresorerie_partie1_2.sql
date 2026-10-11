-- =============================================================================
-- GESTIO 229 — Fix Caisse & Trésorerie PARTIE 1 + PARTIE 2
-- Migration : 2026-10-11
-- =============================================================================

-- 1. Ajouter les champs manquants dans demandes_retrait
ALTER TABLE demandes_retrait
  ADD COLUMN IF NOT EXISTS demandeur_nom TEXT,
  ADD COLUMN IF NOT EXISTS valide_par TEXT,
  ADD COLUMN IF NOT EXISTS valide_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refused_at TIMESTAMPTZ;

-- 2. Ajouter les champs manquants dans caisse_mouvements pour supporter
--    le type 'retrait_tresorerie' et le statut 'en_attente'
ALTER TABLE caisse_mouvements
  ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'valide',
  ADD COLUMN IF NOT EXISTS source_module TEXT,
  ADD COLUMN IF NOT EXISTS sens TEXT;

-- 3. Ajouter les champs manquants dans treasury_transfers
ALTER TABLE treasury_transfers
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by TEXT;

-- 4. Ajouter les colonnes de tracking dans treasury_accounts
ALTER TABLE treasury_accounts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 5. Index de performance sur caisse_mouvements
CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_type_statut
  ON caisse_mouvements(type, statut, sector_slug, company_id);

CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_source_id
  ON caisse_mouvements(source_id);

CREATE INDEX IF NOT EXISTS idx_demandes_retrait_statut
  ON demandes_retrait(statut, company_id, secteur_id);

-- 6. Index sur treasury_transfers
CREATE INDEX IF NOT EXISTS idx_treasury_transfers_status
  ON treasury_transfers(status, company_id);

-- =============================================================================
-- RÈGLE MÉTIER DOCUMENTÉE :
-- Les retraits Caisse → Trésorerie sont des VIREMENTS INTERNES (type='retrait_tresorerie')
-- Ils ne doivent jamais être comptabilisés comme des dépenses (type='depense').
-- Workflow :
--   1. Caissière crée → statut 'en_attente' dans demandes_retrait + treasury_transfers
--   2. Caisse_mouvements: type='retrait_tresorerie', statut='en_attente' (montant bloqué visuellement)
--   3. Admin valide → double transaction :
--      a. treasury_accounts COFFRE-FORT/MOMO += montant (crédit côté trésorerie)
--      b. caisse_mouvements statut → 'valide' (débit côté caisse actif)
--      c. demandes_retrait statut → 'valide'
--      d. treasury_transfers status → 'APPROVED'
--   4. Admin refuse → statut='refuse' partout, montant libéré
-- =============================================================================
