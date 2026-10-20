-- ==============================================================================
-- GESTIO 229 SAAS — ACTIVATION RLS STRICTE & MODÈLE SECTOR_TEMPLATES
-- Date : 20 Octobre 2026
-- Résout le warning Supabase Security Advisor :
-- "Tableau accessible au public - rls_désactivé_en_public"
-- Projet : victoriengoutchowanou9-coder
-- ==============================================================================

-- ==============================================================================
-- 1. IDENTIFICATION ET ACTIVATION DYNAMIQUE DE RLS SUR TOUTES LES TABLES PUBLIQUES
-- Active automatiquement Row Level Security sur toute table du schéma public
-- ==============================================================================
DO $$
DECLARE
    r RECORD;
    cnt INT := 0;
BEGIN
    FOR r IN (
        SELECT tablename 
        FROM pg_tables 
        WHERE schemaname = 'public' 
          AND rowsecurity = false
    ) LOOP
        EXECUTE 'ALTER TABLE public.' || quote_ident(r.tablename) || ' ENABLE ROW LEVEL SECURITY;';
        cnt := cnt + 1;
        RAISE NOTICE 'Sécurité RLS activée sur la table : public.%', r.tablename;
    END LOOP;
    RAISE NOTICE 'Total de tables publiques sécurisées par RLS : %', cnt;
END $$;

-- ==============================================================================
-- 2. CRÉATION / ALIGNEMENT DES TABLES CORE MULTI-TENANT & TEMPLATES
-- ==============================================================================

-- A. Table sector_templates (Vérité unique par secteur d'activité)
CREATE TABLE IF NOT EXISTS public.sector_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sector_slug VARCHAR(100) UNIQUE NOT NULL,
    sector_name VARCHAR(255) NOT NULL,
    description TEXT,
    modules JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- B. Table modules (Référentiel des modules du catalogue SaaS)
CREATE TABLE IF NOT EXISTS public.modules (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    group_name VARCHAR(100) NOT NULL DEFAULT 'commercial',
    icon VARCHAR(100) DEFAULT 'Layers',
    route_path VARCHAR(255),
    is_common BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- C. Table tenants (Alias / Référentiel des comptes entreprises)
CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    sector VARCHAR(100) NOT NULL DEFAULT 'boutique',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- D. Table tenant_modules (Modules affectés à chaque tenant)
CREATE TABLE IF NOT EXISTS public.tenant_modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    module_id VARCHAR(100) NOT NULL,
    is_enabled BOOLEAN DEFAULT true,
    custom_name VARCHAR(255),
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, module_id)
);

-- E. Table abonnements (Souscriptions des tenants)
CREATE TABLE IF NOT EXISTS public.abonnements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    plan VARCHAR(100) NOT NULL DEFAULT 'pro',
    status VARCHAR(50) NOT NULL DEFAULT 'trial',
    starts_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '30 days'),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Activation explicite de RLS sur toutes ces tables
ALTER TABLE public.sector_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abonnements ENABLE ROW LEVEL SECURITY;

-- Synchronisation optionnelle des colonnes manquantes dans companies
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'companies' AND column_name = 'authorized_modules') THEN
        ALTER TABLE public.companies ADD COLUMN authorized_modules JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

-- ==============================================================================
-- 3. POLITIQUES DE SÉCURITÉ ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- A. Table sector_templates : Lecture publique pour tous, écriture réservée au service_role
DROP POLICY IF EXISTS "Lecture publique des templates secteur" ON public.sector_templates;
CREATE POLICY "Lecture publique des templates secteur"
ON public.sector_templates FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Service role write sector_templates" ON public.sector_templates;
CREATE POLICY "Service role write sector_templates"
ON public.sector_templates FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- B. Table modules : Lecture publique pour tous, écriture réservée au service_role
DROP POLICY IF EXISTS "Lecture publique des modules" ON public.modules;
CREATE POLICY "Lecture publique des modules"
ON public.modules FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Service role write modules" ON public.modules;
CREATE POLICY "Service role write modules"
ON public.modules FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- C. Table tenant_modules : Isolation étanche multi-tenant
DROP POLICY IF EXISTS "Tenant isolation" ON public.tenant_modules;
CREATE POLICY "Tenant isolation"
ON public.tenant_modules FOR ALL
USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID 
    OR tenant_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::UUID
    OR tenant_id = auth.uid()
    OR auth.role() = 'service_role'
)
WITH CHECK (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID 
    OR tenant_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::UUID
    OR tenant_id = auth.uid()
    OR auth.role() = 'service_role'
);

