-- ==============================================================================
-- GESTIO 229 ERP - MIGRATION M073
-- Correction Critique : Quantité Commandée = 0 à la Réception (UCD Multi-Unités)
-- Règle B.1 : Achats et Réceptions Stock Magasin en UCD
-- ==============================================================================

-- 1. TABLE : bons_commande_lignes (Création avec tous les synonymes et colonnes UCD)
CREATE TABLE IF NOT EXISTS public.bons_commande_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    bc_id TEXT NOT NULL, -- Accepte UUID ou Référence texte type 'BC-2026-6458'
    bon_commande_id UUID,
    produit_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    article TEXT NOT NULL DEFAULT 'Article',
    designation TEXT,
    nom_produit TEXT,
    code_produit TEXT,
    quantite NUMERIC(15,3) NOT NULL DEFAULT 1,
    quantite_ucd NUMERIC(15,3) NOT NULL DEFAULT 1,
    quantite_recue NUMERIC(15,3) DEFAULT 0,
    qte_commande NUMERIC(15,3) DEFAULT 1,
    qte_recue NUMERIC(15,3) DEFAULT 0,
    unite_commande TEXT DEFAULT 'UCD',
    unite_ucd TEXT DEFAULT 'UCD',
    ucd TEXT DEFAULT 'UCD',
    coefficient_conversion NUMERIC(15,3) DEFAULT 1,
    prix_unitaire NUMERIC(15,2) DEFAULT 0,
    pu_ttc NUMERIC(15,2) DEFAULT 0,
    total_ht NUMERIC(15,2) DEFAULT 0,
    total_ttc NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir toutes les colonnes sur bons_commande_lignes au cas où la table préexistait
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS bc_id TEXT;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS bon_commande_id UUID;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS produit_id UUID;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS article TEXT DEFAULT 'Article';
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS nom_produit TEXT;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS code_produit TEXT;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS quantite NUMERIC(15,3) DEFAULT 1;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS quantite_ucd NUMERIC(15,3) DEFAULT 1;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS quantite_recue NUMERIC(15,3) DEFAULT 0;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS qte_commande NUMERIC(15,3) DEFAULT 1;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS qte_recue NUMERIC(15,3) DEFAULT 0;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS unite_commande TEXT DEFAULT 'UCD';
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS unite_ucd TEXT DEFAULT 'UCD';
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS ucd TEXT DEFAULT 'UCD';
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS coefficient_conversion NUMERIC(15,3) DEFAULT 1;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS prix_unitaire NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS pu_ttc NUMERIC(15,2) DEFAULT 0;
ALTER TABLE public.bons_commande_lignes ADD COLUMN IF NOT EXISTS total_ttc NUMERIC(15,2) DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_bcl_bc_id ON public.bons_commande_lignes(bc_id);
CREATE INDEX IF NOT EXISTS idx_bcl_produit_id ON public.bons_commande_lignes(produit_id);

-- 2. TABLE : bc_lignes (Assurer l'interopérabilité avec quantite_ucd, quantite, unite_commande, etc.)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bc_lignes') THEN
        ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS quantite NUMERIC(15,3) DEFAULT 1;
        ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS quantite_ucd NUMERIC(15,3) DEFAULT 1;
        ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS unite_commande TEXT DEFAULT 'UCD';
        ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS unite_ucd TEXT DEFAULT 'UCD';
        ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS article TEXT;
        ALTER TABLE public.bc_lignes ADD COLUMN IF NOT EXISTS coefficient_conversion NUMERIC(15,3) DEFAULT 1;
    END IF;
END $$;

