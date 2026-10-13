-- =============================================================================
-- GESTIO 229 SaaS — Migration M062 & M063 CONSOLIDÉE : Secteur Bar, Restaurant & CHR
-- =============================================================================
-- Ce script tout-en-un crée dans l'ordre exact toutes les tables nécessaires :
-- 1. Table des sessions serveuses / serveurs
-- 2. Table des boissons confiées
-- 3. Table des versements successifs
-- 4. Table des présences & horaires
-- 5. Table des plaintes & incidents
-- 6. Table du déstockage cuisine
-- 7. Colonnes KDS sur les lignes de commande
-- 8. Colonnes circuits & confirmation 4 min
-- 9. Table des créances serveuses (liée aux sessions)
-- 10. Table des règlements de créances serveuses
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

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. COLONNES CIRCUITS SUR PRODUITS & COMMANDES RESTAURANT
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS restaurant_circuit TEXT DEFAULT 'BAR';
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS is_matiere_premiere BOOLEAN DEFAULT FALSE;

ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS circuit TEXT DEFAULT 'BAR';
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'CONFIRME';
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS created_by_name TEXT;
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS confirmation_expires_at TIMESTAMPTZ;
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
ALTER TABLE public.restaurant_commandes ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- ══════════════════════════════════════════════════════════════════════════════
-- 9. CRÉANCES INDIVIDUELLES PAR SERVEUSE
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_creances_serveuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'restaurant',
    session_id UUID REFERENCES public.restaurant_sessions_serveurs(id) ON DELETE SET NULL,
    order_id UUID,
    order_number TEXT NOT NULL,
    serveur_nom TEXT NOT NULL,
    circuit TEXT NOT NULL DEFAULT 'BAR',
    montant_initial NUMERIC(15,2) NOT NULL DEFAULT 0,
    montant_paye NUMERIC(15,2) NOT NULL DEFAULT 0,
    solde_restant NUMERIC(15,2) NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'NON_PAYE' CHECK (statut IN ('NON_PAYE', 'PARTIEL', 'PAYE', 'ANNULE')),
    consignes_bouteilles_dues INT NOT NULL DEFAULT 0,
    consignes_bouteilles_rendues INT NOT NULL DEFAULT 0,
    details JSONB,
    date_creation TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rest_creances_serv ON public.restaurant_creances_serveuses(company_id, serveur_nom, statut);
ALTER TABLE public.restaurant_creances_serveuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation_rest_creances" ON public.restaurant_creances_serveuses;
CREATE POLICY "company_isolation_rest_creances" ON public.restaurant_creances_serveuses FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- ══════════════════════════════════════════════════════════════════════════════
-- 10. RÈGLEMENTS DÉTAILLÉS DES CRÉANCES SERVEUSES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.restaurant_reglements_serveuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    creance_id UUID REFERENCES public.restaurant_creances_serveuses(id) ON DELETE CASCADE,
    serveur_nom TEXT NOT NULL,
    montant NUMERIC(15,2) NOT NULL DEFAULT 0,
    mode_reglement TEXT NOT NULL DEFAULT 'ESPECES',
    reference TEXT,
    recu_par TEXT,
    date_reglement TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rest_reglements_serv ON public.restaurant_reglements_serveuses(company_id, serveur_nom);
ALTER TABLE public.restaurant_reglements_serveuses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation_rest_reglements" ON public.restaurant_reglements_serveuses;
CREATE POLICY "company_isolation_rest_reglements" ON public.restaurant_reglements_serveuses FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- FIN SCRIPT COMPLET CHR
