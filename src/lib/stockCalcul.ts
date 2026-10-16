// =============================================================================
// GESTIO 229 SaaS — SOURCE UNIQUE DE CALCUL & VALORISATION DES STOCKS
// Norme Bénin & UEMOA (Double Stock : Magasin UCD & Vente Rayon UV)
// =============================================================================
// Ce module centralise TOUTES les règles et formules de calculs de valorisation
// et de conversion de stock pour l'ensemble des modules (StocksPage, Dashboard,
// Reporting, Modales, Vente POS, etc.).
//
// RÈGLES DE CALCUL OFFICIELLES (GESTIO 229) :
// 1. Stock Magasin (Réserve UCD) :
//    Valeur Stock Magasin Achat = stock_magasin * prix_achat_ucd
//
// 2. Stock Vente (Rayon POS UV) :
//    Valeur Stock Vente Commerciale = stock_vente * prix_vente_ttc
//    (Ne jamais utiliser prix_achat pour la valorisation commerciale de vente)
//
// 3. Valorisation Totale Achat :
//    Valorisation Totale Achat = (stock_magasin * prix_achat_ucd) + (stock_vente * prix_achat_uv)
//    Où prix_achat_uv = prix_achat_ucd / coef (si conversion réelle valide)
//
// 4. Valorisation Totale Vente :
//    Stock Magasin Converti en UV = stock_magasin * coef
//    Valorisation Totale Vente = (stock_magasin_converti_en_uv + stock_vente) * prix_vente_ttc
//
// 5. Gestion des Unités & Conversions (UCD -> UV) :
//    - 1 UCD = coef UV (ex: 1 Tonne = 20 Sacs de 50kg, 1 Carton = 24 Bouteilles, etc.)
//    - Respect strict des taux réels stockés par produit
//    - Si le coefficient est manquant, null ou <= 0, il n'est pas inventé et le ratio reste 1:1
// =============================================================================

export interface ProductStockInput {
  id?: string
  code?: string
  name?: string
  unit?: string
  ucd?: string
  uv?: string
  coef?: number | string | null
  cost_price?: number | string | null
  purchase_price?: number | string | null
  selling_price?: number | string | null
  selling_price_ttc?: number | string | null
  unit_price_ttc?: number | string | null
  wholesale_price?: number | string | null
  stock_magasin?: number | string | null
  stock_vente?: number | string | null
  current_stock?: number | string | null
  warehouse_stock?: number | string | null
  stock?: number | string | null
  min_stock_alert?: number | string | null
  sector_meta?: Record<string, any> | null
  batch_pricing?: Record<string, any> | null
  [key: string]: any
}

export interface NormalizedProductStock {
  id: string
  code: string
  name: string
  ucdUnit: string
  uvUnit: string
  coef: number
  hasValidConversion: boolean
  stockMagasin: number          // Quantité en UCD
  stockVente: number            // Quantité en UV
  stockMagasinConvertiUv: number // Magasin projeté en UV
  stockTotalUv: number          // Stock global unifié en UV
  prixAchatUcd: number          // Prix d'achat unitaire TTC de l'UCD
  prixAchatUv: number           // Prix d'achat unitaire de l'UV
  prixVenteTtc: number          // Prix de vente TTC de l'UV
}

export interface ProductValuationDetails {
  id: string
  code: string
  name: string
  ucdUnit: string
  uvUnit: string
  coef: number
  hasValidConversion: boolean
  stockMagasin: number
  stockVente: number
  stockMagasinConvertiUv: number
  stockTotalUv: number
  prixAchatUcd: number
  prixAchatUv: number
  prixVenteTtc: number
  // Valorisations
  valeurStockMagasinAchat: number  // stock_magasin * prix_achat_ucd
  valeurStockVente: number        // stock_vente * prix_vente_ttc (VALEUR COMMERCIALE)
  valeurStockVenteAchat: number   // stock_vente * prix_achat_uv (Coût d'achat)
  valorisationTotaleAchat: number // (stock_magasin * prix_achat_ucd) + (stock_vente * prix_achat_uv)
  valorisationTotaleVente: number // (stock_magasin_converti_uv + stock_vente) * prix_vente_ttc
  margePotentielleGlobale: number // valorisationTotaleVente - valorisationTotaleAchat
}

export interface StockValuationSummary {
  // Quantités
  totalMagasinQty: number        // Total UCD
  totalVenteQty: number          // Total UV
  totalStockMagasinConvertiUv: number // Magasin converti en UV
  totalStockUv: number           // Tout le stock disponible en UV

