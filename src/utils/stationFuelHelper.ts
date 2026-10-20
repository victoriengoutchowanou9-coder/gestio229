// =============================================================================
// GESTIO 229 — Détection et Classification Carburants vs Lubrifiants / Panier
// =============================================================================

export interface FuelPumpItem {
  id: string
  code_pistolet: string
  numero_pompe: string
  produit: string
  prix_actuel: number
  cuve_id?: string
  cuve_nom?: string
  stock_disponible?: number
  statut: string
}

export interface DefaultFuelType {
  id: string
  code_pistolet: string
  numero_pompe: string
  produit: string
  prix_actuel: number
  couleur_badge: string
}

export const DEFAULT_STATION_FUELS: DefaultFuelType[] = [
  {
    id: 'fuel-super',
    code_pistolet: 'P01-SUPER',
    numero_pompe: 'Pompe 01',
    produit: 'Essence Super',
    prix_actuel: 680,
    couleur_badge: 'emerald',
  },
  {
    id: 'fuel-gasoil',
    code_pistolet: 'P02-GASOIL',
    numero_pompe: 'Pompe 01',
    produit: 'Gasoil',
    prix_actuel: 700,
    couleur_badge: 'blue',
  },
  {
    id: 'fuel-petrole',
    code_pistolet: 'P03-PETROLE',
    numero_pompe: 'Pompe 02',
    produit: 'Pétrole Lampant',
    prix_actuel: 650,
    couleur_badge: 'amber',
  },
]

/**
 * Détermine si un produit correspond à un carburant distributeur en vrac (pompe)
 * ou à un article commercial (lubrifiants, accessoires, boutique).
 */
export function isFuelProduct(p: any): boolean {
  if (!p) return false

  // 1. Métadonnées explicites
  if (p.sector_meta?.is_carburant === true || p.is_carburant === true) return true
  if (p.sector_meta?.type_carburant && p.unit?.toLowerCase() === 'litre') return true

  // 2. Code article de carburant distributeur
  const code = (p.code || '').toUpperCase().trim()
  if (code.startsWith('CARB-') || code.startsWith('FUEL-') || code === 'CARB' || code === 'CARBURANT') {
    return true
  }

  // 3. Catégorie
  const categoryName = (
    p.category?.name ||
    p.category ||
    p.category_name ||
    ''
  ).toLowerCase().trim()

  if (
    categoryName === 'carburant' ||
    categoryName === 'carburants' ||
    categoryName === 'hydrocarbure' ||
    categoryName === 'hydrocarbures' ||
    categoryName === 'carburant distributeur'
  ) {
    return true
  }

  // 4. Analyse du nom du produit
  const name = (p.name || '').toLowerCase().trim()

  // Exclusion absolue des produits boutiques, additifs, filtres et huiles même s'ils mentionnent un carburant
  const boutiqueKeywords = [
    'huile', 'lubrifiant', 'graisse', 'additif', 'filtre',
    'nettoyant', 'liquide de frein', 'liquide de refroidissement',
    'lave-glace', 'accessoire', 'bidon', 'batterie', 'bougie'
  ]
  const isBoutiqueItem = boutiqueKeywords.some(kw => name.includes(kw))
  if (isBoutiqueItem) {
    return false
  }

  // Noms stricts de carburants distribués en pompe
  const pureFuelNames = [
    'essence super',
    'essence',
    'super',
    'super carburant',
    'gasoil',
    'gazole',
    'diesel',
    'pétrole lampant',
    'petrole lampant',
    'pétrole',
    'petrole'
  ]

  return pureFuelNames.some(fn => name === fn || name.startsWith(fn + ' ') || name.endsWith(' ' + fn))
}

/**
 * Calcul exact du montant à partir du volume et du prix au litre
 */
export function calculateAmountFromVolume(volume: number, unitPrice: number): number {
  if (!volume || volume <= 0 || !unitPrice || unitPrice <= 0) return 0
  return Math.round(volume * unitPrice)
}

/**
 * Calcul exact du volume à partir du montant et du prix au litre (arrondi à 2 décimales)
 */
export function calculateVolumeFromAmount(amount: number, unitPrice: number): number {
  if (!amount || amount <= 0 || !unitPrice || unitPrice <= 0) return 0
  return Math.round((amount / unitPrice) * 100) / 100
}
