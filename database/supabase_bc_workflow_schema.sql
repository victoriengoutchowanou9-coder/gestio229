-- ==============================================================================
-- GESTIO 229 ERP V3 - MODULE BON DE COMMANDE PRO (BC) & CIRCUIT DE VALIDATION
-- Conforme aux normes Bénin / UEMOA et à la Règle B.1 (Achats & Stocks en UCD)
-- ==============================================================================

-- 1. TABLE : bons_commande
CREATE TABLE IF NOT EXISTS bons_commande (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(50) NOT NULL UNIQUE,
    fournisseur_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    fournisseur_nom VARCHAR(255) NOT NULL,
    date_commande DATE NOT NULL DEFAULT CURRENT_DATE,
    date_livraison_prevue DATE,
    statut VARCHAR(50) NOT NULL DEFAULT 'En attente Signature Gestionnaire',
    total_ttc NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    notes TEXT,
    created_by UUID REFERENCES user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour recherche rapide
CREATE INDEX IF NOT EXISTS idx_bons_commande_ref ON bons_commande(reference);
CREATE INDEX IF NOT EXISTS idx_bons_commande_statut ON bons_commande(statut);
CREATE INDEX IF NOT EXISTS idx_bons_commande_fournisseur ON bons_commande(fournisseur_id);

-- 2. TABLE : bc_lignes
CREATE TABLE IF NOT EXISTS bc_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bc_id UUID NOT NULL REFERENCES bons_commande(id) ON DELETE CASCADE,
    produit_id UUID REFERENCES products(id) ON DELETE SET NULL,
    code_produit VARCHAR(50) NOT NULL,
    nom_produit VARCHAR(255) NOT NULL,
    ucd VARCHAR(50) NOT NULL DEFAULT 'Carton', -- RÈGLE B.1 : Unité de Conditionnement
    stock_actuel_ucd NUMERIC(15,2) DEFAULT 0.00,
    qte_commande NUMERIC(15,2) NOT NULL CHECK (qte_commande > 0),
    qte_recue NUMERIC(15,2) DEFAULT 0.00 CHECK (qte_recue >= 0),
    pu_ttc NUMERIC(15,2) NOT NULL DEFAULT 0.00 CHECK (pu_ttc >= 0),
    total_ligne NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bc_lignes_bc ON bc_lignes(bc_id);
CREATE INDEX IF NOT EXISTS idx_bc_lignes_produit ON bc_lignes(produit_id);

-- 3. TABLE : signatures_bc
CREATE TABLE IF NOT EXISTS signatures_bc (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bc_id UUID NOT NULL REFERENCES bons_commande(id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL, -- 'gestionnaire', 'directeur', 'magasinier'
    signer_name VARCHAR(255) NOT NULL,
    signature_image_base64 TEXT NOT NULL,
    date_signature TIMESTAMPTZ DEFAULT now(),
    ip_address VARCHAR(50),
    CONSTRAINT chk_bc_role CHECK (role IN ('gestionnaire', 'directeur', 'magasinier'))
);

CREATE INDEX IF NOT EXISTS idx_signatures_bc ON signatures_bc(bc_id);

-- 4. TABLE : stock_magasin (si absente)
CREATE TABLE IF NOT EXISTS stock_magasin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produit_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    code_produit VARCHAR(50),
    stock_ucd NUMERIC(15,2) NOT NULL DEFAULT 0.00,
    ucd VARCHAR(50) NOT NULL DEFAULT 'Carton',
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- 5. POLITIQUES DE SÉCURITÉ ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE bons_commande ENABLE ROW LEVEL SECURITY;
ALTER TABLE bc_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE signatures_bc ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_magasin ENABLE ROW LEVEL SECURITY;

-- Politiques ouvertes pour utilisateurs authentifiés et service role
CREATE POLICY "Permettre lecture bons_commande" ON bons_commande FOR SELECT USING (true);
CREATE POLICY "Permettre insertion bons_commande" ON bons_commande FOR INSERT WITH CHECK (true);
CREATE POLICY "Permettre mise à jour bons_commande" ON bons_commande FOR UPDATE USING (true);

CREATE POLICY "Permettre lecture bc_lignes" ON bc_lignes FOR SELECT USING (true);
CREATE POLICY "Permettre insertion bc_lignes" ON bc_lignes FOR INSERT WITH CHECK (true);
CREATE POLICY "Permettre mise à jour bc_lignes" ON bc_lignes FOR UPDATE USING (true);

CREATE POLICY "Permettre lecture signatures_bc" ON signatures_bc FOR SELECT USING (true);
CREATE POLICY "Permettre insertion signatures_bc" ON signatures_bc FOR INSERT WITH CHECK (true);

CREATE POLICY "Permettre lecture stock_magasin" ON stock_magasin FOR SELECT USING (true);
CREATE POLICY "Permettre upsert stock_magasin" ON stock_magasin FOR ALL USING (true);

-- ==============================================================================
-- 6. PROCÉDURE STOCKÉE RPC CRITIQUE : receptionner_bc_maj_stock
-- Traite la réception, enregistre la signature magasinier et fait l'UPSERT
-- dans stock_magasin : stock_ucd = stock_ucd + qte_recue (Règle B.1)
-- ==============================================================================
CREATE OR REPLACE FUNCTION receptionner_bc_maj_stock(
    p_bc_id UUID,
    p_magasinier_name VARCHAR,
    p_signature_base64 TEXT,
    p_lignes_recues JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_bc RECORD;
    v_item JSONB;
    v_prod_id UUID;
    v_code VARCHAR;
    v_qte_recue NUMERIC(15,2);
    v_ucd VARCHAR;
BEGIN
    -- 1. Vérification de l'existence et du statut du Bon de Commande
    SELECT * INTO v_bc FROM bons_commande WHERE id = p_bc_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Bon de Commande introuvable.');
    END IF;

    IF v_bc.statut <> 'Validé' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ce Bon de Commande ne peut pas être réceptionné car son statut actuel est: ' || v_bc.statut);
    END IF;

    -- 2. Enregistrement de la signature du Magasinier
    INSERT INTO signatures_bc (
        bc_id,
        role,
        signer_name,
        signature_image_base64,
        date_signature
    ) VALUES (
        p_bc_id,
        'magasinier',
        COALESCE(p_magasinier_name, 'Magasinier'),
        p_signature_base64,
        now()
    );

    -- 3. Boucle sur les articles réceptionnés & Mise à jour atomique du Stock Magasin en UCD
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_lignes_recues)
    LOOP
        v_prod_id := (v_item->>'produit_id')::UUID;
        v_code := v_item->>'code_produit';
        v_qte_recue := COALESCE((v_item->>'qte_recue')::NUMERIC, 0);
        v_ucd := COALESCE(v_item->>'ucd', 'UCD');

        -- Mise à jour de la quantité reçue sur la ligne de BC
        UPDATE bc_lignes
        SET qte_recue = v_qte_recue
        WHERE bc_id = p_bc_id AND produit_id = v_prod_id;

        -- CRITIQUE : UPSERT dans stock_magasin (stock_ucd = stock_ucd + qte_recue en UCD)
        INSERT INTO stock_magasin (produit_id, code_produit, stock_ucd, ucd, updated_at)
        VALUES (v_prod_id, v_code, v_qte_recue, v_ucd, now())
        ON CONFLICT (produit_id)
        DO UPDATE SET
            stock_ucd = stock_magasin.stock_ucd + EXCLUDED.stock_ucd,
            updated_at = now();

        -- Tracé dans la table des mouvements de stock si elle existe
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_movements') THEN
            INSERT INTO stock_movements (
                company_id,
                product_id,
                movement_type,
                reference_doc,
                quantity_in,
                notes,
                created_at
            ) VALUES (
                v_bc.fournisseur_id,
                v_prod_id,
                'RECEPTION_BC',
                v_bc.reference,
                v_qte_recue,
                'Réception BC ' || v_bc.reference || ' : +' || v_qte_recue || ' ' || v_ucd || ' en Stock Magasin (Règle B.1)',
                now()
            );
        END IF;
    END LOOP;

    -- 4. Mise à jour du statut du Bon de Commande
    UPDATE bons_commande
    SET 
        statut = 'Réceptionné',
        updated_at = now()
    WHERE id = p_bc_id;

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Bon de Commande ' || v_bc.reference || ' réceptionné avec succès. Stock Magasin incrémenté en UCD (Règle B.1).'
    );
END;
$$;
