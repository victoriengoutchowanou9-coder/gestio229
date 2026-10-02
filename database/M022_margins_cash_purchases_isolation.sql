-- ==============================================================================
-- GESTIO 229 SAAS — MIGRATION M022 : REFONTE CALCUL MARGES & MODULES CAISSE / ACHATS
-- Isolation stricte multi-secteurs (19 sous-logiciels indépendants)
-- ==============================================================================

-- 1. TABLE vente_lignes (Lignes de vente avec coût d'achat figé à la vente)
CREATE TABLE IF NOT EXISTS vente_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    vente_id UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
    produit_id UUID REFERENCES products(id) ON DELETE SET NULL,
    quantite NUMERIC(15, 3) NOT NULL DEFAULT 1,
    prix_vente_ht_unitaire NUMERIC(15, 2) NOT NULL DEFAULT 0,
    cout_achat_ht_unitaire NUMERIC(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vente_lignes_isolation ON vente_lignes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_vente_lignes_vente ON vente_lignes(vente_id);

-- 2. VUE OFFICIELLE DU RÉSUMÉ D'ACTIVITÉ (SOURCE DE VÉRITÉ UNIQUE POUR LES MARGES)
CREATE OR REPLACE VIEW v_resume_activite AS
SELECT 
    company_id, 
    sector_slug,
    COALESCE(SUM(vl.quantite * vl.prix_vente_ht_unitaire), 0)::NUMERIC(15, 2) AS ca_ht,
    COALESCE(SUM(vl.quantite * (vl.prix_vente_ht_unitaire - vl.cout_achat_ht_unitaire)), 0)::NUMERIC(15, 2) AS marge_brute
FROM vente_lignes vl
GROUP BY company_id, sector_slug;

-- 3. MODULE CAISSE : TABLES OFFICIELLES ISOLÉES PAR (company_id, sector_slug)

-- 3.1. Table caisses (Gestion de l'état d'ouverture de caisse)
CREATE TABLE IF NOT EXISTS caisses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    date_ouverture TIMESTAMPTZ DEFAULT now(),
    statut VARCHAR(20) NOT NULL DEFAULT 'ouverte' CHECK (statut IN ('ouverte', 'fermee')),
    fond_ouverture_especes NUMERIC(15, 2) NOT NULL DEFAULT 0,
    fond_ouverture_momo NUMERIC(15, 2) NOT NULL DEFAULT 0,
    ouvert_par TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caisses_isolation ON caisses(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_caisses_statut ON caisses(company_id, sector_slug, statut);

-- 3.2. Table caisse_mouvements (Mouvements de caisse en cours de journée)
CREATE TABLE IF NOT EXISTS caisse_mouvements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    caisse_id UUID REFERENCES caisses(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('especes', 'momo')),
    sens VARCHAR(20) NOT NULL CHECK (sens IN ('entree', 'sortie')),
    montant NUMERIC(15, 2) NOT NULL DEFAULT 0,
    motif TEXT,
    reference_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_isolation ON caisse_mouvements(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_caisse_mouvements_caisse ON caisse_mouvements(caisse_id);

-- 3.3. Table caisse_clotures (Historique des clôtures avec rapport)
CREATE TABLE IF NOT EXISTS caisse_clotures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    caisse_id UUID REFERENCES caisses(id) ON DELETE CASCADE,
    total_especes_jour NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_momo_jour NUMERIC(15, 2) NOT NULL DEFAULT 0,
    fond_actuel_especes_apres NUMERIC(15, 2) NOT NULL DEFAULT 0,
    fond_actuel_momo_apres NUMERIC(15, 2) NOT NULL DEFAULT 0,
    cloture_par TEXT,
    date_cloture TIMESTAMPTZ DEFAULT now(),
    rapport_pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caisse_clotures_isolation ON caisse_clotures(company_id, sector_slug);

-- 3.4. Table coffre_fort (Soldes de trésorerie par activité)
CREATE TABLE IF NOT EXISTS coffre_fort (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    solde_especes NUMERIC(15, 2) NOT NULL DEFAULT 0,
    solde_momo_marchand NUMERIC(15, 2) NOT NULL DEFAULT 0,
    solde_banque NUMERIC(15, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, sector_slug)
);

CREATE INDEX IF NOT EXISTS idx_coffre_fort_isolation ON coffre_fort(company_id, sector_slug);

-- 4. MODULE ACHATS & FOURNISSEURS

-- 4.1. Table bons_commande
CREATE TABLE IF NOT EXISTS bons_commande (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    numero_bc TEXT NOT NULL,
    fournisseur_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
    demandeur_nom TEXT NOT NULL,
    signature_demandeur TEXT,
    date_commande DATE NOT NULL DEFAULT CURRENT_DATE,
    date_livraison_prevue DATE,
    statut VARCHAR(30) DEFAULT 'EN_ATTENTE' CHECK (statut IN ('BROUILLON', 'EN_ATTENTE', 'LIVRE', 'ANNULE')),
    total_ht NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_ttc NUMERIC(15, 2) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(company_id, sector_slug, numero_bc)
);

CREATE INDEX IF NOT EXISTS idx_bons_commande_isolation ON bons_commande(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_bons_commande_fournisseur ON bons_commande(fournisseur_id);

-- 4.2. Table bon_commande_lignes
CREATE TABLE IF NOT EXISTS bon_commande_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bon_commande_id UUID NOT NULL REFERENCES bons_commande(id) ON DELETE CASCADE,
    produit_id UUID REFERENCES products(id) ON DELETE SET NULL,
    designation TEXT NOT NULL,
    quantite NUMERIC(15, 3) NOT NULL DEFAULT 1,
    prix_unitaire_ht NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_ht NUMERIC(15, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bon_commande_lignes_bc ON bon_commande_lignes(bon_commande_id);

-- 4.3. Table dettes_fournisseurs (Dettes et factures d'achat)
CREATE TABLE IF NOT EXISTS dettes_fournisseurs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    fournisseur_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    bon_commande_id UUID REFERENCES bons_commande(id) ON DELETE SET NULL,
    reference_facture TEXT,
    montant_ttc_du NUMERIC(15, 2) NOT NULL DEFAULT 0,
    montant_paye NUMERIC(15, 2) NOT NULL DEFAULT 0,
    reste_a_payer NUMERIC(15, 2) NOT NULL DEFAULT 0,
    statut VARCHAR(30) DEFAULT 'NON_PAYE' CHECK (statut IN ('NON_PAYE', 'PARTIEL', 'SOLDE')),
    date_echeance DATE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dettes_fournisseurs_isolation ON dettes_fournisseurs(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_dettes_fournisseurs_fournisseur ON dettes_fournisseurs(fournisseur_id);

-- 4.4. Table dette_paiements (Historique des règlements de dettes fournisseurs)
CREATE TABLE IF NOT EXISTS dette_paiements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'boutique',
    dette_id UUID NOT NULL REFERENCES dettes_fournisseurs(id) ON DELETE CASCADE,
    mode VARCHAR(30) NOT NULL CHECK (mode IN ('especes', 'momo', 'virement', 'cheque')),
    montant NUMERIC(15, 2) NOT NULL DEFAULT 0,
    paye_le TIMESTAMPTZ DEFAULT now(),
    reference_paiement TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dette_paiements_isolation ON dette_paiements(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_dette_paiements_dette ON dette_paiements(dette_id);
