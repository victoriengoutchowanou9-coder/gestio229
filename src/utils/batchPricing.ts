// =============================================================================
// GESTIO 229 SaaS — Moteur de Calcul des Tarifs par Lot (Norme UCD / UV)
// Conforme CDC : Calculs rigoureux, détection automatique des paliers UV et
// valorisation de ligne à la vente.
// =============================================================================

export interface BatchPricingConfig {
  enabled: boolean
  coef: number
  price_half_ucd_ttc?: number     // 1/2 UCD
  price_third_ucd_ttc?: number    // 1/3 UCD
  price_quarter_ucd_ttc?: number  // 1/4 UCD
  price_sixth_ucd_ttc?: number    // 1/6 UCD
  price_eighth_ucd_ttc?: number   // 1/8 UCD
  price_twelfth_ucd_ttc?: number  // 1/12 UCD
  price_sixteenth_ucd_ttc?: number// 1/16 UCD
  price_ucd_ttc?: number          // 1 UCD
  price_uv_ttc?: number           // 1 UV
}

export interface BatchTierItem {
  key: keyof Omit<BatchPricingConfig, 'enabled' | 'coef'>
  fraction: string
  label: string
  denominator: number
  uvQty: number
  priceTtc: number
}

export interface BatchMatchResult {
  isMatched: boolean
  matchedTierLabel?: string
  uvQtyForTier?: number
  tierPriceTtc?: number
  effectiveUnitPriceTtc: number
  totalLineTtc: number
  pricingType: 'batch_tier' | 'standard_uv'
}

/**
 * Formate une quantité UV pour affichage propre (ex: 5, 2,5, 1,25, 0,625, 3,333)
 */
export const formatUvQty = (val: number): string => {
  if (isNaN(val) || val <= 0) return '0'
  if (Number.isInteger(val)) return String(val)
  return Number(val.toFixed(3)).toString().replace('.', ',')
}

/**
 * Génère la liste des paliers configurables selon le coefficient UCD/UV
 */
export const getBatchTiersList = (
  coef: number,
  config?: Partial<BatchPricingConfig>
): BatchTierItem[] => {
  const safeCoef = Number(coef) > 0 ? Number(coef) : 1

  const definitions: Array<{
    key: keyof Omit<BatchPricingConfig, 'enabled' | 'coef'>
    fraction: string
    label: string
    denom: number
  }> = [
    { key: 'price_half_ucd_ttc', fraction: '1/2', label: '1/2 UCD', denom: 2 },
    { key: 'price_third_ucd_ttc', fraction: '1/3', label: '1/3 UCD', denom: 3 },
    { key: 'price_quarter_ucd_ttc', fraction: '1/4', label: '1/4 UCD', denom: 4 },
    { key: 'price_sixth_ucd_ttc', fraction: '1/6', label: '1/6 UCD', denom: 6 },
    { key: 'price_eighth_ucd_ttc', fraction: '1/8', label: '1/8 UCD', denom: 8 },
    { key: 'price_twelfth_ucd_ttc', fraction: '1/12', label: '1/12 UCD', denom: 12 },
    { key: 'price_sixteenth_ucd_ttc', fraction: '1/16', label: '1/16 UCD', denom: 16 },
    { key: 'price_ucd_ttc', fraction: '1', label: 'UCD Entier', denom: 1 },
    { key: 'price_uv_ttc', fraction: 'UV', label: '1 UV Détail', denom: safeCoef }, // 1 UV
  ]

  return definitions.map((d) => {
    const uvQty = d.denom === 1 ? safeCoef : (d.key === 'price_uv_ttc' ? 1 : Math.round((safeCoef / d.denom) * 1000) / 1000)
    const priceVal = config && config[d.key] !== undefined ? Number(config[d.key]) : 0
    return {
      key: d.key,
      fraction: d.fraction,
      label: d.label,
      denominator: d.denom,
      uvQty,
      priceTtc: isNaN(priceVal) ? 0 : priceVal,
    }
  })
}

/**
 * Détermine le prix TTC et le prix unitaire effectif lors de la saisie d'une quantité UV à la vente.
 * RÈGLE CDC :
 * - Si qty UV correspond à un palier préenregistré -> Appliquer le Prix TTC du palier
 * - Si qty UV ne correspond à aucun palier -> Quantité UV × Prix Vente UV TTC
 */
export const calculateBatchLinePrice = (
  qtyUv: number,
  config: BatchPricingConfig | undefined,
  defaultUvPriceTtc: number
): BatchMatchResult => {
  const safeQty = Number(qtyUv) > 0 ? Number(qtyUv) : 0
  const baseUvPrice = (config?.price_uv_ttc && config.price_uv_ttc > 0)
    ? config.price_uv_ttc
    : defaultUvPriceTtc

  if (!config || !config.enabled || safeQty <= 0) {
    const total = Math.round(safeQty * baseUvPrice)
    return {
      isMatched: false,
      effectiveUnitPriceTtc: baseUvPrice,
      totalLineTtc: total,
      pricingType: 'standard_uv',
    }
  }

  const tiers = getBatchTiersList(config.coef, config)

  // Chercher un palier qui correspond exactement à la quantité UV saisie (avec marge d'arrondi 0.005)
  const matched = tiers.find(
    (t) => t.priceTtc > 0 && (Math.abs(t.uvQty - safeQty) < 0.005 || Math.round(t.uvQty * 1000) === Math.round(safeQty * 1000))
  )

  if (matched && matched.priceTtc > 0) {
    const tierPrice = matched.priceTtc
    const effectiveUnit = safeQty > 0 ? tierPrice / safeQty : tierPrice

    return {
      isMatched: true,
      matchedTierLabel: `Tarif ${matched.label} (${formatUvQty(matched.uvQty)} UV)`,
      uvQtyForTier: matched.uvQty,
      tierPriceTtc: tierPrice,
      effectiveUnitPriceTtc: effectiveUnit,
      totalLineTtc: tierPrice,
      pricingType: 'batch_tier',
    }
  }

  // Aucun tarif préenregistré correspondant -> Quantité UV × Prix Vente UV TTC
  const total = Math.round(safeQty * baseUvPrice)
  return {
    isMatched: false,
    effectiveUnitPriceTtc: baseUvPrice,
    totalLineTtc: total,
    pricingType: 'standard_uv',
  }
}
