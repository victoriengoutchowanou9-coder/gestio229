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

  const rateTvaDec = appliquerTVA ? safeTauxTVA : 0
  const rateAibDec = appliquerAIB ? safeTauxAIB : 0

  let ht = totalTTC
  let tva = 0
  let aib = 0

  if (rateTvaDec > 0 || rateAibDec > 0) {
    // Formules exigées :
    // 1. TVA seule : HT = TTC / (1 + taux TVA)
    // 2. AIB seul : HT = TTC / (1 + taux AIB)
    // 3. TVA + AIB : HT = TTC / (1 + taux TVA + taux AIB)
    const divider = 1 + rateTvaDec + rateAibDec
    ht = Math.round(totalTTC / divider)
    tva = Math.round(ht * rateTvaDec)
    aib = Math.round(ht * rateAibDec)

    // Ajustement rigoureux des arrondis au franc près pour garantir : TTC = HT + TVA + AIB
    const diff = totalTTC - (ht + tva + aib)
    if (diff !== 0) {
      if (rateTvaDec > 0) {
        tva += diff
      } else if (rateAibDec > 0) {
        aib += diff
      }
    }
  }

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
