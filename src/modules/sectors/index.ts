// =============================================================================
// GESTIO 229 — Architecture Modules Secteurs
// Registre des 19 secteurs avec leurs configurations
// =============================================================================
// Ce fichier est le point d'entrée de l'architecture modulaire multi-secteurs.
// Chaque secteur a son propre sous-dossier dans /modules/sectors/[slug]/
//
// RÈGLE ABSOLUE :
// - Chaque secteur est un silo indépendant
// - Isolation : company_id + sector_slug sur toutes les requêtes
// - Un secteur ne voit JAMAIS les données d'un autre secteur
// =============================================================================

export interface SectorModule {
  slug: string
  name: string
  emoji: string
  color: string
  description: string
  // Chemin d'import dynamique pour lazy loading
  importDashboard: () => Promise<any>
}

/**
 * Registre des 19 secteurs et leurs modules isolés
 * Phase 1 : Tous les secteurs partagent le même code (re-export)
 * Phase 2 : Chaque secteur personnalise son propre code indépendamment
 */
export const SECTOR_MODULES: SectorModule[] = [
  {
    slug: 'boutique',
    name: 'Boutique & Magasin',
    emoji: '🏪',
    color: '#3b82f6',
    description: 'Vente au détail, prêt-à-porter, alimentation générale',
    importDashboard: () => import('./boutique/Dashboard'),
  },
  {
    slug: 'poissonnerie',
    name: 'Poissonnerie & Produits Frais',
    emoji: '🐟',
    color: '#06b6d4',
    description: 'Poissons congelés, viandes, volailles, chambres froides',
    importDashboard: () => import('./poissonnerie/Dashboard'),
  },
  {
    slug: 'supermarche',
    name: 'Supermarché & Supérette',
    emoji: '🛒',
    color: '#10b981',
    description: 'Multiples rayons, gestion DLC et promotions',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
  {
    slug: 'pharmacie',
    name: 'Pharmacie & Dépôt Médical',
    emoji: '💊',
    color: '#8b5cf6',
    description: 'Ordonnances, lots, péremptions et alertes santé',
    importDashboard: () => import('./pharmacie/Dashboard'),
  },
  {
    slug: 'restaurant',
    name: 'Bar, Restaurant, Maquis & Fast Food',
    emoji: '🍽️',
    color: '#ef4444',
    description: 'Tables, commandes cuisine, menus du jour',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
  {
    slug: 'quincaillerie',
    name: 'Quincaillerie & Matériaux',
    emoji: '🔨',
    color: '#f59e0b',
    description: 'Ciment, fer à béton, outillage, suivi chantiers',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
  {
    slug: 'brasserie',
    name: 'Brasserie & Dépôt de Boissons',
    emoji: '🍾',
    color: '#eab308',
    description: 'Casiers consignés, bouteilles pleines/vides, grossistes',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
  {
    slug: 'microfinance',
    name: 'Microfinance & Tontine',
    emoji: '🏦',
    color: '#14b8a6',
    description: 'Cotisations, carnets de tontine, crédits, épargne',
    importDashboard: () => import('./microfinance/Dashboard'),
  },
  {
    slug: 'imprimerie',
    name: 'Imprimerie & Sérigraphie',
    emoji: '🖨️',
    color: '#ec4899',
    description: 'Devis sur mesure, BAT, tirages offset/numérique',
    importDashboard: () => import('./imprimerie/Dashboard'),
  },
  {
    slug: 'boulangerie',
    name: 'Boulangerie & Pâtisserie',
    emoji: '🥐',
    color: '#d97706',
    description: 'Pains, viennoiseries, pâtisseries, gestion fournées',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
  {
    slug: 'cosmetiques',
    name: 'Cosmétiques & Salons de Beauté',
    emoji: '✨',
    color: '#f43f5e',
    description: 'Soins, produits de beauté, coiffure, esthétiques',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
  {
    slug: 'mercerie',
    name: 'Mercerie & Couture',
    emoji: '✂️',
    color: '#db2777',
    description: 'Tissus au mètre, boutons, commandes sur-mesure',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
  {
    slug: 'garage',
    name: 'Atelier, Garage & Mécanique',
    emoji: '🚗',
    color: '#64748b',
    description: 'Ordres de réparation, pièces détachées, devis',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
  {
    slug: 'hotel',
    name: 'Hôtel, Résidence & Auberge',
    emoji: '🏨',
    color: '#6366f1',
    description: 'Planning chambres, réservations, check-in/out',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
  {
    slug: 'ecole',
    name: 'École & Centre de Formation',
    emoji: '🎓',
    color: '#84cc16',
    description: 'Frais scolaires, effectifs élèves, reçus officiels',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
  {
    slug: 'immobilier',
    name: 'Gestion Locative & Immobilier',
    emoji: '🏠',
    color: '#a855f7',
    description: 'Contrats bail, loyers, quittances, relances',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
  {
    slug: 'agrobusiness',
    name: 'Agro-Business & Élevage',
    emoji: '🌱',
    color: '#22c55e',
    description: 'Production agricole, intrants, cheptel, récoltes',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
  {
    slug: 'station-service',
    name: 'Station-Service & Hydrocarbures',
    emoji: '⛽',
    color: '#f97316',
    description: 'Index pompes, cuves, postes pompistes, fûts',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
  {
    slug: 'transport',
    name: 'Transport & Logistique',
    emoji: '🚚',
    color: '#2563eb',
    description: 'Flotte véhicules, trajets, bordereaux livraison',
    importDashboard: () => import('./boutique/Dashboard'), // Phase 1: shared
  },
]

/**
 * Récupère la configuration d'un secteur par son slug
 */
export function getSectorModule(slug: string): SectorModule | undefined {
  return SECTOR_MODULES.find((s) => s.slug === slug.toLowerCase().trim())
}

export default SECTOR_MODULES
