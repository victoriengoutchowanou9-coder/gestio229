-- =============================================================================
-- GESTIO 229 SaaS — ROLLBACK MIGRATION M076 (2026-10-24)
-- Script de retour arrière sécurisé (sans suppression de données)
-- =============================================================================

BEGIN;

DO $$
DECLARE
  t_name TEXT;
  tenant_tables TEXT[] := ARRAY[
    'customers',
    'suppliers',
    'products',
    'product_categories',
    'stock_movements',
    'stock_locations',
    'stock_levels',
    'inventory_sessions',
    'sales_orders',
    'purchase_orders',
    'client_debts',
    'debt_payments',
    'customer_repayments',
    'caisses',
    'caisse_sessions',
    'sessions_caisse',
    'caisse_mouvements',
    'caisse_clotures',
    'clotures_caisse',
    'caisse_journaliere',
    'fonds_actuels',
    'coffre_fort',
    'cash_registers',
    'cash_sessions',
    'expenses',
    'treasury_accounts',
    'treasury_transfers',
    'demandes_retrait',
    'accounting_journals',
    'accounting_periods',
    'accounting_entries',
    'parametres_destinataires',
    'audit_logs',
    'company_activities'
  ];
BEGIN
  FOREACH t_name IN ARRAY tenant_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t_name
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t_name || '_tenant_rls_policy', t_name);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS sales_order_items_tenant_rls_policy ON public.sales_order_items;
DROP POLICY IF EXISTS accounting_entry_lines_tenant_rls_policy ON public.accounting_entry_lines;
DROP POLICY IF EXISTS bons_commande_tenant_rls_policy ON public.bons_commande;
DROP POLICY IF EXISTS bc_lignes_tenant_rls_policy ON public.bc_lignes;
DROP POLICY IF EXISTS syscohada_accounts_tenant_rls_policy ON public.syscohada_accounts;
DROP POLICY IF EXISTS sectors_read_policy ON public.sectors;
DROP POLICY IF EXISTS abonnements_secteurs_tenant_rls_policy ON public.abonnements_secteurs;

NOTIFY pgrst, 'reload schema';

COMMIT;
