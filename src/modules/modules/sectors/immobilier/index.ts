// =============================================================================
// GESTIO 229 SaaS — Sous-Logiciel Dédié: Gestion Locative & Immobilier
// =============================================================================

export const SECTOR_MANIFEST = {
  slug: 'immobilier',
  name: 'Gestion Locative & Immobilier',
  emoji: '🏠',
  color: '#a855f7',
  category: 'Immobilier',
  modules: [
    'Dashboard',
    'Vente',
    'Stocks',
    'Caisse',
    'Tresorerie',
    'Clients',
    'Fournisseurs',
    'Depenses',
    'Reporting'
  ]
}

export { default as Dashboard } from './Dashboard'
export { default as Vente } from './Vente'
export { default as Stocks } from './Stocks'
export { default as Caisse } from './Caisse'
export { default as Tresorerie } from './Tresorerie'
export { default as Clients } from './Clients'
export { default as Fournisseurs } from './Fournisseurs'
export { default as Depenses } from './Depenses'
export { default as Reporting } from './Reporting'

export default SECTOR_MANIFEST
