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


/**
 * =============================================================================
 * HELPER RÉSILIENT D'INSERTION ET DE MAPPING MULTI-TENANT STATION
 * =============================================================================
 * 1. Garantit l'injection systématique de company_id ET tenant_id
 * 2. Mappe les colonnes pour les rendre compatibles avec tous les schémas
 *    (capacite -> capacite_totale -> capacity_liters, fuel_type -> produit, etc.)
 * 3. En cas d'erreur de cache schéma PostgREST ("Could not find column..."),
 *    retire automatiquement la colonne absente et réessaie immédiatement.
 * 4. Valide et remonte un message explicite au lieu d'un plantage silencieux.
 */
export async function safeStationInsert(
  supabaseClient: any,
  table: string,
  rawPayload: Record<string, any>
): Promise<{ data: any; error: any }> {
  const payload: Record<string, any> = { ...rawPayload }

  // 1. Toujours injecter tenant_id et company_id
  const compId = payload.company_id || payload.tenant_id
  if (compId) {
    payload.company_id = compId
    payload.tenant_id = compId
  }

  // 2. Mappings spécifiques par table
  if (table === 'station_cuves') {
    const cap = payload.capacite_totale ?? payload.capacity_liters ?? payload.capacite
    if (cap !== undefined) {
      payload.capacite_totale = cap
      payload.capacity_liters = cap
      payload.capacite = cap
    }
    const fuel = payload.produit ?? payload.fuel_type ?? payload.nom
    if (fuel !== undefined) {
      payload.produit = fuel
      payload.fuel_type = fuel
    }
    const stock = payload.stock_actuel ?? payload.current_volume_liters ?? payload.stock_initial
    if (stock !== undefined) {
      payload.stock_actuel = stock
      payload.current_volume_liters = stock
      payload.stock_initial = payload.stock_initial ?? stock
      payload.stock_theorique = payload.stock_theorique ?? stock
    }
    const minAlert = payload.niveau_min ?? payload.min_alert_liters
    if (minAlert !== undefined) {
      payload.niveau_min = minAlert
      payload.min_alert_liters = minAlert
    }
  } else if (table === 'station_lubrifiants') {
    const des = payload.designation ?? payload.nom ?? payload.name ?? payload.reference
    if (des !== undefined) {
      payload.designation = des
      payload.nom = des
    }
  } else if (table === 'station_pompes') {
    const num = payload.numero_pompe ?? payload.nom ?? payload.code
    if (num !== undefined) {
      payload.numero_pompe = num
      payload.nom = num
    }
  }

  let currentPayload = { ...payload }
  let lastError: any = null

  // Tentative itérative avec nettoyage automatique des colonnes manquantes
  for (let attempt = 0; attempt < 12; attempt++) {
    const { data, error } = await supabaseClient
      .from(table)
      .insert(currentPayload)
      .select()

    if (!error) {
      return { data: Array.isArray(data) ? data[0] : data, error: null }
    }

    lastError = error

    // Détection de colonne absente du cache de schéma
    const match = error.message?.match(/Could not find the '([^']+)' column/)
    if (match && match[1]) {
      const missingCol = match[1]
      console.warn(`[safeStationInsert] Colonne absente "${missingCol}" sur "${table}", suppression et réessai...`)
      delete currentPayload[missingCol]
      continue
    }

    // Erreur de permission ou autre contrainte
    break
  }

  return { data: null, error: lastError }
}

/**
 * Mise à jour résiliente pour les tables station
 */
export async function safeStationUpdate(
  supabaseClient: any,
  table: string,
  id: string,
  rawPayload: Record<string, any>
): Promise<{ data: any; error: any }> {
  const payload: Record<string, any> = { ...rawPayload }

  let currentPayload = { ...payload }
  let lastError: any = null

  for (let attempt = 0; attempt < 8; attempt++) {
    const { data, error } = await supabaseClient
      .from(table)
      .update(currentPayload)
      .eq('id', id)
      .select()

    if (!error) {
      return { data: Array.isArray(data) ? data[0] : data, error: null }
    }

    lastError = error
    const match = error.message?.match(/Could not find the '([^']+)' column/)
    if (match && match[1]) {
      const missingCol = match[1]
      console.warn(`[safeStationUpdate] Colonne absente "${missingCol}" sur "${table}", suppression et réessai...`)
      delete currentPayload[missingCol]
      continue
    }

    break
  }

  return { data: null, error: lastError }
}