  // Valorisations
  totalMagasinValAchat: number   // Carte 1 : Stock Magasin (Réserve UCD) au coût d'achat
  totalVenteValVente: number     // Carte 2 : Stock Vente (Rayon POS UV) à la valeur commerciale TTC
  totalVenteValAchat: number     // Coût d'achat du stock vente (pour référence / analyse de marge)
  totalStockValAchat: number     // Carte 3 : Valorisation Totale Achat (Magasin UCD + Vente UV)
  totalStockValVente: number     // Carte 4 : Valorisation Totale Vente (Tout le stock converti en UV au prix de vente)

  // Marge & Références
  totalMargeTheoriqueVente: number // totalStockValVente - totalStockValAchat
  articlesCount: number
}

/**
 * Nettoie et extrait un nombre valide sans risquer NaN ou Infinity.
 */
export function safeNumber(val: any, fallback = 0): number {
  if (val === null || val === undefined || val === '') return fallback
  const parsed = Number(val)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Normalise un produit depuis n'importe quelle source (table Supabase, sector_meta, modal, etc.)
 */
export function normalizeProductStock(p: ProductStockInput): NormalizedProductStock {
  const meta = p?.sector_meta || {}
  const batch = p?.batch_pricing || meta.batch_pricing || {}

  // 1. Quantités réelles (priorité à la valeur non nulle si l'une des sources vaut 0 par défaut)
  const metaMag = safeNumber(meta.stock_magasin, 0)
  const colMag = p?.stock_magasin !== null && p?.stock_magasin !== undefined ? safeNumber(p.stock_magasin, 0) : null
  const stockMagasin = (colMag !== null && colMag > 0) ? colMag : (metaMag > 0 ? metaMag : Math.max(0, colMag ?? safeNumber(p?.warehouse_stock, 0)))

  const metaVente = safeNumber(meta.stock_vente, 0)
  const colVente = p?.stock_vente !== null && p?.stock_vente !== undefined ? safeNumber(p.stock_vente, 0) : null
  const stockVente = (colVente !== null && colVente > 0) ? colVente : (metaVente > 0 ? metaVente : Math.max(0, colVente ?? safeNumber(p?.current_stock ?? p?.stock, 0)))

  // 2. Taux de conversion réel UCD -> UV (ex: 1 tonne = 20 sacs, 1 carton = 24 paquets)
  const metaCoef = safeNumber(meta.coef ?? batch.coef, 0)
  const colCoef = safeNumber(p?.coef ?? p?.coefficient_conversion, 0)
  const parsedCoef = colCoef > 1 ? colCoef : (metaCoef > 1 ? metaCoef : (colCoef > 0 ? colCoef : (metaCoef > 0 ? metaCoef : 1)))
  const hasValidConversion = Number.isFinite(parsedCoef) && parsedCoef > 0
  const coef = hasValidConversion ? parsedCoef : 1

  // 3. Libellés des unités
  const ucdUnit = String(p?.ucd || meta.ucd || p?.unite_stock || 'Carton').trim() || 'Carton'
  const uvUnit = String(p?.uv || meta.uv || p?.unite_vente || p?.unit || 'Pièce').trim() || 'Pièce'

  // 4. Prix d'achat UCD (coût d'achat du carton, de la tonne, du sac de réserve)
  const prixAchatUcdRaw = p?.cost_price ?? p?.cout_achat ?? meta.price_achat_ucd_ttc ?? p?.purchase_price ?? meta.price_achat_ht ?? meta.cout_achat
  const prixAchatUcd = Math.max(0, safeNumber(prixAchatUcdRaw, 0))

  // 5. Prix d'achat UV (coût d'achat de l'unité de vente au détail)
  // Si explicitement configuré dans les métadonnées, on le priorise ; sinon, on applique rigoureusement prixAchatUcd / coef
  const explicitAchatUv = meta.price_achat_uv_ttc ?? meta.cout_achat_uv
  let prixAchatUv = 0
  if (explicitAchatUv !== undefined && explicitAchatUv !== null && explicitAchatUv !== '') {
    prixAchatUv = Math.max(0, safeNumber(explicitAchatUv, 0))
  } else if (hasValidConversion && coef > 0) {
    prixAchatUv = Math.round((prixAchatUcd / coef) * 1000) / 1000
  } else {
    prixAchatUv = prixAchatUcd
  }

  // 6. Prix de vente TTC unitaire (UV)
  const prixVenteTtcRaw = p?.selling_price ?? meta.price_vente_uv_ttc ?? p?.selling_price_ttc ?? p?.unit_price_ttc ?? meta.price_vente_ttc
  const prixVenteTtc = Math.max(0, safeNumber(prixVenteTtcRaw, 0))

  // 7. Conversions de stock
  const stockMagasinConvertiUv = hasValidConversion
    ? Math.round(stockMagasin * coef * 1000) / 1000
    : stockMagasin

  const stockTotalUv = Math.round((stockMagasinConvertiUv + stockVente) * 1000) / 1000

  return {
    id: String(p?.id || ''),
    code: String(p?.code || ''),
    name: String(p?.name || ''),
    ucdUnit,
    uvUnit,
    coef,
    hasValidConversion,
    stockMagasin,
    stockVente,
    stockMagasinConvertiUv,
    stockTotalUv,
    prixAchatUcd,
    prixAchatUv,
    prixVenteTtc,
  }
}

/**
 * RÈGLE 3.A : Valeur stock magasin achat = stock_magasin * prix_achat_ucd
 * Valorise le stock magasin au coût d'achat correspondant à l'unité UCD.
 */
export function calcValeurStockMagasinAchat(product: ProductStockInput): number {
  const norm = normalizeProductStock(product)
  return Math.round(norm.stockMagasin * norm.prixAchatUcd)
}

/**
 * RÈGLE 3.B : Valeur stock vente = stock_vente * prix_vente_ttc
 * La carte STOCK VENTE doit impérativement afficher la valeur commerciale du stock de vente.
 * Ne JAMAIS utiliser prix_achat pour cette valorisation commerciale.
 * Exemple : stock_vente = 19, prix_vente_ttc = 6 000 => 114 000 FCFA.
 */
export function calcValeurStockVente(product: ProductStockInput): number {
  const norm = normalizeProductStock(product)
  return Math.round(norm.stockVente * norm.prixVenteTtc)
}

/**
 * Coût d'achat du stock de vente rayon = stock_vente * prix_achat_uv
 * Utilisé pour le calcul rigoureux de la valorisation totale achat.
 */
export function calcValeurStockVenteAchat(product: ProductStockInput): number {
  const norm = normalizeProductStock(product)
  return Math.round(norm.stockVente * norm.prixAchatUv)
}

/**
 * RÈGLE 3.C : Valorisation totale achat = (stock_magasin * prix_achat_ucd) + (stock_vente * prix_achat_uv)
 * Utilise les prix d'achat correspondant réellement aux unités concernées sans mélanger UCD et UV.
 */
export function calcValorisationTotaleAchatProduit(product: ProductStockInput): number {
  const norm = normalizeProductStock(product)
  const valMagasin = norm.stockMagasin * norm.prixAchatUcd
  const valVente = norm.stockVente * norm.prixAchatUv
  return Math.round(valMagasin + valVente)
}

/**
 * RÈGLE 4 : Conversion UCD -> UV avec le taux réel du produit
 * Calcule le stock magasin converti en UV uniquement lorsque nécessaire sans double conversion.
 */
export function calcStockMagasinConvertiEnUv(product: ProductStockInput): number {
  const norm = normalizeProductStock(product)
  return norm.stockMagasinConvertiUv
}

/**
 * Stock total disponible exprimé en UV (rayon + magasin converti)
 */
export function calcStockTotalUv(product: ProductStockInput): number {
  const norm = normalizeProductStock(product)
  return norm.stockTotalUv
}

/**
 * RÈGLE 3.D : Valorisation totale vente = (stock_magasin_converti_en_uv + stock_vente) * prix_vente_ttc
 * Représente la valeur commerciale théorique de tout le stock disponible en magasin et rayon.
 */
export function calcValorisationTotaleVenteProduit(product: ProductStockInput): number {
  const norm = normalizeProductStock(product)
  return Math.round(norm.stockTotalUv * norm.prixVenteTtc)
}

/**
 * Fournit les détails complets de valorisation pour une ligne de produit.
 */
export function getProductValuationDetails(product: ProductStockInput): ProductValuationDetails {
  const norm = normalizeProductStock(product)
  const valeurStockMagasinAchat = Math.round(norm.stockMagasin * norm.prixAchatUcd)
  const valeurStockVente = Math.round(norm.stockVente * norm.prixVenteTtc)
  const valeurStockVenteAchat = Math.round(norm.stockVente * norm.prixAchatUv)
  const valorisationTotaleAchat = Math.round(valeurStockMagasinAchat + valeurStockVenteAchat)
  const valorisationTotaleVente = Math.round(norm.stockTotalUv * norm.prixVenteTtc)
  const margePotentielleGlobale = Math.round(valorisationTotaleVente - valorisationTotaleAchat)

  return {
    id: norm.id,
    code: norm.code,
    name: norm.name,
    ucdUnit: norm.ucdUnit,
    uvUnit: norm.uvUnit,
    coef: norm.coef,
    hasValidConversion: norm.hasValidConversion,
    stockMagasin: norm.stockMagasin,
    stockVente: norm.stockVente,
    stockMagasinConvertiUv: norm.stockMagasinConvertiUv,
    stockTotalUv: norm.stockTotalUv,
    prixAchatUcd: norm.prixAchatUcd,
    prixAchatUv: norm.prixAchatUv,
    prixVenteTtc: norm.prixVenteTtc,
    valeurStockMagasinAchat,
    valeurStockVente,
    valeurStockVenteAchat,
    valorisationTotaleAchat,
    valorisationTotaleVente,
    margePotentielleGlobale,
  }
}

/**
 * RÈGLE 5 : Calcul global harmonisé pour toutes les cartes et rapports.
 * Cette fonction est la source unique alimentant :
 * - Carte STOCK MAGASIN (Réserve UCD au coût d'achat)
 * - Carte STOCK VENTE (Rayon POS UV à la valeur commerciale de vente)
 * - Carte VALORISATION TOTALE ACHAT
 * - Carte VALORISATION TOTALE VENTE
 * - Les tableaux de bord et rapports financiers.
 */
export function calculateStockValuation(products: ProductStockInput[]): StockValuationSummary {
  const list = Array.isArray(products) ? products : []

  let totalMagasinQty = 0
  let totalVenteQty = 0
  let totalStockMagasinConvertiUv = 0
  let totalStockUv = 0

  let totalMagasinValAchat = 0
  let totalVenteValVente = 0
  let totalVenteValAchat = 0
  let totalStockValAchat = 0
  let totalStockValVente = 0

  for (const p of list) {
    const details = getProductValuationDetails(p)

    totalMagasinQty += details.stockMagasin
    totalVenteQty += details.stockVente
    totalStockMagasinConvertiUv += details.stockMagasinConvertiUv
    totalStockUv += details.stockTotalUv

    totalMagasinValAchat += details.valeurStockMagasinAchat
    totalVenteValVente += details.valeurStockVente
    totalVenteValAchat += details.valeurStockVenteAchat
    totalStockValAchat += details.valorisationTotaleAchat
    totalStockValVente += details.valorisationTotaleVente
  }

  // Arrondis monétaires propres
  totalMagasinQty = Math.round(totalMagasinQty * 1000) / 1000
  totalVenteQty = Math.round(totalVenteQty * 1000) / 1000
  totalStockMagasinConvertiUv = Math.round(totalStockMagasinConvertiUv * 1000) / 1000
  totalStockUv = Math.round(totalStockUv * 1000) / 1000

  totalMagasinValAchat = Math.round(totalMagasinValAchat)
  totalVenteValVente = Math.round(totalVenteValVente)
  totalVenteValAchat = Math.round(totalVenteValAchat)
  totalStockValAchat = Math.round(totalStockValAchat)
  totalStockValVente = Math.round(totalStockValVente)

  return {
    totalMagasinQty,
    totalVenteQty,
    totalStockMagasinConvertiUv,
    totalStockUv,
    totalMagasinValAchat,
    totalVenteValVente,
    totalVenteValAchat,
    totalStockValAchat,
    totalStockValVente,
    totalMargeTheoriqueVente: Math.round(totalStockValVente - totalStockValAchat),
    articlesCount: list.length,
  }
}

export default {
  safeNumber,
  normalizeProductStock,
  calcValeurStockMagasinAchat,
  calcValeurStockVente,
  calcValeurStockVenteAchat,
  calcValorisationTotaleAchatProduit,
  calcStockMagasinConvertiEnUv,
  calcStockTotalUv,
  calcValorisationTotaleVenteProduit,
  getProductValuationDetails,
  calculateStockValuation,
}
