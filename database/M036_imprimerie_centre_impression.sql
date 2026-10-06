-- =============================================================================
-- Migration M036 : CENTRE D'IMPRESSION & SÉRIGRAPHIE (MODES SIMPLIFIÉ & CLASSIQUE)
-- GESTIO 229 SaaS — Silo étanche : company_id + sector_slug IN ('imprimerie', 'impression')
-- =============================================================================

-- 1. CONFIGURATION DU CENTRE D'IMPRESSION
CREATE TABLE IF NOT EXISTS public.imprimerie_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'imprimerie',
    mode_gestion VARCHAR(20) NOT NULL DEFAULT 'classique' CHECK (mode_gestion IN ('simplifie', 'classique')),
    marge_cible_pct NUMERIC(5,2) DEFAULT 40.00,
    mention_devis TEXT DEFAULT 'Validité de l''offre : 15 jours. Acompte de 50% à la commande, solde à la livraison.',
    conditions_vente TEXT DEFAULT 'Tous nos travaux sont vérifiés avant livraison. B.A.T. signé obligatoire.',
    taux_tva_defaut NUMERIC(5,2) DEFAULT 18.00,
    taux_aib_defaut NUMERIC(5,2) DEFAULT 1.00,
    devise VARCHAR(10) DEFAULT 'FCFA',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_imprimerie_config UNIQUE (company_id, sector_slug)
);

-- 2. MATIÈRES PREMIÈRES & STOCKS DÉDIÉS
CREATE TABLE IF NOT EXISTS public.imprimerie_matieres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'imprimerie',
    code VARCHAR(50) NOT NULL,
    nom VARCHAR(255) NOT NULL,
    categorie VARCHAR(100) NOT NULL DEFAULT 'Supports', -- 'Supports', 'Encres', 'Consommables', 'Accessoires', 'Autre'
    unite VARCHAR(30) NOT NULL DEFAULT 'm2', -- 'm2', 'ml', 'kg', 'l', 'feuille', 'rouleau', 'piece', 'boite'
    stock_actuel NUMERIC(15,3) NOT NULL DEFAULT 0,
    stock_minimum NUMERIC(15,3) NOT NULL DEFAULT 5,
    cout_moyen NUMERIC(15,2) NOT NULL DEFAULT 0,
    dernier_cout_achat NUMERIC(15,2) NOT NULL DEFAULT 0,
    valeur_stock NUMERIC(15,2) NOT NULL DEFAULT 0,
    fournisseur_prefere VARCHAR(255),
    est_actif BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_imprimerie_matiere_code UNIQUE (company_id, sector_slug, code)
);

-- 3. CATALOGUE DES PRESTATIONS & NOMENCLATURE (BOM)
CREATE TABLE IF NOT EXISTS public.imprimerie_prestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'imprimerie',
    code VARCHAR(50) NOT NULL,
    nom VARCHAR(255) NOT NULL,
    categorie VARCHAR(100) NOT NULL DEFAULT 'Grand Format', -- 'Grand Format', 'Papeterie', 'Textile / Sérigraphie', 'Finition', 'Graphisme', 'Autre'
    description TEXT,
    mode_calcul VARCHAR(30) NOT NULL DEFAULT 'm2' CHECK (mode_calcul IN ('m2', 'unite', 'page', 'heure', 'forfait', 'personnalise')),
    unite_facturation VARCHAR(30) NOT NULL DEFAULT 'm2',
    prix_vente NUMERIC(15,2) NOT NULL DEFAULT 0,
    prix_minimum NUMERIC(15,2) NOT NULL DEFAULT 0,
    prix_gros NUMERIC(15,2) NOT NULL DEFAULT 0,
    tva_applicable BOOLEAN NOT NULL DEFAULT false,
    aib_applicable BOOLEAN NOT NULL DEFAULT false,
    cout_mo_defaut NUMERIC(15,2) NOT NULL DEFAULT 0,
    cout_finition_defaut NUMERIC(15,2) NOT NULL DEFAULT 0,
    cout_autres_defaut NUMERIC(15,2) NOT NULL DEFAULT 0,
    est_actif BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_imprimerie_prestation_code UNIQUE (company_id, sector_slug, code)
);

