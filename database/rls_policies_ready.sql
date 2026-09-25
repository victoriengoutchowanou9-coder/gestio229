-- ==============================================================================
-- GESTIONAFRICA / GESTIO 229 — SCRIPT SQL RLS POUR SUPABASE
-- À exécuter dans l'éditeur SQL de Supabase (SQL Editor)
-- Modèle générique et modèles par table avec Row Level Security (RLS)
-- ==============================================================================

-- MODÈLE GÉNÉRIQUE (Pour chaque table spécifique) :
-- ALTER TABLE votre_table ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Lecture propre" ON votre_table FOR SELECT USING (auth.uid() = user_id);
-- CREATE POLICY "Création propre" ON votre_table FOR INSERT WITH CHECK (auth.uid() = user_id);
-- CREATE POLICY "Modification propre" ON votre_table FOR UPDATE USING (auth.uid() = user_id);
-- CREATE POLICY "Suppression propre" ON votre_table FOR DELETE USING (auth.uid() = user_id);

-- 1. Table: user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture propre user_profiles" ON user_profiles;
CREATE POLICY "Lecture propre user_profiles" ON user_profiles FOR SELECT USING (auth.uid() = user_id OR auth.uid() = auth_user_id);
DROP POLICY IF EXISTS "Création propre user_profiles" ON user_profiles;
CREATE POLICY "Création propre user_profiles" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() = auth_user_id);
DROP POLICY IF EXISTS "Modification propre user_profiles" ON user_profiles;
CREATE POLICY "Modification propre user_profiles" ON user_profiles FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = auth_user_id);
DROP POLICY IF EXISTS "Suppression propre user_profiles" ON user_profiles;
CREATE POLICY "Suppression propre user_profiles" ON user_profiles FOR DELETE USING (auth.uid() = user_id OR auth.uid() = auth_user_id);

-- 2. Table: companies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture propre companies" ON companies;
CREATE POLICY "Lecture propre companies" ON companies FOR SELECT USING (auth.uid() = user_id OR id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Création propre companies" ON companies;
CREATE POLICY "Création propre companies" ON companies FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Modification propre companies" ON companies;
CREATE POLICY "Modification propre companies" ON companies FOR UPDATE USING (auth.uid() = user_id OR id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Suppression propre companies" ON companies;
CREATE POLICY "Suppression propre companies" ON companies FOR DELETE USING (auth.uid() = user_id);

-- 3. Table: products (produits)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture propre products" ON products;
CREATE POLICY "Lecture propre products" ON products FOR SELECT USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Création propre products" ON products;
CREATE POLICY "Création propre products" ON products FOR INSERT WITH CHECK (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Modification propre products" ON products;
CREATE POLICY "Modification propre products" ON products FOR UPDATE USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Suppression propre products" ON products;
CREATE POLICY "Suppression propre products" ON products FOR DELETE USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));

-- 4. Table: sales (ventes)
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture propre sales" ON sales;
CREATE POLICY "Lecture propre sales" ON sales FOR SELECT USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Création propre sales" ON sales;
CREATE POLICY "Création propre sales" ON sales FOR INSERT WITH CHECK (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Modification propre sales" ON sales;
CREATE POLICY "Modification propre sales" ON sales FOR UPDATE USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Suppression propre sales" ON sales;
CREATE POLICY "Suppression propre sales" ON sales FOR DELETE USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));

-- 5. Table: clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture propre clients" ON clients;
CREATE POLICY "Lecture propre clients" ON clients FOR SELECT USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Création propre clients" ON clients;
CREATE POLICY "Création propre clients" ON clients FOR INSERT WITH CHECK (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Modification propre clients" ON clients;
CREATE POLICY "Modification propre clients" ON clients FOR UPDATE USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Suppression propre clients" ON clients;
CREATE POLICY "Suppression propre clients" ON clients FOR DELETE USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));

-- 6. Table: expenses (dépenses)
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture propre expenses" ON expenses;
CREATE POLICY "Lecture propre expenses" ON expenses FOR SELECT USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Création propre expenses" ON expenses;
CREATE POLICY "Création propre expenses" ON expenses FOR INSERT WITH CHECK (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Modification propre expenses" ON expenses;
CREATE POLICY "Modification propre expenses" ON expenses FOR UPDATE USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Suppression propre expenses" ON expenses;
CREATE POLICY "Suppression propre expenses" ON expenses FOR DELETE USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));

-- 7. Table: cash_registers (caisse)
ALTER TABLE cash_registers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture propre cash_registers" ON cash_registers;
CREATE POLICY "Lecture propre cash_registers" ON cash_registers FOR SELECT USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Création propre cash_registers" ON cash_registers;
CREATE POLICY "Création propre cash_registers" ON cash_registers FOR INSERT WITH CHECK (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Modification propre cash_registers" ON cash_registers;
CREATE POLICY "Modification propre cash_registers" ON cash_registers FOR UPDATE USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
DROP POLICY IF EXISTS "Suppression propre cash_registers" ON cash_registers;
CREATE POLICY "Suppression propre cash_registers" ON cash_registers FOR DELETE USING (auth.uid() = user_id OR company_id IN (SELECT company_id FROM user_profiles WHERE auth_user_id = auth.uid()));
