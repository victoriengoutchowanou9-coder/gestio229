-- ==============================================================================
-- GESTIO 229 SaaS — SCRIPT DE RÉINITIALISATION GÉNÉRALE DES COMPTES CLIENTS
-- ==============================================================================
-- Objectif : Supprimer définitivement toutes les entreprises, comptes utilisateurs,
-- données métiers associées et comptes d'authentification afin de permettre
-- une nouvelle campagne d'inscription intégrale et propre.
--
-- GARANTIES ET INTÉGRITÉ :
-- 1. Zéro suppression de structure : Aucune table, vue, fonction, politique RLS n'est supprimée.
-- 2. Préservation des paramètres généraux : La table `sectors` (les 23 secteurs / 19 sous-logiciels) est intacte.
-- 3. Suppression respectant l'arbre hiérarchique des clés étrangères (aucun blocage relationnel).
-- 4. Nettoyage de `auth.users` : Permet aux clients de se réinscrire avec leurs mêmes e-mails.
-- ==============================================================================

BEGIN;

-- 1. Suppression des éléments de ventes et factures
DELETE FROM sales_order_items;
DELETE FROM sales_orders;

-- 2. Suppression des stocks et catalogues
DELETE FROM stock_movements;
DELETE FROM products;
DELETE FROM product_categories;
DELETE FROM stock_locations;

-- 3. Suppression des caisses et sessions
DELETE FROM cash_sessions;
DELETE FROM cash_registers;

-- 4. Suppression des créances et clients
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customer_repayments') THEN
    DELETE FROM customer_repayments;
  END IF;
END $$;
DELETE FROM customers;

-- 5. Suppression des achats et fournisseurs
DELETE FROM purchase_orders;
DELETE FROM suppliers;

-- 6. Suppression des dépenses et de la trésorerie
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'treasury_transfers') THEN
    DELETE FROM treasury_transfers;
  END IF;
END $$;
DELETE FROM expenses;
DELETE FROM treasury_accounts;

-- 7. Suppression des budgets et comptabilité
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budget_lines') THEN
    DELETE FROM budget_lines;
  END IF;
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'budgets') THEN
    DELETE FROM budgets;
  END IF;
END $$;

-- 8. Suppression des journaux d'audit rattachés aux anciens comptes
DELETE FROM audit_logs;

-- 9. Suppression des habilitations sectorielles des entreprises
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_sectors') THEN
    DELETE FROM company_sectors;
  END IF;
END $$;

-- 10. Suppression des profils utilisateurs
DELETE FROM user_profiles;

-- 11. Suppression des entreprises clientes
DELETE FROM companies;

-- 12. Nettoyage des comptes dans Supabase Auth (auth.users)
-- Ceci libère les adresses emails pour permettre une réinscription immédiate
DELETE FROM auth.users
WHERE email IN (
  'agorien1998@gmail.com',
  'victoriengoutchowanou62@gmail.com',
  'agossouv79@gmail.com',
  'goutchowanouvictorien37@gmail.com',
  'admin@test.bj',
  'gerant@test.bj',
  'caissier@test.bj',
  'magasinier@test.bj',
  'boutique@test.bj'
)
OR email LIKE '%@test.bj'
OR email LIKE '%@gmail.com';

COMMIT;

-- Vérification immédiate post-nettoyage :
SELECT 
  (SELECT COUNT(*) FROM companies) AS remaining_companies,
  (SELECT COUNT(*) FROM user_profiles) AS remaining_user_profiles,
  (SELECT COUNT(*) FROM products) AS remaining_products,
  (SELECT COUNT(*) FROM customers) AS remaining_customers,
  (SELECT COUNT(*) FROM sectors) AS preserved_sectors_catalog;