-- Liaison Prestation <-> Matières premières (Nomenclature / Recette)
CREATE TABLE IF NOT EXISTS public.imprimerie_prestation_matieres (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'imprimerie',
    prestation_id UUID NOT NULL REFERENCES public.imprimerie_prestations(id) ON DELETE CASCADE,
    matiere_id UUID NOT NULL REFERENCES public.imprimerie_matieres(id) ON DELETE CASCADE,
    quantite_prevue NUMERIC(15,3) NOT NULL DEFAULT 1,
    unite VARCHAR(30) NOT NULL DEFAULT 'm2',
    cout_unitaire_prevu NUMERIC(15,2) NOT NULL DEFAULT 0,
    cout_total_prevu NUMERIC(15,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. DEVIS D'IMPRESSION
CREATE TABLE IF NOT EXISTS public.imprimerie_devis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'imprimerie',
    numero_devis VARCHAR(50) NOT NULL,
    client_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    client_nom VARCHAR(255) NOT NULL,
    client_tel VARCHAR(100),
    client_email VARCHAR(255),
    date_devis DATE NOT NULL DEFAULT CURRENT_DATE,
    date_validite DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '15 days'),
    commercial_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    commercial_nom VARCHAR(255),
    total_ht NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_tva NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_aib NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ttc NUMERIC(15,2) NOT NULL DEFAULT 0,
    statut VARCHAR(30) NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'envoye', 'accepte', 'refuse', 'expire', 'transforme')),
    commande_id UUID NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_imprimerie_devis_num UNIQUE (company_id, sector_slug, numero_devis)
);

CREATE TABLE IF NOT EXISTS public.imprimerie_devis_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'imprimerie',
    devis_id UUID NOT NULL REFERENCES public.imprimerie_devis(id) ON DELETE CASCADE,
    prestation_id UUID REFERENCES public.imprimerie_prestations(id) ON DELETE SET NULL,
    designation VARCHAR(255) NOT NULL,
    mode_calcul VARCHAR(30) NOT NULL DEFAULT 'm2',
    largeur NUMERIC(10,3) DEFAULT 0,
    hauteur NUMERIC(10,3) DEFAULT 0,
    surface_m2 NUMERIC(10,3) DEFAULT 0,
    quantite NUMERIC(10,2) NOT NULL DEFAULT 1,
    prix_unitaire NUMERIC(15,2) NOT NULL DEFAULT 0,
    remise_pct NUMERIC(5,2) DEFAULT 0,
    montant_ht NUMERIC(15,2) NOT NULL DEFAULT 0,
    tva_pct NUMERIC(5,2) DEFAULT 0,
    montant_ttc NUMERIC(15,2) NOT NULL DEFAULT 0,
    details_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. COMMANDES DE PRODUCTION (OBJET CENTRAL DU SYSTÈME)
CREATE TABLE IF NOT EXISTS public.imprimerie_commandes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'imprimerie',
    numero_commande VARCHAR(50) NOT NULL,
    devis_id UUID REFERENCES public.imprimerie_devis(id) ON DELETE SET NULL,
    client_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    client_nom VARCHAR(255) NOT NULL,
    client_tel VARCHAR(100),
    titre_travail VARCHAR(255) NOT NULL,
    date_commande DATE NOT NULL DEFAULT CURRENT_DATE,
    date_livraison_prevue DATE,
    date_livraison_reelle TIMESTAMPTZ NULL,
    priorite VARCHAR(20) NOT NULL DEFAULT 'normale' CHECK (priorite IN ('normale', 'urgente', 'tres_urgente')),
    statut VARCHAR(30) NOT NULL DEFAULT 'nouveau' CHECK (statut IN (
        'nouveau', 'devis_accepte', 'a_concevoir', 'maquette_attente', 'maquette_validee',
        'en_production', 'en_impression', 'en_finition', 'termine', 'livre', 'annule'
    )),
    graphiste_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    graphiste_nom VARCHAR(255),
    fichier_url TEXT,
    instructions_graphiste TEXT,
    est_sous_traitee BOOLEAN NOT NULL DEFAULT false,
    sous_traitant_nom VARCHAR(255),
    sous_traitance_cout NUMERIC(15,2) NOT NULL DEFAULT 0,
    cout_matieres_prevu NUMERIC(15,2) NOT NULL DEFAULT 0,
    cout_matieres_reel NUMERIC(15,2) NOT NULL DEFAULT 0,
    cout_mo NUMERIC(15,2) NOT NULL DEFAULT 0,
    cout_finition NUMERIC(15,2) NOT NULL DEFAULT 0,
    cout_autres NUMERIC(15,2) NOT NULL DEFAULT 0,
    cout_revient_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ttc NUMERIC(15,2) NOT NULL DEFAULT 0,
    marge_reelle NUMERIC(15,2) NOT NULL DEFAULT 0,
    taux_marge_reel NUMERIC(6,2) NOT NULL DEFAULT 0,
    montant_acompte NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_paye NUMERIC(15,2) NOT NULL DEFAULT 0,
    solde_restant NUMERIC(15,2) NOT NULL DEFAULT 0,
    statut_paiement VARCHAR(20) NOT NULL DEFAULT 'non_paye' CHECK (statut_paiement IN ('non_paye', 'acompte', 'solde', 'credit')),
    notes_production TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_imprimerie_commande_num UNIQUE (company_id, sector_slug, numero_commande)
);