-- D. Table tenants : Isolation étanche
DROP POLICY IF EXISTS "Tenant self isolation" ON public.tenants;
CREATE POLICY "Tenant self isolation"
ON public.tenants FOR ALL
USING (
    id = (auth.jwt() ->> 'tenant_id')::UUID 
    OR id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::UUID
    OR id = auth.uid()
    OR auth.role() = 'service_role'
    OR auth.role() = 'anon'
);

-- E. Table abonnements : Isolation étanche
DROP POLICY IF EXISTS "Abonnement tenant isolation" ON public.abonnements;
CREATE POLICY "Abonnement tenant isolation"
ON public.abonnements FOR ALL
USING (
    tenant_id = (auth.jwt() ->> 'tenant_id')::UUID 
    OR tenant_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::UUID
    OR tenant_id = auth.uid()
    OR auth.role() = 'service_role'
);

-- ==============================================================================
-- 4. INSERTION DE LA VÉRITÉ UNIQUE : SECTOR_TEMPLATES POUR QUINCAILLERIE & AUTRES
-- Liste officielle ordonnée des 16 modules de Quincaillerie & Matériaux
-- ==============================================================================
INSERT INTO public.sector_templates (sector_slug, sector_name, description, modules, updated_at)
VALUES (
    'quincaillerie',
    'Quincaillerie & Matériaux de Construction',
    'Gestion complète quincaillerie, ciment, fers à béton, chantiers, camions et stocks lourds.',
    '[
      {"id": "dashboard", "name": "Tableau de bord", "order": 1, "group": "apercu"},
      {"id": "ventes", "name": "Vente & POS", "order": 2, "group": "commercial"},
      {"id": "stock", "name": "Stocks", "order": 3, "group": "commercial"},
      {"id": "caisse", "name": "Caisse", "order": 4, "group": "commercial"},
      {"id": "materiaux_btp", "name": "Ciment & Fers", "order": 5, "group": "commercial"},
      {"id": "suivi_chantiers", "name": "Chantiers & Camions", "order": 6, "group": "commercial"},
      {"id": "finances", "name": "Trésorerie", "order": 7, "group": "finance"},
      {"id": "clients", "name": "Clients & Créances", "order": 8, "group": "finance"},
      {"id": "depenses", "name": "Dépenses", "order": 9, "group": "finance"},
      {"id": "syscohada", "name": "Comptabilité SYSCOHADA", "order": 10, "group": "finance"},
      {"id": "fournisseurs", "name": "Fournisseurs & Achats", "order": 11, "group": "gestion"},
      {"id": "conversions_unites", "name": "Unités & Tonnes", "order": 12, "group": "gestion"},
      {"id": "rapports", "name": "Rapports & Analyses", "order": 13, "group": "admin"},
      {"id": "configuration", "name": "Configuration", "order": 14, "group": "admin"},
      {"id": "utilisateurs", "name": "Gestion Utilisateurs", "order": 15, "group": "admin"},
      {"id": "audit", "name": "Journal d''Audit", "order": 16, "group": "admin"}
    ]'::jsonb,
    now()
)
ON CONFLICT (sector_slug) 
DO UPDATE SET 
    sector_name = EXCLUDED.sector_name,
    modules = EXCLUDED.modules,
    updated_at = now();

