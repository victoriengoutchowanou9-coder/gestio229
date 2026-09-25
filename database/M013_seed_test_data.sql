-- ==============================================================================
-- M013 : SEED COMPLET OBLIGATOIRE — "GESTIO 229 BOUTIQUE"
-- Permet le déblocage immédiat de toutes les requêtes multi-tenant (company_id)
-- Stack : Supabase / PostgreSQL | Date : Septembre 2026
-- ==============================================================================

DO $$
DECLARE
    v_company_id UUID;
    v_sector_id UUID;
    v_cat_quinc_id UUID;
    v_cat_alim_id UUID;
    v_cust_id UUID;
    v_session_id UUID;
    v_plan_id UUID;
BEGIN

    -- 1. Récupération ou création du plan Duo / Multiservices
    SELECT id INTO v_plan_id FROM subscription_plans WHERE slug = 'duo' LIMIT 1;
    IF v_plan_id IS NULL THEN
        INSERT INTO subscription_plans (name, slug, max_sectors, max_users, max_products, price_monthly, features)
        VALUES ('Plan Duo Pro', 'duo', 2, 10, 5000, 9000.00, '["ventes", "stock", "caisse", "finances", "clients", "fournisseurs", "depenses", "rapports", "syscohada", "configuration", "audit", "abonnement"]')
        RETURNING id INTO v_plan_id;
    END IF;

    -- 2. Création de l'entreprise GESTIO 229 BOUTIQUE
    SELECT id INTO v_company_id FROM companies WHERE ifu_number = '3202612345678' LIMIT 1;
    IF v_company_id IS NULL THEN
        INSERT INTO companies (
            name, legal_form, ifu_number, rccm_number, regime_fiscal,
            address, city, country, phone, email, currency,
            tva_default_rate, aib_default_rate, active_sector,
            e_mecef_active, e_mecef_nim, subscription_status,
            onboarding_completed, plan_id
        ) VALUES (
            'GESTIO 229 BOUTIQUE',
            'SARL',
            '3202612345678',
            'RB/COT/26 B 12345',
            'Régime Réel Simplifié (RRS)',
            'Carrefour Vêdoko, Immeuble GESTIO',
            'Cotonou',
            'Bénin',
            '+229 97 00 22 90',
            'contact@gestio229boutique.bj',
            'FCFA',
            18.00,
            1.00,
            'boutique',
            true,
            'BENIN-DGI-EMEF-2026-001',
            'active',
            true,
            v_plan_id
        ) RETURNING id INTO v_company_id;
    END IF;

    -- 3. Secteur boutique / commerce général
    SELECT id INTO v_sector_id FROM sectors WHERE slug = 'boutique' LIMIT 1;
    IF v_sector_id IS NULL THEN
        INSERT INTO sectors (slug, name, description, icon, color, modules, is_active)
        VALUES (
            'boutique',
            'Commerce Général & Quincaillerie',
            'Vente au détail, gros et matériaux',
            'Store',
            '#059669',
            '["ventes","stock","caisse","finances","clients","fournisseurs","depenses","rapports","syscohada","configuration","audit","abonnement"]'::jsonb,
            true
        ) RETURNING id INTO v_sector_id;
    END IF;

    -- Liaison Entreprise <-> Secteur
    INSERT INTO company_sectors (company_id, sector_id, is_configured, configuration)
    VALUES (
        v_company_id,
        v_sector_id,
        true,
        '{"point_of_sale_name": "Boutique Principale Dantokpa", "currency": "FCFA", "billing_mode": "direct"}'::jsonb
    ) ON CONFLICT (company_id, sector_id) DO NOTHING;

    -- 4. Catégories de produits
    SELECT id INTO v_cat_quinc_id FROM product_categories WHERE company_id = v_company_id AND name = 'Matériaux & Quincaillerie' LIMIT 1;
    IF v_cat_quinc_id IS NULL THEN
        INSERT INTO product_categories (company_id, name, code, is_active)
        VALUES (v_company_id, 'Matériaux & Quincaillerie', 'CAT-BTP', true)
        RETURNING id INTO v_cat_quinc_id;
    END IF;

    SELECT id INTO v_cat_alim_id FROM product_categories WHERE company_id = v_company_id AND name = 'Alimentation & Boissons' LIMIT 1;
    IF v_cat_alim_id IS NULL THEN
        INSERT INTO product_categories (company_id, name, code, is_active)
        VALUES (v_company_id, 'Alimentation & Boissons', 'CAT-ALIM', true)
        RETURNING id INTO v_cat_alim_id;
    END IF;

    -- 5. Insertion des 10 Produits Clés (Ciment, Fer, etc.)
    INSERT INTO products (company_id, category_id, code, name, unit, cost_price, selling_price, min_stock_alert, is_active)
    VALUES
    (v_company_id, v_cat_quinc_id, 'CIM-001', 'Ciment Bouclier CEM II 42.5 (Sac 50kg)', 'Sac', 4100.00, 4600.00, 20.00, true),
    (v_company_id, v_cat_quinc_id, 'FER-008', 'Fer à béton Haute Adhérence FeE500 Ø8mm (Barre 12m)', 'Barre', 2400.00, 2900.00, 30.00, true),
    (v_company_id, v_cat_quinc_id, 'FER-010', 'Fer à béton Haute Adhérence FeE500 Ø10mm (Barre 12m)', 'Barre', 3700.00, 4400.00, 25.00, true),
    (v_company_id, v_cat_quinc_id, 'FER-012', 'Fer à béton Haute Adhérence FeE500 Ø12mm (Barre 12m)', 'Barre', 5300.00, 6200.00, 20.00, true),
    (v_company_id, v_cat_quinc_id, 'TOL-001', 'Tôle Bac Aluzinc 45/100e (Feuille 3m)', 'Feuille', 7500.00, 8900.00, 15.00, true),
    (v_company_id, v_cat_quinc_id, 'PEI-001', 'Peinture Acrylique Mate Blanche (Seau 20L)', 'Seau', 16000.00, 21500.00, 5.00, true),
    (v_company_id, v_cat_quinc_id, 'COL-001', 'Ciment Colle Superflex C2TE (Sac 25kg)', 'Sac', 3200.00, 4200.00, 10.00, true),
    (v_company_id, v_cat_alim_id,  'RIZ-025', 'Riz Parfumé Super Maman 5% Brisures (Sac 25kg)', 'Sac', 18500.00, 21000.00, 10.00, true),
    (v_company_id, v_cat_alim_id,  'HUI-020', 'Huile Végétale Raffinée Oléo (Bidon 20L)', 'Bidon', 21000.00, 24000.00, 8.00, true),
    (v_company_id, v_cat_alim_id,  'SUC-050', 'Sucre Blanc Cristallisé SN SOSUCO (Sac 50kg)', 'Sac', 28000.00, 31500.00, 5.00, true)
    ON CONFLICT DO NOTHING;

    -- 6. Création du Client Comptoir (Achat Cash)
    SELECT id INTO v_cust_id FROM customers WHERE company_id = v_company_id AND code = 'CLI-COMPTOIR' LIMIT 1;
    IF v_cust_id IS NULL THEN
        INSERT INTO customers (company_id, code, name, ifu_number, phone, city, credit_limit, current_debt, is_active)
        VALUES (
            v_company_id,
            'CLI-COMPTOIR',
            'Client Comptoir Ordinaire',
            '0000000000000',
            '+229 00 00 00 00',
            'Cotonou',
            0.00,
            0.00,
            true
        ) RETURNING id INTO v_cust_id;
    END IF;

    -- 7. Création de la Caisse Principale Ouverte
    SELECT id INTO v_session_id FROM cash_sessions WHERE company_id = v_company_id AND status = 'open' LIMIT 1;
    IF v_session_id IS NULL THEN
        INSERT INTO cash_sessions (
            company_id, name, opened_at, opening_balance, status, notes
        ) VALUES (
            v_company_id,
            'Session Quotidienne Caisse 1',
            now(),
            100000.00,
            'open',
            'Ouverture automatique initiale de recette et test POS'
        );
    END IF;

    -- 8. Création de 2 Fournisseurs de Référence
    INSERT INTO suppliers (company_id, code, name, phone, email, city, is_active)
    VALUES
    (v_company_id, 'FOURN-001', 'CIMBÉNIN SA (Ciments du Bénin)', '+229 21 33 00 11', 'commercial@cimbenin.bj', 'Cotonou', true),
    (v_company_id, 'FOURN-002', 'SONIB BTP & Matériaux', '+229 97 11 22 33', 'contact@sonib-btp.bj', 'Porto-Novo', true)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE 'SEED M013 GESTIO 229 BOUTIQUE EXÉCUTÉ AVEC SUCCÈS. Company ID: %', v_company_id;

END $$;
