// =============================================================================
// GESTIO 229 — Secteur Poissonnerie & Produits Frais
// Module: Dashboard
// =============================================================================
// Isolation stricte : toutes les requêtes incluent company_id + sector_slug='poissonnerie'
// Spécificités Poissonnerie :
// - Gestion par cartons et pesée (coef = Nb UV/carton)
// - Chambres froides et températures
// - Gestion des avaries et péremptions
// =============================================================================

import { DashboardPage as PoissonnerieDashboard } from '../../../pages/dashboard/DashboardPage'
export { PoissonnerieDashboard }

export const POISSONNERIE_SECTOR_CONFIG = {
  slug: 'poissonnerie',
  name: 'Poissonnerie & Produits Frais',
  emoji: '🐟',
  color: '#06b6d4',
  modules: ['dashboard', 'ventes', 'stock', 'caisse', 'clients', 'fournisseurs', 'depenses', 'reporting'],
  specificFeatures: [
    'Gestion par cartons (UCD) et pesée (UV kg)',
    'Chambres froides et températures',
    'Avaries frigorifiques et déchets',
    'Poissons congelés, viandes, volailles'
  ],
  unitDefaults: {
    ucd: 'Carton',
    uv: 'Kg',
    coefExample: 20, // 1 carton = 20 kg
  }
}

export default PoissonnerieDashboard