-- 3. TABLE : stocks_magazin / stock_magasin (Conforme Règle B.1)
CREATE TABLE IF NOT EXISTS public.stocks_magazin (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    produit_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    produit TEXT NOT NULL,
    quantite NUMERIC(15,3) NOT NULL DEFAULT 0,
    stock_ucd NUMERIC(15,3) DEFAULT 0,
    unite TEXT DEFAULT 'UCD',
    ucd TEXT DEFAULT 'UCD',
    reference_bl TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir toutes les colonnes sur stocks_magazin
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS produit_id UUID;
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS produit TEXT;
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS quantite NUMERIC(15,3) DEFAULT 0;
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS stock_ucd NUMERIC(15,3) DEFAULT 0;
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS unite TEXT DEFAULT 'UCD';
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS ucd TEXT DEFAULT 'UCD';
ALTER TABLE public.stocks_magazin ADD COLUMN IF NOT EXISTS reference_bl TEXT;

-- Garantir les colonnes sur stock_magasin si elle existe
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'stock_magasin') THEN
        ALTER TABLE public.stock_magasin ADD COLUMN IF NOT EXISTS quantite NUMERIC(15,3) DEFAULT 0;
        ALTER TABLE public.stock_magasin ADD COLUMN IF NOT EXISTS produit TEXT;
        ALTER TABLE public.stock_magasin ADD COLUMN IF NOT EXISTS unite TEXT DEFAULT 'UCD';
    END IF;
END $$;

-- 4. POLITIQUES RLS SUR bons_commande_lignes ET stocks_magazin
ALTER TABLE public.bons_commande_lignes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_bons_commande_lignes" ON public.bons_commande_lignes;
CREATE POLICY "allow_all_bons_commande_lignes" ON public.bons_commande_lignes FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.stocks_magazin ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allow_all_stocks_magazin" ON public.stocks_magazin;
CREATE POLICY "allow_all_stocks_magazin" ON public.stocks_magazin FOR ALL USING (true) WITH CHECK (true);

-- 5. MIGRATION DES BC EXISTANTS : quantite_ucd = quantite si 0 ou NULL
UPDATE public.bons_commande_lignes
SET quantite_ucd = quantite
WHERE quantite_ucd = 0 OR quantite_ucd IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'bc_lignes') THEN
        UPDATE public.bc_lignes
        SET quantite_ucd = COALESCE(qte_commande, quantite, 1),
            quantite = COALESCE(quantite, qte_commande, 1)
        WHERE quantite_ucd = 0 OR quantite_ucd IS NULL;
    END IF;
END $$;

-- 6. Trigger de synchronisation automatique quantite_ucd lors des insertions futures
CREATE OR REPLACE FUNCTION trg_sync_bc_lignes_quantite_ucd()
RETURNS TRIGGER AS $$
BEGIN
    -- Si quantite_ucd est vide ou 0, calculer via quantite * coeff ou quantite directe
    IF NEW.quantite_ucd IS NULL OR NEW.quantite_ucd = 0 THEN
        IF NEW.quantite IS NOT NULL AND NEW.quantite > 0 THEN
            NEW.quantite_ucd := NEW.quantite * COALESCE(NEW.coefficient_conversion, 1);
        ELSIF NEW.qte_commande IS NOT NULL AND NEW.qte_commande > 0 THEN
            NEW.quantite_ucd := NEW.qte_commande;
            NEW.quantite := NEW.qte_commande;
        END IF;
    END IF;

    -- Synchroniser les synonymes
    IF NEW.quantite IS NULL OR NEW.quantite = 0 THEN
        NEW.quantite := NEW.quantite_ucd;
    END IF;
    IF NEW.qte_commande IS NULL OR NEW.qte_commande = 0 THEN
        NEW.qte_commande := NEW.quantite_ucd;
    END IF;
    IF NEW.article IS NULL AND NEW.nom_produit IS NOT NULL THEN
        NEW.article := NEW.nom_produit;
    END IF;
    IF NEW.nom_produit IS NULL AND NEW.article IS NOT NULL THEN
        NEW.nom_produit := NEW.article;
    END IF;
    IF NEW.unite_ucd IS NULL AND NEW.ucd IS NOT NULL THEN
        NEW.unite_ucd := NEW.ucd;
    END IF;
    IF NEW.unite_commande IS NULL AND NEW.unite_ucd IS NOT NULL THEN
        NEW.unite_commande := NEW.unite_ucd;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_bons_commande_lignes_quantite_ucd ON public.bons_commande_lignes;
CREATE TRIGGER trg_sync_bons_commande_lignes_quantite_ucd
BEFORE INSERT OR UPDATE ON public.bons_commande_lignes
FOR EACH ROW EXECUTE FUNCTION trg_sync_bc_lignes_quantite_ucd();

-- Notification de rechargement du schéma PostgREST
NOTIFY pgrst, 'reload schema';
