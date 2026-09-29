-- ==============================================================================
-- GESTIO 229 — MIGRATION M017 : Autorisation de Crédit & Réduction Client
-- ==============================================================================
-- À exécuter dans : Supabase Dashboard → SQL Editor → New Query
-- Cette migration ajoute les colonnes nécessaires pour :
-- 1. L'autorisation d'achat à crédit (credit_authorized, credit_limit)
-- 2. La gestion des réductions accordées aux clients (discount_eligible, discount_rate)
-- ==============================================================================

-- 1. Ajout sécurisé des colonnes à la table customers
ALTER TABLE customers 
ADD COLUMN IF NOT EXISTS credit_authorized BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(15,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS discount_eligible BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5,2) DEFAULT 0.00;

-- 2. Indexation pour optimiser les requêtes multi-entreprises
CREATE INDEX IF NOT EXISTS idx_customers_credit ON customers(company_id, credit_authorized);
CREATE INDEX IF NOT EXISTS idx_customers_discount ON customers(company_id, discount_eligible);

-- 3. Vérification des colonnes créées
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'customers' 
AND column_name IN ('credit_authorized', 'credit_limit', 'discount_eligible', 'discount_rate');