CREATE TABLE IF NOT EXISTS public.imprimerie_commande_lignes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'imprimerie',
    commande_id UUID NOT NULL REFERENCES public.imprimerie_commandes(id) ON DELETE CASCADE,
    prestation_id UUID REFERENCES public.imprimerie_prestations(id) ON DELETE SET NULL,
    designation VARCHAR(255) NOT NULL,
    mode_calcul VARCHAR(30) NOT NULL DEFAULT 'm2',
    largeur NUMERIC(10,3) DEFAULT 0,
    hauteur NUMERIC(10,3) DEFAULT 0,
    surface_m2 NUMERIC(10,3) DEFAULT 0,
    quantite NUMERIC(10,2) NOT NULL DEFAULT 1,
    prix_unitaire NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_ttc NUMERIC(15,2) NOT NULL DEFAULT 0,
    details_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. CONSOMMATION RÉELLE DES MATIÈRES, PERTES & CHUTES
CREATE TABLE IF NOT EXISTS public.imprimerie_consommations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'imprimerie',
    commande_id UUID NOT NULL REFERENCES public.imprimerie_commandes(id) ON DELETE CASCADE,
    matiere_id UUID NOT NULL REFERENCES public.imprimerie_matieres(id) ON DELETE CASCADE,
    quantite_prevue NUMERIC(15,3) NOT NULL DEFAULT 0,
    quantite_reelle NUMERIC(15,3) NOT NULL DEFAULT 0,
    ecart_perte NUMERIC(15,3) NOT NULL DEFAULT 0,
    cout_unitaire NUMERIC(15,2) NOT NULL DEFAULT 0,
    cout_total NUMERIC(15,2) NOT NULL DEFAULT 0,
    motif_perte VARCHAR(50) DEFAULT 'chute' CHECK (motif_perte IN (
        'chute', 'erreur_impression', 'defaut_matiere', 'mauvaise_manipulation', 'reimpression', 'autre'
    )),
    est_reimpression BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. SOUS-TRAITANCE DÉDIÉE
CREATE TABLE IF NOT EXISTS public.imprimerie_sous_traitance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'imprimerie',
    commande_id UUID REFERENCES public.imprimerie_commandes(id) ON DELETE SET NULL,
    fournisseur_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    fournisseur_nom VARCHAR(255) NOT NULL,
    prestation_nom VARCHAR(255) NOT NULL,
    description TEXT,
    quantite NUMERIC(10,2) NOT NULL DEFAULT 1,
    montant_ht NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_paye NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_restant NUMERIC(15,2) NOT NULL DEFAULT 0,
    statut VARCHAR(30) NOT NULL DEFAULT 'commande' CHECK (statut IN ('commande', 'en_cours', 'recu', 'paye', 'annule')),
    date_commande DATE NOT NULL DEFAULT CURRENT_DATE,
    date_livraison DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. PAIEMENTS & ACOMPTES (CAISSIÈRE INDÉPENDANTE)
