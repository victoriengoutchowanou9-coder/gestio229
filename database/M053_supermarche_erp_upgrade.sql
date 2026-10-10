-- ==============================================================================
-- GESTIO 229 SAAS — M053 : TABLES MÉTIER SUPERMARCHÉ & SUPÉRETTE
-- Isolation stricte : (company_id + sector_slug='supermarche') + RLS activé
-- Compatible PostgreSQL / Supabase, zéro perte de données, idempotence totale
-- ==============================================================================

-- 1. Table Inventaires & Écarts Supermarché
CREATE TABLE IF NOT EXISTS public.supermarche_inventaires (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'supermarche',
    reference TEXT,
    rayon_nom TEXT NOT NULL,
    produit_nom TEXT NOT NULL,
    stock_theorique NUMERIC(15,2) NOT NULL DEFAULT 0,
    stock_physique NUMERIC(15,2) NOT NULL DEFAULT 0,
    ecart_qte NUMERIC(15,2) DEFAULT 0,
    valeur_ecart NUMERIC(15,2) DEFAULT 0,
    motif_ajustement TEXT NOT NULL,
    responsable TEXT,
    statut TEXT DEFAULT 'VALIDE', -- 'EN_COURS', 'VALIDE', 'REJETE'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.supermarche_inventaires ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.supermarche_inventaires ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'supermarche';
ALTER TABLE public.supermarche_inventaires ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_inventaires ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_inventaires ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.supermarche_inventaires;
CREATE POLICY "company_isolation" ON public.supermarche_inventaires FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- 2. Table Réapprovisionnement Intelligent
CREATE TABLE IF NOT EXISTS public.supermarche_reappro (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'supermarche',
    reference TEXT,
    produit_nom TEXT NOT NULL,
    fournisseur_nom TEXT NOT NULL,
    stock_actuel NUMERIC(15,2) NOT NULL DEFAULT 0,
    seuil_minimum NUMERIC(15,2) NOT NULL DEFAULT 0,
    quantite_suggeree NUMERIC(15,2) NOT NULL DEFAULT 0,
    prix_achat_estime NUMERIC(15,2) DEFAULT 0,
    urgence TEXT DEFAULT 'MOYEN', -- 'CRITIQUE', 'MOYEN', 'NORMAL'
    statut TEXT DEFAULT 'A_VALIDER', -- 'A_VALIDER', 'COMMANDE_TRANSMISE', 'REPORTE'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.supermarche_reappro ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.supermarche_reappro ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'supermarche';
ALTER TABLE public.supermarche_reappro ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_reappro ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_reappro ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.supermarche_reappro;
CREATE POLICY "company_isolation" ON public.supermarche_reappro FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- 3. Table Étiquettes de Prix & Codes-Barres
CREATE TABLE IF NOT EXISTS public.supermarche_etiquettes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'supermarche',
    code_barre TEXT NOT NULL,
    designation TEXT NOT NULL,
    rayon TEXT,
    prix_achat NUMERIC(15,2) NOT NULL DEFAULT 0,
    prix_vente NUMERIC(15,2) NOT NULL DEFAULT 0,
    marge_taux NUMERIC(6,2) DEFAULT 0,
    format_etiquette TEXT DEFAULT 'Rayon 50x30mm',
    nb_exemplaires INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.supermarche_etiquettes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.supermarche_etiquettes ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'supermarche';
ALTER TABLE public.supermarche_etiquettes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_etiquettes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_etiquettes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.supermarche_etiquettes;
CREATE POLICY "company_isolation" ON public.supermarche_etiquettes FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- 4. Table Programme Fidélité Clients
CREATE TABLE IF NOT EXISTS public.supermarche_fidelite (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'supermarche',
    client_nom TEXT NOT NULL,
    telephone TEXT NOT NULL,
    numero_carte TEXT,
    points_solde NUMERIC(12,2) DEFAULT 0,
    cumul_achats NUMERIC(15,2) DEFAULT 0,
    niveau TEXT DEFAULT 'BRONZE', -- 'BRONZE', 'ARGENT', 'OR', 'VIP'
    est_actif BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.supermarche_fidelite ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.supermarche_fidelite ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'supermarche';
ALTER TABLE public.supermarche_fidelite ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_fidelite ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_fidelite ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.supermarche_fidelite;
CREATE POLICY "company_isolation" ON public.supermarche_fidelite FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- 5. Table Alertes & Pilotage Gérant
CREATE TABLE IF NOT EXISTS public.supermarche_alertes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'supermarche',
    titre_alerte TEXT NOT NULL,
    type_alerte TEXT DEFAULT 'STOCK_CRITIQUE',
    priorite TEXT DEFAULT 'HAUTE', -- 'HAUTE', 'MOYENNE', 'FAIBLE'
    details TEXT,
    action_requise TEXT,
    statut TEXT DEFAULT 'A_TRAITER', -- 'A_TRAITER', 'EN_COURS', 'RESOLU'
    date_alerte DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.supermarche_alertes ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.supermarche_alertes ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'supermarche';
ALTER TABLE public.supermarche_alertes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_alertes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_alertes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.supermarche_alertes;
CREATE POLICY "company_isolation" ON public.supermarche_alertes FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- 6. Table Comparatif Fournisseurs
CREATE TABLE IF NOT EXISTS public.supermarche_comparatif_fournisseurs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'supermarche',
    produit_nom TEXT NOT NULL,
    fournisseur_nom TEXT NOT NULL,
    prix_unitaire_achat NUMERIC(15,2) NOT NULL DEFAULT 0,
    conditionnement TEXT DEFAULT 'Carton',
    delai_livraison_jours INT DEFAULT 2,
    frais_livraison NUMERIC(15,2) DEFAULT 0,
    qualite_note INT DEFAULT 5,
    recommande BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.supermarche_comparatif_fournisseurs ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.supermarche_comparatif_fournisseurs ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'supermarche';
ALTER TABLE public.supermarche_comparatif_fournisseurs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_comparatif_fournisseurs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_comparatif_fournisseurs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.supermarche_comparatif_fournisseurs;
CREATE POLICY "company_isolation" ON public.supermarche_comparatif_fournisseurs FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- 7. Table Performance Caissiers
CREATE TABLE IF NOT EXISTS public.supermarche_performance_caissiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    sector_slug TEXT NOT NULL DEFAULT 'supermarche',
    caissier_nom TEXT NOT NULL,
    date_session DATE DEFAULT CURRENT_DATE,
    nombre_tickets INT NOT NULL DEFAULT 0,
    montant_total_ventes NUMERIC(15,2) NOT NULL DEFAULT 0,
    panier_moyen NUMERIC(15,2) DEFAULT 0,
    ecart_caisse NUMERIC(15,2) DEFAULT 0,
    duree_session_heures NUMERIC(4,1) DEFAULT 8.0,
    appreciation TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.supermarche_performance_caissiers ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE;
ALTER TABLE public.supermarche_performance_caissiers ADD COLUMN IF NOT EXISTS sector_slug TEXT DEFAULT 'supermarche';
ALTER TABLE public.supermarche_performance_caissiers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_performance_caissiers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.supermarche_performance_caissiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "company_isolation" ON public.supermarche_performance_caissiers;
CREATE POLICY "company_isolation" ON public.supermarche_performance_caissiers FOR ALL
  USING (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1))
  WITH CHECK (company_id = (SELECT company_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1));

-- Index de performance & isolation multi-tenant
CREATE INDEX IF NOT EXISTS idx_supermarche_inv_c_s ON public.supermarche_inventaires(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_supermarche_reappro_c_s ON public.supermarche_reappro(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_supermarche_etiq_c_s ON public.supermarche_etiquettes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_supermarche_fid_c_s ON public.supermarche_fidelite(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_supermarche_alert_c_s ON public.supermarche_alertes(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_supermarche_comp_fourn_c_s ON public.supermarche_comparatif_fournisseurs(company_id, sector_slug);
CREATE INDEX IF NOT EXISTS idx_supermarche_perf_cais_c_s ON public.supermarche_performance_caissiers(company_id, sector_slug);
