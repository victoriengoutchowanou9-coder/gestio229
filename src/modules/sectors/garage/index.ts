// =============================================================================
// GESTIO 229 SaaS — Sous-Logiciel Dédié: Atelier, Garage & Mécanique
// =============================================================================

export const SECTOR_MANIFEST = {
  slug: 'garage',
  name: 'Atelier, Garage & Mécanique',
  emoji: '🚗',
  color: '#64748b',
  category: 'Automobile',
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
