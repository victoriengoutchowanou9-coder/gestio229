-- =============================================================================
-- GESTIO 229 SaaS — MIGRATION M040 : RÈGLE MONTANT RESTANT DÛ & DOUBLE STOCK POS
-- =============================================================================

-- PARTIE 1 : RÈGLE MONTANT RESTANT DÛ CLIENT SUR FACTURE
-- Colonnes sur factures et sales_orders
ALTER TABLE IF EXISTS public.factures ADD COLUMN IF NOT EXISTS ancienne_dette_avant_facture NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.factures ADD COLUMN IF NOT EXISTS montant_restant_du_global NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.factures ADD COLUMN IF NOT EXISTS montant_credit_actuel NUMERIC DEFAULT 0;

ALTER TABLE IF EXISTS public.sales_orders ADD COLUMN IF NOT EXISTS ancienne_dette_avant_facture NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.sales_orders ADD COLUMN IF NOT EXISTS montant_restant_du_global NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.sales_orders ADD COLUMN IF NOT EXISTS montant_credit_actuel NUMERIC DEFAULT 0;

-- Colonnes sur clients et customers
ALTER TABLE IF EXISTS public.clients ADD COLUMN IF NOT EXISTS solde_creance NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.customers ADD COLUMN IF NOT EXISTS solde_creance NUMERIC DEFAULT 0;

-- Table creances_clients si elle n'existe pas encore
CREATE TABLE IF NOT EXISTS public.creances_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  client_id UUID NOT NULL,
  facture_id UUID,
  montant_initial_ttc NUMERIC NOT NULL DEFAULT 0,
  montant_restant_ttc NUMERIC NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'impayé',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- PARTIE 2 : RÈGLE DOUBLE STOCK POS (MAGASIN -> TRANSFERT -> VENTE)
CREATE TABLE IF NOT EXISTS public.stock_magasin (
  company_id UUID NOT NULL,
  produit_id UUID NOT NULL,
  quantite NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, produit_id)
);

CREATE TABLE IF NOT EXISTS public.stock_vente (
  company_id UUID NOT NULL,
  produit_id UUID NOT NULL,
  caisse_id UUID,
  quantite NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (company_id, produit_id, caisse_id)
);

CREATE TABLE IF NOT EXISTS public.mouvements_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  produit_id UUID,
  type TEXT,
  quantite NUMERIC,
  source TEXT,
  destination TEXT,
  motif TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- PARTIE 3 : ACCÈS DÉBLOQUÉ RLS POUR TOUS LES UTILISATEURS (ADMIN ET INTERNES)
ALTER TABLE IF EXISTS public.factures DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.creances_clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_magasin DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_vente DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mouvements_stock DISABLE ROW LEVEL SECURITY;

-- PARTIE 4 : FONCTION RPC ATOMIQUE DE TRANSFERT STOCK MAGASIN -> VENTE
CREATE OR REPLACE FUNCTION public.transferer_stock_magasin_vers_vente(
  p_company_id UUID,
  p_produit_id UUID,
  p_caisse_id UUID,
  p_quantite NUMERIC,
  p_user_id UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  v_mag NUMERIC;
BEGIN
  SELECT quantite INTO v_mag FROM public.stock_magasin
  WHERE company_id = p_company_id AND produit_id = p_produit_id;

  IF v_mag IS NULL OR v_mag < p_quantite THEN
    RETURN json_build_object('success', false, 'message', 'Stock magasin insuffisant');
  END IF;

  UPDATE public.stock_magasin
  SET quantite = quantite - p_quantite, updated_at = NOW()
  WHERE company_id = p_company_id AND produit_id = p_produit_id;

  INSERT INTO public.stock_vente (company_id, produit_id, caisse_id, quantite)
  VALUES (p_company_id, p_produit_id, p_caisse_id, p_quantite)
  ON CONFLICT (company_id, produit_id, caisse_id)
  DO UPDATE SET quantite = public.stock_vente.quantite + p_quantite, updated_at = NOW();

  INSERT INTO public.mouvements_stock (company_id, produit_id, type, quantite, source, destination, motif, created_by)
  VALUES (p_company_id, p_produit_id, 'TRANSFERT', p_quantite, 'MAGASIN', 'VENTE', 'Transfert POS', p_user_id);

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
