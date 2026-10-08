// =============================================================================
// GESTIO 229 ERP — Moteur Centralisé de Calcul des Prix & Décomposition Fiscale
// =============================================================================
// RÈGLE MÉTIER ABSOLUE :
// 1. Le prix TTC est le prix final de vente au client (prix catalogue).
// 2. TOTAL_TTC = prix_ttc_unitaire * quantite (fixé AVANT toute décomposition).
// 3. Ni la TVA ni l'AIB ne doivent JAMAIS augmenter le TOTAL_TTC à payer par le client.
// 4. INTERDIT ABSOLU : HT + TVA + AIB = nouveau prix ou TTC + AIB.
// 5. netAPayer = TOTAL_TTC.
// =============================================================================

export const TVA_TAUX_DEFAUT = 0.18
export const AIB_TAUX_DEFAUT = 0.01

export interface DecompositionFiscaleResult {
  totalTTC: number
  ht: number
  tva: number
  aib: number
  netAPayer: number
}

/**
 * Décompose un prix TTC unitaire en ses composantes fiscales (HT, TVA, AIB, Net à payer).
 *
 * @param prixTTCUnitaire Prix unitaire TTC catalogue (doit être > 0 et fini)
 * @param qte Quantité vendue (doit être > 0)
 * @param appliquerTVA Booléen indiquant si la TVA s'applique
 * @param appliquerAIB Booléen indiquant si l'AIB s'applique
 * @param tauxTVA Taux de TVA décimal (ex: 0.18 = 18%) ou pourcentage si > 1 (ex: 18)
 * @param tauxAIB Taux d'AIB décimal (ex: 0.01 = 1%) ou pourcentage si > 1 (ex: 1 ou 5)
 */
export function decomposerTTC(
  prixTTCUnitaire: number,
  qte: number = 1,
  appliquerTVA: boolean = true,
  appliquerAIB: boolean = false,
  tauxTVA: number = TVA_TAUX_DEFAUT,
  tauxAIB: number = AIB_TAUX_DEFAUT
): DecompositionFiscaleResult {
  const pu = Number(prixTTCUnitaire)
  if (!Number.isFinite(pu) || pu <= 0) {
    throw new Error('Prix TTC du produit invalide.')
  }

  const q = Number(qte)
  const safeQte = Number.isFinite(q) && q > 0 ? q : 1

  // Normalisation des taux (supporte décimal 0.18/0.01 ou pourcentage 18/1/5)
  const safeTauxTVA = tauxTVA >= 1 ? tauxTVA / 100 : Math.max(0, Number(tauxTVA) || 0)
  const safeTauxAIB = tauxAIB >= 1 ? tauxAIB / 100 : Math.max(0, Number(tauxAIB) || 0)

  // 1. Total TTC fixé AVANT toute décomposition fiscale
  const totalTTC = Math.round(pu * safeQte * 100) / 100

  // 2. Décomposition TVA
  let htExact: number
  let tvaExact: number

  if (appliquerTVA && safeTauxTVA > 0) {
    htExact = totalTTC / (1 + safeTauxTVA)
    tvaExact = totalTTC - htExact
  } else {
    htExact = totalTTC
    tvaExact = 0
  }

  // 3. Calcul AIB sur la base HT uniquement
  let aibExact = 0
  if (appliquerAIB && safeTauxAIB > 0) {
    aibExact = htExact * safeTauxAIB
  }

  // Arrondis à 2 décimales pour la précision financière
  const ht = Math.round(htExact * 100) / 100
  const tva = Math.round(tvaExact * 100) / 100
  const aib = Math.round(aibExact * 100) / 100

  // Le net à payer reste STRICTEMENT le Total TTC
  const netAPayer = totalTTC

  return {
    totalTTC,
    ht,
    tva,
    aib,
    netAPayer,
  }
}
