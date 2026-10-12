-- =============================================================================
-- GESTIO 229 SaaS — Migration M062 : Refonte Professionnelle Bar, Restaurant & Fast-Food
-- =============================================================================
-- Secteur : 'restaurant' / 'bar-restaurant-maquis' / 'bar' / 'maquis' / 'fastfood'
-- Couvre le cycle complet :
-- 1. Emplacements de stock (Cuisine, Bar, Réserve générale, Réserve boissons, Consommables)
-- 2. Sessions serveuses / serveurs & boissons confiées
-- 3. Versements & encaissements successifs par serveuse
-- 4. Clôtures de service avec écarts et justifications
-- 5. Fiches techniques enrichies avec déstockage atomique & idempotent
-- 6. Journal de présence & assiduité
-- 7. Registre confidentiel des plaintes & incidents du personnel
-- =============================================================================

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. SESSIONS DES SERVEUSES / SERVEURS & SUIVI DE SERVICE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_sessions_serveurs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    serveur_id UUID REFERENCES public.restaurant_serveurs(id) ON DELETE SET NULL,
    serveur_nom TEXT NOT NULL,
    date_session DATE NOT NULL DEFAULT CURRENT_DATE,
    heure_ouverture TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    heure_cloture TIMESTAMPTZ,
    fonds_initial NUMERIC(15,2) NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'OUVERTE' CHECK (statut IN ('OUVERTE', 'CLOTUREE', 'VERIFIEE')),
    total_boissons_confiees_ttc NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_ventes_declarees_ttc NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_versements_recus NUMERIC(15,2) NOT NULL DEFAULT 0,
    solde_restant_a_remettre NUMERIC(15,2) NOT NULL DEFAULT 0,
    ecart_financier NUMERIC(15,2) NOT NULL DEFAULT 0,
    justification_ecart TEXT,
    cloture_par TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rest_sessions_comp ON public.restaurant_sessions_serveurs(company_id, sector_slug, date_session DESC);
ALTER TABLE public.restaurant_sessions_serveurs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation_rest_sessions" ON public.restaurant_sessions_serveurs;
CREATE POLICY "company_isolation_rest_sessions" ON public.restaurant_sessions_serveurs FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. BOISSONS & PRODUITS CONFIÉS AUX SERVEUSES (Compte stock individuel)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_boissons_confiees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    session_id UUID NOT NULL REFERENCES public.restaurant_sessions_serveurs(id) ON DELETE CASCADE,
    serveur_nom TEXT NOT NULL,
    produit_id TEXT,
    produit_nom TEXT NOT NULL,
    qte_remise NUMERIC(10,2) NOT NULL DEFAULT 0,
    qte_retournee NUMERIC(10,2) NOT NULL DEFAULT 0,
    qte_vendue NUMERIC(10,2) NOT NULL DEFAULT 0,
    qte_offerte NUMERIC(10,2) NOT NULL DEFAULT 0,
    qte_cassee NUMERIC(10,2) NOT NULL DEFAULT 0,
    qte_restante_declaree NUMERIC(10,2) NOT NULL DEFAULT 0,
    prix_vente_unitaire NUMERIC(15,2) NOT NULL DEFAULT 0,
    cout_achat_unitaire NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_valeur_remise NUMERIC(15,2) NOT NULL DEFAULT 0,
    remis_par TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rest_confiees_session ON public.restaurant_boissons_confiees(session_id, company_id);
