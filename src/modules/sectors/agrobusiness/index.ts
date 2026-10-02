// =============================================================================
// GESTIO 229 SaaS — Sous-Logiciel Dédié: Agro-Business & Élevage
// =============================================================================

export const SECTOR_MANIFEST = {
  slug: 'agrobusiness',
  name: 'Agro-Business & Élevage',
  emoji: '🌱',
  color: '#22c55e',
  category: 'Agriculture & Élevage',
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
