// =============================================================================
// GESTIO 229 — Secteur Boutique & Magasin
// Module: Dashboard
// =============================================================================
// Ce fichier est la copie isolée du DashboardPage pour le secteur BOUTIQUE.
// Il peut évoluer indépendamment des autres secteurs.
// Isolation stricte : toutes les requêtes incluent company_id + sector_slug='boutique'
// =============================================================================

// Re-export du composant dashboard commun avec le contexte du secteur boutique
// Phase 1 : Partage du code commun (DashboardPage)
// Phase 2 (future) : Personnalisation spécifique à la boutique (modules métier dédiés)

import { DashboardPage as BoutiqueDashboard } from '../../../pages/dashboard/DashboardPage'
export { BoutiqueDashboard }

// Métadonnées du secteur boutique pour référence dans ce module
export const BOUTIQUE_SECTOR_CONFIG = {
  slug: 'boutique',
  name: 'Boutique & Magasin',
  emoji: '🏪',
  color: '#3b82f6',
  modules: ['dashboard', 'ventes', 'stock', 'caisse', 'clients', 'fournisseurs', 'depenses', 'reporting'],
  specificFeatures: [
    'Vente au détail multi-rayons',
    'Gestion des retours et avoirs',
    'Fidélisation clients',
    'Prêt-à-porter & accessoires'
  ]
}

export default BoutiqueDashboard