ALTER TABLE public.restaurant_boissons_confiees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation_rest_confiees" ON public.restaurant_boissons_confiees;
CREATE POLICY "company_isolation_rest_confiees" ON public.restaurant_boissons_confiees FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. VERSEMENTS SUCCESSIFS / ENCAISSEMENTS DES SERVEUSES AU GÉRANT
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_versements_serveurs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    session_id UUID NOT NULL REFERENCES public.restaurant_sessions_serveurs(id) ON DELETE CASCADE,
    reference TEXT UNIQUE DEFAULT concat('VMT-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    serveur_nom TEXT NOT NULL,
    montant NUMERIC(15,2) NOT NULL CHECK (montant > 0),
    mode_reglement TEXT NOT NULL DEFAULT 'ESPECES' CHECK (mode_reglement IN ('ESPECES', 'MTN_MOMO', 'MOOV_MONEY', 'CARTE', 'CHEQUE', 'AUTRE')),
    recu_par TEXT NOT NULL,
    solde_avant NUMERIC(15,2) NOT NULL DEFAULT 0,
    solde_apres NUMERIC(15,2) NOT NULL DEFAULT 0,
    date_versement TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    commentaire TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rest_versements_comp ON public.restaurant_versements_serveurs(company_id, session_id);
ALTER TABLE public.restaurant_versements_serveurs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation_rest_versements" ON public.restaurant_versements_serveurs;
CREATE POLICY "company_isolation_rest_versements" ON public.restaurant_versements_serveurs FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. REGISTRE DE PRÉSENCE, HORAIRES & ASSIDUITÉ
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_presences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    serveur_id UUID REFERENCES public.restaurant_serveurs(id) ON DELETE SET NULL,
    nom_complet TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'SERVEUR',
    date_presence DATE NOT NULL DEFAULT CURRENT_DATE,
    heure_prevue_arrivee TIME DEFAULT '17:00',
    heure_reelle_arrivee TIME,
    heure_depart TIME,
    statut TEXT NOT NULL DEFAULT 'PRESENT' CHECK (statut IN ('PRESENT', 'EN_SERVICE', 'EN_PAUSE', 'PARTI', 'RETARD', 'ABSENT', 'ABSENCE_JUSTIFIEE')),
    retard_minutes INT DEFAULT 0,
    enregistre_par TEXT NOT NULL,
    commentaire TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rest_presences_comp ON public.restaurant_presences(company_id, date_presence DESC);
ALTER TABLE public.restaurant_presences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation_rest_presences" ON public.restaurant_presences;
CREATE POLICY "company_isolation_rest_presences" ON public.restaurant_presences FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. REGISTRE CONFIDENTIEL DES PLAINTES & INCIDENTS DU PERSONNEL
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_plaintes_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    reference TEXT UNIQUE DEFAULT concat('INC-', to_char(NOW(), 'YYYYMMDD-HH24MISS')),
    personne_concernee TEXT NOT NULL,
    signale_par TEXT,
    type_incident TEXT NOT NULL CHECK (type_incident IN ('ERREUR_CAISSE', 'DISPUTE_CLIENT', 'RETARD_REPETE', 'CASSE_REPETEE', 'COMPORTEMENT', 'HYGIENE', 'COMMANDE_NON_LIVREE', 'AUTRE')),
    gravite TEXT NOT NULL DEFAULT 'MOYENNE' CHECK (gravite IN ('FAIBLE', 'MOYENNE', 'GRAVE', 'CRITIQUE')),
    description TEXT NOT NULL,
    date_incident DATE NOT NULL DEFAULT CURRENT_DATE,
    heure_incident TIME DEFAULT CURRENT_TIME,
    mesure_corrective TEXT,
    statut TEXT NOT NULL DEFAULT 'SIGNALÉ' CHECK (statut IN ('SIGNALÉ', 'EN_COURS', 'RÉSOLU', 'CLASSÉ_SANS_SUITE')),
    responsable_suivi TEXT,
    date_resolution DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rest_incidents_comp ON public.restaurant_plaintes_incidents(company_id, sector_slug);
ALTER TABLE public.restaurant_plaintes_incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation_rest_incidents" ON public.restaurant_plaintes_incidents;
CREATE POLICY "company_isolation_rest_incidents" ON public.restaurant_plaintes_incidents FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. DÉSTOCKAGE ATOMIQUE ET IDEMPOTENT DES MATIÈRES PREMIÈRES (CUISINE & BAR)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_destockage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    idempotency_key TEXT UNIQUE NOT NULL,
    order_id UUID,
    order_number TEXT NOT NULL,
    plat_nom TEXT NOT NULL,
    portion_qty NUMERIC(10,2) NOT NULL,
    matiere_nom TEXT NOT NULL,
    qte_destockee NUMERIC(10,3) NOT NULL,
    unite TEXT NOT NULL,
    cout_unitaire NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_cout NUMERIC(15,2) NOT NULL DEFAULT 0,
    emplacement TEXT NOT NULL DEFAULT 'CUISINE',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rest_destockage_order ON public.restaurant_destockage_log(company_id, order_number);
ALTER TABLE public.restaurant_destockage_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation_rest_destockage" ON public.restaurant_destockage_log;
CREATE POLICY "company_isolation_rest_destockage" ON public.restaurant_destockage_log FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. COLONNES DE FACILITÉ POUR LIGNES KDS (Numéro de commande, table, serveur)
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.restaurant_commande_lignes ADD COLUMN IF NOT EXISTS commande_numero TEXT;
ALTER TABLE public.restaurant_commande_lignes ADD COLUMN IF NOT EXISTS table_numero TEXT;
ALTER TABLE public.restaurant_commande_lignes ADD COLUMN IF NOT EXISTS serveur_nom TEXT;

-- FIN MIGRATION M062
