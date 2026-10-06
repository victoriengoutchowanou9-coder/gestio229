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

export default formatFCFA
