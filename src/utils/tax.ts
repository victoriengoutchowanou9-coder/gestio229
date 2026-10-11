// =============================================================================
// GESTIO 229 SaaS — Module Centralisé de Calculs Fiscaux & Marges (Bénin & UEMOA)
// Règles strictes :
// 1. Saisie des prix en TTC
// 2. Conversion TTC -> HT : HT = TTC / (1 + Taux TVA) si soumis à TVA, sinon HT = TTC
// 3. Calcul de l'AIB EXCLUSIVEMENT sur la base HT : AIB = HT * Taux AIB (JAMAIS sur TTC)
// 4. Marges calculées sur la base HT
// 5. Gestion des conversions UCD <-> UV avec quantités décimales
// =============================================================================

export interface TaxCalculationResult {
  ttcPrice: number
  htPrice: number
  vatRate: number
  vatAmount: number
  isVatSubject: boolean
  aibRate: number
  aibAmount: number
  isAibSubject: boolean
  totalLineWithAib: number
}

/**
 * Calcule la décomposition fiscale à partir d'un montant TTC unitaire ou total
 */
export function calculateTaxFromTTC(
  ttc: number,
  isVatSubject: boolean = true,
  vatRate: number = 18,
  isAibSubject: boolean = false,
  aibRate: number = 1
): TaxCalculationResult {
  const safeTtc = Math.max(0, Number(ttc) || 0)
  const safeVatRate = isVatSubject ? Math.max(0, Number(vatRate) || 0) : 0
  const safeAibRate = isAibSubject ? Math.max(0, Number(aibRate) || 0) : 0

  const rateTvaDec = safeVatRate / 100
  const rateAibDec = safeAibRate / 100

  let ht = safeTtc
  let vatAmount = 0
  let aibAmount = 0

  if (rateTvaDec > 0 || rateAibDec > 0) {
    // Formules exigées :
    // 1. TVA seule : HT = TTC / (1 + taux TVA)
    // 2. AIB seul : HT = TTC / (1 + taux AIB)
    // 3. TVA + AIB : HT = TTC / (1 + taux TVA + taux AIB)
    const divider = 1 + rateTvaDec + rateAibDec
    ht = Math.round(safeTtc / divider)
    vatAmount = Math.round(ht * rateTvaDec)
    aibAmount = Math.round(ht * rateAibDec)

    // Ajustement rigoureux des arrondis au franc près pour garantir : TTC = HT + TVA + AIB
    const diff = safeTtc - (ht + vatAmount + aibAmount)
    if (diff !== 0) {
      if (rateTvaDec > 0) {
        vatAmount += diff
      } else if (rateAibDec > 0) {
        aibAmount += diff
      }
    }
  }

  return {
    ttcPrice: safeTtc,
    htPrice: ht,
    vatRate: isVatSubject ? safeVatRate : 0,
    vatAmount,
    isVatSubject,
    aibRate: isAibSubject ? safeAibRate : 0,
    aibAmount,
    totalLineWithAib: safeTtc,
  }
}

/**
 * Calcule la marge brute sur la base HT fiscale appropriée (considère TVA et AIB)
 */
export function calculateMargin(
  sellTtc: number,
  buyTtc: number,
  isVatSubject: boolean = true,
  vatRate: number = 18,
  isAibSubject: boolean = false,
  aibRate: number = 1
): {
  sellHt: number
  buyHt: number
  grossMargin: number
  marginRate: number
} {
  const sellTax = calculateTaxFromTTC(sellTtc, isVatSubject, vatRate, isAibSubject, aibRate)
  const buyTax = calculateTaxFromTTC(buyTtc, isVatSubject, vatRate, isAibSubject, aibRate)

  const sellHt = sellTax.htPrice
  const buyHt = buyTax.htPrice
  const grossMargin = Math.round((sellHt - buyHt) * 100) / 100
  const marginRate = sellHt > 0 ? Math.round(((grossMargin / sellHt) * 100) * 10) / 10 : 0

  return {
    sellHt,
    buyHt,
    grossMargin,
    marginRate,
  }
}

/**
 * Conversion UCD <-> UV (Unité de Conditionnement vers Unité de Vente)
 */
export function convertUvToUcd(uvQty: number, coefficient: number): number {
  const coeff = Number(coefficient) > 0 ? Number(coefficient) : 1
  return Math.round(((Number(uvQty) || 0) / coeff) * 10000) / 10000
}

export function convertUcdToUv(ucdQty: number, coefficient: number): number {
  const coeff = Number(coefficient) > 0 ? Number(coefficient) : 1
  return Math.round(((Number(ucdQty) || 0) * coeff) * 10000) / 10000
}

/**
 * Formatage monétaire FCFA
 */
export function formatFCFA(amount: number): string {
  return new Intl.NumberFormat('fr-BJ').format(Math.round(amount || 0)) + ' FCFA'
}
