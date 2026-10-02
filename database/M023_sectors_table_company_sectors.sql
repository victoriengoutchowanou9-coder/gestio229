-- =============================================================================
-- GESTIO 229 SaaS — Migration M023
-- Création des tables sectors (référentiel 19 secteurs) et company_sectors
-- NON DESTRUCTIVE : IF NOT EXISTS sur toutes les créations
-- =============================================================================
-- RÈGLE ABSOLUE : Ne jamais DROP de table. Ne jamais supprimer de données.
-- =============================================================================

-- ==============================================================
-- 1. TABLE GLOBALE sectors (référentiel immuable des 19 secteurs)
-- ==============================================================

CREATE TABLE IF NOT EXISTS sectors (
  slug         TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  icon         TEXT NOT NULL DEFAULT 'Store',
  emoji        TEXT DEFAULT '🏢',
  color        TEXT DEFAULT '#059669',
  description  TEXT DEFAULT '',
  category     TEXT DEFAULT 'Commerce',
  badge        TEXT DEFAULT 'Sous-Logiciel',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_sectors_is_active ON sectors(is_active);

-- ==============================================================
-- 2. SEED DES 19 SECTEURS OFFICIELS (INSERT OR IGNORE)
-- ==============================================================

INSERT INTO sectors (slug, name, icon, emoji, color, description, category, badge, is_active, sort_order) VALUES
  ('boutique',          'Boutique & Magasin',                 'Store',           '🏪', '#3b82f6', 'Vente au détail, prêt-à-porter, alimentation générale, bazar et accessoires.',                         'Commerce Détail',          'Commerce & Détail',      true,  1),
  ('poissonnerie',      'Poissonnerie & Produits Frais',      'Fish',            '🐟', '#06b6d4', 'Poissons congelés, viandes, volailles, gestion des cartons, pesées et chambres froides.',               'Alimentation & Frais',     'Surgelés & Frais',       true,  2),
  ('supermarche',       'Supermarché & Supérette',            'ShoppingBasket',  '🛒', '#10b981', 'Multiples rayons, douchette code-barres rapide, gestion des DLC et promotions.',                        'Grande Distribution',      'Grande Distribution',    true,  3),
  ('pharmacie',         'Pharmacie & Dépôt Médical',          'Pill',            '💊', '#8b5cf6', 'Gestion des ordonnances, numéros de lot, dates de péremption et alertes santé.',                        'Santé',                    'Santé & Médicaments',    true,  4),
  ('restaurant',        'Bar, Restaurant, Maquis & Fast Food','UtensilsCrossed', '🍽️','#ef4444', 'Gestion des tables, commandes cuisine, menus du jour, livraisons et boissons.',                         'Restauration',             'CHR & Fast Food',        true,  5),
  ('quincaillerie',     'Quincaillerie & Matériaux',          'Hammer',          '🔨', '#f59e0b', 'Ciment, fer à béton, outillage, plomberie, électricité, vente gros/détail et suivi chantiers.',         'BTP & Construction',       'Matériaux BTP',          true,  6),
  ('brasserie',         'Brasserie & Dépôt de Boissons',      'Wine',            '🍾', '#eab308', 'Gestion des casiers consignés, bouteilles pleines/vides et grossistes.',                                 'Boissons',                 'Dépôt Boissons',         true,  7),
  ('microfinance',      'Microfinance & Tontine',             'Banknote',        '🏦', '#14b8a6', 'Cotisations journalières, carnets de tontine, crédits et épargne solidaire.',                           'Services Financiers',      'Finance & Tontine',      true,  8),
  ('imprimerie',        'Imprimerie & Sérigraphie',           'Printer',         '🖨️','#ec4899', 'Devis sur mesure, suivi des BAT, tirages offset/numérique et sous-traitance.',                          'Industrie Graphique',      'Imprimerie & BAT',       true,  9),
  ('boulangerie',       'Boulangerie & Pâtisserie',           'Croissant',       '🥐', '#d97706', 'Pains, viennoiseries, pâtisseries, gestion des fournées et invendus.',                                  'Artisanat Alimentaire',    'Boulangerie & Pâtisserie', true, 10),
  ('cosmetiques',       'Cosmétiques & Salons de Beauté',     'Sparkles',        '✨', '#f43f5e', 'Prestations de soins, produits de beauté, coiffure et forfaits esthétiques.',                            'Beauté & Bien-être',       'Beauté & Soins',         true, 11),
  ('mercerie',          'Mercerie & Couture',                 'Scissors',        '✂️','#db2777', 'Tissus au mètre, boutons, fermetures, commandes sur-mesure et retouches.',                               'Mode & Couture',           'Mercerie & Couture',     true, 12),
  ('garage',            'Atelier, Garage & Mécanique',        'Car',             '🚗', '#64748b', 'Ordres de réparation, pièces détachées, devis mécanique et main d\'œuvre.',                             'Automobile',               'Mécanique Auto',         true, 13),
  ('hotel',             'Hôtel, Résidence & Auberge',         'BedDouble',       '🏨', '#6366f1', 'Planning des chambres, réservations, check-in/out, room-service et nuitées.',                           'Hôtellerie',               'Hébergement',            true, 14),
  ('ecole',             'École & Centre de Formation',        'GraduationCap',   '🎓', '#84cc16', 'Frais de scolarité, effectifs élèves, tranches de paiement et reçus officiels.',                         'Éducation',                'Éducation',              true, 15),
  ('immobilier',        'Gestion Locative & Immobilier',      'Home',            '🏠', '#a855f7', 'Contrats de bail, suivi des loyers mensuels, quittances et relances impayés.',                           'Immobilier',               'Immobilier & Baux',      true, 16),
  ('agrobusiness',      'Agro-Business & Élevage',            'Sprout',          '🌱', '#22c55e', 'Production agricole, intrants, provendes, cheptel, récoltes et ventes en gros.',                         'Agriculture & Élevage',    'Agro-Business',          true, 17),
  ('station-service',   'Station-Service & Hydrocarbures',    'Fuel',            '⛽', '#f97316', 'Index pompes, cuves, clôtures de postes pompistes, fûts et lubrifiants.',                                'Énergie & Carburants',     'Hydrocarbures',          true, 18),
  ('transport',         'Transport & Logistique',             'Truck',           '🚚', '#2563eb', 'Flotte de véhicules, suivi des trajets, bordereaux de livraison et fret.',                               'Transport & Logistique',   'Transport & Fret',       true, 19)
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  icon        = EXCLUDED.icon,
  emoji       = EXCLUDED.emoji,
  color       = EXCLUDED.color,
  description = EXCLUDED.description,
  category    = EXCLUDED.category,
  badge       = EXCLUDED.badge,
  sort_order  = EXCLUDED.sort_order,
  updated_at  = NOW();

-- ==============================================================
-- 3. TABLE company_sectors (secteurs souscrits par entreprise)
-- ==============================================================

CREATE TABLE IF NOT EXISTS company_sectors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sector_slug     TEXT NOT NULL REFERENCES sectors(slug) ON DELETE CASCADE,
  activated_at    TIMESTAMPTZ DEFAULT NOW(),
  is_active       BOOLEAN DEFAULT TRUE,
  configuration   JSONB DEFAULT '{}',
  UNIQUE(company_id, sector_slug)
);