-- Insertion des 16 modules dans le catalogue global modules
INSERT INTO public.modules (id, name, group_name, is_common) VALUES
    ('dashboard', 'Tableau de bord', 'apercu', true),
    ('ventes', 'Vente & POS', 'commercial', true),
    ('stock', 'Stocks', 'commercial', true),
    ('caisse', 'Caisse', 'commercial', true),
    ('materiaux_btp', 'Ciment & Fers', 'commercial', false),
    ('suivi_chantiers', 'Chantiers & Camions', 'commercial', false),
    ('finances', 'Trésorerie', 'finance', true),
    ('clients', 'Clients & Créances', 'finance', true),
    ('depenses', 'Dépenses', 'finance', true),
    ('syscohada', 'Comptabilité SYSCOHADA', 'finance', true),
    ('fournisseurs', 'Fournisseurs & Achats', 'gestion', true),
    ('conversions_unites', 'Unités & Tonnes', 'gestion', false),
    ('rapports', 'Rapports & Analyses', 'admin', true),
    ('configuration', 'Configuration', 'admin', true),
    ('utilisateurs', 'Gestion Utilisateurs', 'admin', true),
    ('audit', 'Journal d''Audit', 'admin', true)
ON CONFLICT (id) DO UPDATE SET 
    name = EXCLUDED.name,
    group_name = EXCLUDED.group_name;

-- ==============================================================================
-- 5. SYNCHRONISATION INITIALE POUR TOUS LES TENANTS DU SECTEUR QUINCAILLERIE
-- ==============================================================================
-- Synchronise la table companies existante
UPDATE public.companies
SET authorized_modules = '[
  "dashboard", "ventes", "stock", "caisse", "materiaux_btp", 
  "suivi_chantiers", "finances", "clients", "depenses", 
  "syscohada", "fournisseurs", "conversions_unites", 
  "rapports", "configuration", "utilisateurs", "audit"
]'::jsonb
WHERE active_sector = 'quincaillerie' 
   OR (sectors::text LIKE '%quincaillerie%')
   OR (selected_sectors::text LIKE '%quincaillerie%');

-- Synchronise également la table tenants et tenant_modules
INSERT INTO public.tenants (id, name, sector, is_active)
SELECT id, name, 'quincaillerie', true
FROM public.companies
WHERE active_sector = 'quincaillerie' 
   OR (sectors::text LIKE '%quincaillerie%')
ON CONFLICT (id) DO UPDATE SET sector = 'quincaillerie';

-- Affectation des 16 modules dans tenant_modules pour chaque entreprise quincaillerie
INSERT INTO public.tenant_modules (tenant_id, module_id, is_enabled, display_order)
SELECT 
    c.id as tenant_id,
    m.id as module_id,
    true as is_enabled,
    m.ord as display_order
FROM public.companies c
CROSS JOIN (
    VALUES 
        ('dashboard', 1),
        ('ventes', 2),
        ('stock', 3),
        ('caisse', 4),
        ('materiaux_btp', 5),
        ('suivi_chantiers', 6),
        ('finances', 7),
        ('clients', 8),
        ('depenses', 9),
        ('syscohada', 10),
        ('fournisseurs', 11),
        ('conversions_unites', 12),
        ('rapports', 13),
        ('configuration', 14),
        ('utilisateurs', 15),
        ('audit', 16)
) AS m(id, ord)
WHERE c.active_sector = 'quincaillerie' 
   OR (c.sectors::text LIKE '%quincaillerie%')
   OR (c.selected_sectors::text LIKE '%quincaillerie%')
ON CONFLICT (tenant_id, module_id) DO UPDATE SET 
    is_enabled = true,
    display_order = EXCLUDED.display_order;

-- ==============================================================================
-- 6. VÉRIFICATION DU RÉSULTAT
-- ==============================================================================
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('tenant_modules', 'modules', 'sector_templates', 'tenants', 'abonnements', 'companies', 'sectors');