CREATE TABLE IF NOT EXISTS public.imprimerie_paiements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'imprimerie',
    commande_id UUID REFERENCES public.imprimerie_commandes(id) ON DELETE SET NULL,
    caisse_id UUID NULL,
    session_caisse_id UUID NULL,
    client_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    montant NUMERIC(15,2) NOT NULL,
    mode_paiement VARCHAR(30) NOT NULL DEFAULT 'especes' CHECK (mode_paiement IN (
        'especes', 'momo_mtn', 'momo_moov', 'banque', 'cheque', 'credit'
    )),
    reference_recu VARCHAR(50) NOT NULL,
    caissier_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    caissier_nom VARCHAR(255),
    date_paiement TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    type_paiement VARCHAR(30) NOT NULL DEFAULT 'acompte' CHECK (type_paiement IN (
        'acompte', 'solde', 'partiel', 'vente_rapide'
    )),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. JOURNAL D'AUDIT DÉDIÉ
CREATE TABLE IF NOT EXISTS public.imprimerie_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug VARCHAR(100) NOT NULL DEFAULT 'imprimerie',
    user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    user_nom VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    module VARCHAR(50) NOT NULL,
    document_ref VARCHAR(100),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 10. INDEX POUR PERFORMANCES MAXIMALES
CREATE INDEX IF NOT EXISTS idx_imp_mat_comp_sec ON public.imprimerie_matieres(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_imp_pres_comp_sec ON public.imprimerie_prestations(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_imp_devis_comp_sec ON public.imprimerie_devis(company_id, sector_slug, statut);
CREATE INDEX IF NOT EXISTS idx_imp_cmd_comp_sec ON public.imprimerie_commandes(company_id, sector_slug, statut);
CREATE INDEX IF NOT EXISTS idx_imp_cmd_date ON public.imprimerie_commandes(date_commande DESC);
CREATE INDEX IF NOT EXISTS idx_imp_pai_comp_sec ON public.imprimerie_paiements(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_imp_cons_cmd ON public.imprimerie_consommations(commande_id);

-- 11. POLITIQUES RLS MULTI-TENANT ISOLÉES
ALTER TABLE public.imprimerie_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imprimerie_matieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imprimerie_prestations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imprimerie_prestation_matieres ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imprimerie_devis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imprimerie_devis_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imprimerie_commandes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imprimerie_commande_lignes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imprimerie_consommations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imprimerie_sous_traitance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imprimerie_paiements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imprimerie_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'imp_cfg_iso') THEN
        CREATE POLICY imp_cfg_iso ON public.imprimerie_config FOR ALL USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'imp_mat_iso') THEN
        CREATE POLICY imp_mat_iso ON public.imprimerie_matieres FOR ALL USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'imp_pres_iso') THEN
        CREATE POLICY imp_pres_iso ON public.imprimerie_prestations FOR ALL USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'imp_pres_mat_iso') THEN
        CREATE POLICY imp_pres_mat_iso ON public.imprimerie_prestation_matieres FOR ALL USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'imp_dev_iso') THEN
        CREATE POLICY imp_dev_iso ON public.imprimerie_devis FOR ALL USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'imp_dev_lig_iso') THEN
        CREATE POLICY imp_dev_lig_iso ON public.imprimerie_devis_lignes FOR ALL USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'imp_cmd_iso') THEN
        CREATE POLICY imp_cmd_iso ON public.imprimerie_commandes FOR ALL USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'imp_cmd_lig_iso') THEN
        CREATE POLICY imp_cmd_lig_iso ON public.imprimerie_commande_lignes FOR ALL USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'imp_con_iso') THEN
        CREATE POLICY imp_con_iso ON public.imprimerie_consommations FOR ALL USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'imp_st_iso') THEN
        CREATE POLICY imp_st_iso ON public.imprimerie_sous_traitance FOR ALL USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'imp_pai_iso') THEN
        CREATE POLICY imp_pai_iso ON public.imprimerie_paiements FOR ALL USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'imp_aud_iso') THEN
        CREATE POLICY imp_aud_iso ON public.imprimerie_audit_logs FOR ALL USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));
    END IF;
END $$;