-- Index pour performance
CREATE INDEX IF NOT EXISTS idx_company_sectors_company_id  ON company_sectors(company_id);
CREATE INDEX IF NOT EXISTS idx_company_sectors_sector_slug ON company_sectors(sector_slug);
CREATE INDEX IF NOT EXISTS idx_company_sectors_combo       ON company_sectors(company_id, sector_slug);

-- ==============================================================
-- 4. MIGRATION NON DESTRUCTIVE : Peupler company_sectors depuis
--    les champs existants companies.sectors / selected_sectors
-- ==============================================================

-- Pour chaque entreprise, insérer ses secteurs dans company_sectors
-- en lisant company.sectors[] et company.selected_sectors[]
-- On utilise jsonb_array_elements_text pour itérer sur les tableaux JSON

INSERT INTO company_sectors (company_id, sector_slug, activated_at)
SELECT DISTINCT
  c.id AS company_id,
  LOWER(TRIM(REPLACE(slug_raw, 'sec-', ''))) AS sector_slug,
  COALESCE(c.created_at, NOW()) AS activated_at
FROM companies c,
  LATERAL (
    SELECT jsonb_array_elements_text(
      CASE
        WHEN c.selected_sectors IS NOT NULL AND jsonb_array_length(to_jsonb(c.selected_sectors)) > 0
          THEN to_jsonb(c.selected_sectors)
        WHEN c.sectors IS NOT NULL AND jsonb_array_length(to_jsonb(c.sectors)) > 0
          THEN to_jsonb(c.sectors)
        ELSE '["boutique"]'::jsonb
      END
    ) AS slug_raw
  ) sub
WHERE EXISTS (
  SELECT 1 FROM sectors s WHERE s.slug = LOWER(TRIM(REPLACE(slug_raw, 'sec-', '')))
)
ON CONFLICT (company_id, sector_slug) DO NOTHING;

-- ==============================================================
-- 5. VÉRIFICATION POST-MIGRATION
-- ==============================================================

-- Afficher le nombre de secteurs enregistrés par entreprise
SELECT 
  c.name AS entreprise,
  c.id AS company_id,
  COUNT(cs.sector_slug) AS nb_secteurs,
  STRING_AGG(cs.sector_slug, ', ' ORDER BY cs.sector_slug) AS secteurs
FROM companies c
LEFT JOIN company_sectors cs ON cs.company_id = c.id
GROUP BY c.id, c.name
ORDER BY nb_secteurs DESC;
