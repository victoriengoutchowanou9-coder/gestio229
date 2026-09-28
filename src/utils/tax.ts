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
  const safeVatRate = Math.max(0, Number(vatRate) || 0)
  const safeAibRate = Math.max(0, Number(aibRate) || 0)

  let ht = safeTtc
  let vatAmount = 0

  if (isVatSubject && safeVatRate > 0) {
    // Formule OHADA / Bénin : HT = TTC / (1 + Taux/100)
    ht = Math.round((safeTtc / (1 + safeVatRate / 100)) * 100) / 100
    vatAmount = Math.round((safeTtc - ht) * 100) / 100
  }

  let aibAmount = 0
  if (isAibSubject && safeAibRate > 0) {
    // L'AIB est calculé EXCLUSIVEMENT sur le montant HT (Règle Fiscale Bénin DGI)
    aibAmount = Math.round((ht * (safeAibRate / 100)) * 100) / 100
  }

  return {
    ttcPrice: safeTtc,
    htPrice: ht,
    vatRate: isVatSubject ? safeVatRate : 0,
    vatAmount,
    isVatSubject,
    aibRate: isAibSubject ? safeAibRate : 0,
    aibAmount,
    isAibSubject,
    totalLineWithAib: Math.round((safeTtc + aibAmount) * 100) / 100,
  }
}

/**
 * Calcule la marge brute sur la base HT fiscale appropriée
 */
export function calculateMargin(
  sellTtc: number,
  buyTtc: number,
  isVatSubject: boolean = true,
  vatRate: number = 18
): {
  sellHt: number
  buyHt: number
  grossMargin: number
  marginRate: number
} {
  const sellTax = calculateTaxFromTTC(sellTtc, isVatSubject, vatRate)
  const buyTax = calculateTaxFromTTC(buyTtc, isVatSubject, vatRate)

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
