// =============================================================================
// GESTIO 229 — Secteur Microfinance & Tontine
// Module: Dashboard
// =============================================================================
// Isolation stricte : company_id + sector_slug='microfinance'
// Spécificités Microfinance :
// - Cotisations journalières (tontines)
// - Carnets de tontine par membre
// - Crédits et épargne solidaire
// - Tableau de bord financier spécialisé
// =============================================================================

export { DashboardPage as MicrofinanceDashboard } from '../../../pages/dashboard/DashboardPage'

export const MICROFINANCE_SECTOR_CONFIG = {
  slug: 'microfinance',
  name: 'Microfinance & Tontine',
  emoji: '🏦',
  color: '#14b8a6',
  modules: ['dashboard', 'caisse', 'clients', 'depenses', 'reporting', 'syscohada'],
  specificFeatures: [
    'Cotisations journalières par membre',
    'Carnets de tontine avec historique',
    'Crédits (capital + intérêts)',
    'Épargne solidaire et dividendes',
    'Clôture de tour de tontine'
  ],
  // Ce secteur n'a pas de stock physique - les 'produits' sont des services financiers
  noPhysicalStock: true,
}

export default MicrofinanceDashboard
