// =============================================================================
// GESTIO 229 SaaS — Formatage Monétaire & Nombres Standardisé (UEMOA / FCFA)
// Règle : Toujours afficher avec séparateur de milliers et "FCFA"
// Exemples : 5700 => "5 700 FCFA", 1000000 => "1 000 000 FCFA"
// =============================================================================

/**
 * Formate un montant en Francs CFA avec séparateurs de milliers (format français/UEMOA)
 * Exemple: 5700 -> "5 700 FCFA", 1000000 -> "1 000 000 FCFA"
 */
export function formatFCFA(montant: number | string | null | undefined): string {
  if (montant === null || montant === undefined || isNaN(Number(montant))) {
    return '0 FCFA'
  }
  const num = Math.round(Number(montant))
  const formatted = new Intl.NumberFormat('fr-FR').format(num)
  return `${formatted} FCFA`
}

/**
 * Formate un nombre simple avec séparateurs de milliers
 * Exemple: 12500 -> "12 500"
 */
export function formatNumber(montant: number | string | null | undefined): string {
  if (montant === null || montant === undefined || isNaN(Number(montant))) {
    return '0'
  }
  const num = Math.round(Number(montant))
  return new Intl.NumberFormat('fr-FR').format(num)
}

/**
 * Résout de façon exhaustive et ordonnée les unités réelles de stock magasin (UCD) et de vente (UV).
 * Règle métier GESTIO 229 :
 * - Stock magasin : unité de stockage UCD (ex: 'Carton', 'Sac', 'Tonne', 'Casier', 'Fût', etc.)
 * - Stock vente : unité de vente UV (ex: 'Kg', 'Pièce', 'Bouteille', 'Sac', etc.)
 * - Si le produit est géré en unité unique, les deux stocks utilisent cette même unité.
 * - Ne jamais inventer une fausse unité ou forcer 'unités' si l'unité réelle est définie.
 */
export function resolveProductUnits(product: any): { unitVente: string; unitMagasin: string } {
  if (!product) return { unitVente: 'pièce', unitMagasin: 'carton' }

  const meta = product.sector_meta || {}

  // 1. Unité de vente (UV)
  const rawVente = (
    product.unite_vente ||
    product.uv ||
    meta.unite_vente ||
    meta.uv ||
    product.unit ||
    product.unite ||
    meta.unit ||
    meta.unite ||
    ''
  ).toString().trim()

  // 2. Unité de stockage / magasin (UCD)
  const rawMagasin = (
    product.unite_stock ||
    product.ucd ||
    meta.unite_stock ||
    meta.ucd ||
    meta.unit_magasin ||
    ''
  ).toString().trim()

  // Fallbacks respectueux :
  // Si UCD est absent, produit à unité unique -> réutiliser l'unité de vente
  // Si UV est absent, réutiliser l'unité magasin ou défaut 'pièce'
  const unitVente = rawVente || rawMagasin || 'pièce'
  const unitMagasin = rawMagasin || rawVente || 'carton'

  return { unitVente, unitMagasin }
}

/**
 * Formate une quantité de stock avec son unité de mesure réelle,
 * en respectant les abréviations invariables (kg, l, etc.) et le pluriel français.
 * Exemples :
 * - 17, "carton" -> "17 cartons"
 * - 1, "carton" -> "1 carton"
 * - 8, "kg" -> "8 kg"
 * - 15, "sac" -> "15 sacs"
 * - 24, "bouteille" -> "24 bouteilles"
 * - 0, "kg" -> "0 kg"
 */
export function formatStockWithUnit(qty: number | string | null | undefined, rawUnit?: string): string {
  const num = Number(qty) || 0
  const cleanNum = Math.round(num * 1000) / 1000
  const formattedNum = new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 3
  }).format(cleanNum)

  const u = (rawUnit || '').trim()
  if (!u) return formattedNum

  const lower = u.toLowerCase()

  // Abréviations courantes qui sont invariables en français
  const invariantUnits = [
    'kg', 'g', 'mg', 'l', 'cl', 'ml', 'm', 'cm', 'mm', 'km',
    't', 'tonne', 'tonnes', 'fcfa', 'f cfa', 'uv', 'ucd'
  ]

  if (invariantUnits.includes(lower)) {
    if (lower === 'tonne' || lower === 'tonnes') {
      return Math.abs(cleanNum) <= 1 ? `${formattedNum} tonne` : `${formattedNum} tonnes`
    }
    return `${formattedNum} ${lower}`
  }

  // Si quantité <= 1 ou unité déjà terminée par 's' ou 'x' (ex: "cartons", "sacs", "colis")
  if (Math.abs(cleanNum) <= 1 || lower.endsWith('s') || lower.endsWith('x')) {
    return `${formattedNum} ${lower}`
  }

  // Règle générale du pluriel
  return `${formattedNum} ${lower}s`
}

export default formatFCFA
